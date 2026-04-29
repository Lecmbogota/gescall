const ariService = require('./ariService');
const redis = require('../config/redisClient');
const { STATUS, fromAsteriskState } = require('../config/callStatus');
const pg = require('../config/pgDatabase');
const loadHopper = require('../scripts/loadToRedisHopper');
const callerIdRotation = require('./callerIdRotationService');
const metrics = require('./metricsService');
const webhooks = require('./webhookService');

class RedisDialerEngine {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.hopperIntervalId = null;
        this.checkIntervalMs = parseInt(process.env.DIALER_INTERVAL_MS) || 1000;
        this.maxConcurrentCalls = parseInt(process.env.DIALER_MAX_CONCURRENT) || 100;
        this.maxCps = parseInt(process.env.DIALER_MAX_CPS) || 30;

        // CPS Tracking
        this.lastCpsReset = Date.now();
        this.callsThisSecond = 0;

        // Tick counter
        this.tickCount = 0;

        // Campaign cache
        this._campaignCache = null;
        this._campaignCacheTime = 0;
        this._campaignCacheTTL = 10000; // 10 seconds

        // Logging throttle
        this._logEveryNTicks = 10;

        // Active call count cache (refreshed each tick via key counting)
        this._activeCountCache = {};

        console.log(`[RedisDialer] Initialized. Interval: ${this.checkIntervalMs}ms, Max Concurrent: ${this.maxConcurrentCalls}, Max CPS: ${this.maxCps}`);

        // Validate SBC config on init
        this.sbcEndpoint = process.env.SBC_ENDPOINT || 'sbc233';
        this.sbcHost = process.env.SBC_HOST;
        this.sbcPort = process.env.SBC_PORT || '5060';
        this.sbcPrefix = process.env.SBC_PREFIX || '1122';

        if (!this.sbcHost) {
            console.error('[RedisDialer] ⚠️  WARNING: SBC_HOST not set in .env — calls will fail!');
        }
        console.log(`[RedisDialer] SBC: PJSIP/${this.sbcEndpoint} → ${this.sbcHost}:${this.sbcPort} (prefix: ${this.sbcPrefix})`);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[RedisDialer] Starting Core Engine Loop...');

        // Clean all stale call keys on start
        redis.keys('gescall:call:*').then(keys => {
            if (keys && keys.length > 0) {
                console.log(`[RedisDialer] Clearing ${keys.length} stuck call keys from previous crash...`);
                redis.del(keys).catch(err => console.error('[RedisDialer] Error clearing keys:', err.message));
            }
        }).catch(err => console.error('[RedisDialer] Failed to clear keys:', err.message));

        this.intervalId = setInterval(() => this.tick(), this.checkIntervalMs);

        // Hopper loader every 10 seconds
        this.hopperIntervalId = setInterval(async () => {
            const result = await loadHopper();
            if (result && result.count > 0) {
                console.log(`[RedisDialer] 🔄 Hopper: +${result.count} leads`);
            }
        }, 10000);

        // ARI auto-reconnect check every 10 seconds
        this.ariReconnectId = setInterval(() => {
            const ari = ariService.getClient();
            if (!ari) {
                console.warn('[RedisDialer] ⚠️  ARI disconnected — attempting reconnect...');
                ariService.init && ariService.init().catch(err => {
                    console.error('[RedisDialer] ARI reconnect failed:', err.message);
                });
            }
        }, 10000);

        // Health check log every 60 seconds
        this.healthCheckId = setInterval(async () => {
            try {
                const ari = ariService.getClient();
                const callKeys = await redis.keys('gescall:call:*');
                const hopperMexico = await redis.lLen('gescall:hopper:MEXICO').catch(() => 0);
                console.log(`[HealthCheck] ARI: ${ari ? '✓' : '✗'} | Active calls: ${callKeys?.length || 0} | Hopper: ${hopperMexico}`);
            } catch (e) { /* skip */ }
        }, 60000);
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        clearInterval(this.intervalId);
        clearInterval(this.hopperIntervalId);
        clearInterval(this.ariReconnectId);
        clearInterval(this.healthCheckId);
        console.log('[RedisDialer] Stopped.');
    }

    /**
     * Get active campaigns with caching (TTL=10s)
     */
    async getActiveCampaigns() {
        const now = Date.now();
        if (this._campaignCache && (now - this._campaignCacheTime) < this._campaignCacheTTL) {
            return this._campaignCache;
        }
        const { rows } = await pg.query(`
            SELECT campaign_id, dial_prefix, dial_method, campaign_cid 
            FROM gescall_campaigns 
            WHERE active = true AND dial_method = 'RATIO'
        `);
        this._campaignCache = rows;
        this._campaignCacheTime = now;
        return rows;
    }

    /**
     * Get active call count for a campaign by counting actual Redis keys.
     * Keys have 3-min TTL so stale ones auto-expire — NO COUNTER DRIFT possible.
     */
    async getActiveCount(campaignId) {
        try {
            const keys = await redis.keys(`gescall:call:${campaignId}:*`);
            return keys ? keys.length : 0;
        } catch (err) {
            return 0;
        }
    }

    async tick() {
        if (!this.isRunning || this.isTicking) return;
        this.isTicking = true;

        try {
            this.tickCount++;

            const ari = ariService.getClient();
            if (!ari) return;

            // SBC throttle check — skip origination if SBC is overloaded
            if (metrics.isSbcThrottled()) return;

            // Cached campaign query
            const campaigns = await this.getActiveCampaigns();
            if (!campaigns || campaigns.length === 0) return;

            const shouldLog = this.tickCount % this._logEveryNTicks === 0;
            let totalLaunchedThisTick = 0;

            for (const camp of campaigns) {
                if (totalLaunchedThisTick >= this.maxCps) break;

                // Count ACTUAL call keys — drift-free by design (keys have 3-min TTL)
                const activeCount = await this.getActiveCount(camp.campaign_id);

                let maxToPopCps = this.maxCps - totalLaunchedThisTick;
                if (this.checkIntervalMs < 1000) {
                    maxToPopCps = Math.ceil((this.maxCps - totalLaunchedThisTick) * (this.checkIntervalMs / 1000));
                }

                let availableSlots = this.maxConcurrentCalls - activeCount;
                availableSlots = Math.min(availableSlots, maxToPopCps);

                if (shouldLog) {
                    console.log(`[RedisDialer] ${camp.campaign_id}: ${activeCount} active, ${availableSlots} slots`);
                }

                if (availableSlots <= 0) continue;

                // Pop leads from Redis Hopper
                const listKey = `gescall:hopper:${camp.campaign_id}`;
                let leadsJson = [];

                try {
                    leadsJson = await redis.lPopCount(listKey, availableSlots);
                } catch (e) {
                    for (let i = 0; i < availableSlots; i++) {
                        const l = await redis.lPop(listKey);
                        if (!l) break;
                        leadsJson.push(l);
                    }
                }

                if (!leadsJson || leadsJson.length === 0) continue;

                totalLaunchedThisTick += leadsJson.length;

                if (shouldLog || leadsJson.length >= 10) {
                    console.log(`[RedisDialer] Launching ${leadsJson.length} calls for ${camp.campaign_id}`);
                }

                // Throttled originate: batch of 5 with micro-delay
                const BATCH = 5;
                for (let i = 0; i < leadsJson.length; i += BATCH) {
                    const batch = leadsJson.slice(i, i + BATCH);
                    for (const leadStr of batch) {
                        try {
                            const lead = JSON.parse(leadStr);
                            this.launchCall(ari, lead, camp);
                        } catch (parseErr) {
                            console.error('[RedisDialer] Parse error:', parseErr.message);
                        }
                    }
                    if (i + BATCH < leadsJson.length) {
                        await new Promise(r => setTimeout(r, 50));
                    }
                }
            }
        } catch (error) {
            console.error('[RedisDialer] Core Loop Error:', error.message);
        } finally {
            this.isTicking = false;
        }
    }

    async launchCall(ari, lead, campaign) {
        try {
            // Quick status check
            const dialableStatuses = ['NEW', 'QUEUE', STATUS.DIALING];
            try {
                const { rows } = await pg.query(
                    'SELECT status FROM gescall_leads WHERE lead_id = $1',
                    [lead.lead_id]
                );
                if (rows.length > 0 && !dialableStatuses.includes(rows[0].status)) {
                    return;
                }
            } catch (checkErr) { /* proceed */ }

            const prefix = campaign.dial_prefix || '';
            const channel = ari.Channel();
            const channelId = channel.id;

            // KEY FORMAT: gescall:call:CAMPAIGN:channelId — enables counting by campaign
            const callKey = `gescall:call:${campaign.campaign_id}:${channelId}`;

            // Store state in Redis (with TTL) + insert DIALING record in parallel
            await Promise.all([
                redis.hSet(callKey, {
                    lead_id: lead.lead_id,
                    list_id: lead.list_id || 999,
                    campaign_id: campaign.campaign_id,
                    phone_number: lead.phone_number,
                    status: STATUS.DIALING,
                    start_time: Date.now(),
                    channel_id: channelId
                }).then(() => redis.expire(callKey, 180)), // 3-min TTL — self-cleaning
                pg.query(`
                    INSERT INTO gescall_call_log 
                    (lead_id, phone_number, campaign_id, list_id, call_date, call_status, call_duration, dtmf_pressed) 
                    VALUES ($1, $2, $3, $4, NOW(), '${STATUS.DIALING}', 0, '0')
                `, [lead.lead_id, lead.phone_number, campaign.campaign_id, lead.list_id || 999])
            ]);

            // Track CPS + metrics
            metrics.recordOriginated();
            metrics.recordSuccessfulOriginate();
            webhooks.callStarted(campaign.campaign_id, lead.lead_id, lead.phone_number);
            const now = Date.now();
            if (now - this.lastCpsReset >= 1000) {
                this.callsThisSecond = 1;
                this.lastCpsReset = now;
            } else {
                this.callsThisSecond++;
            }

            // Event listeners — use callKey (campaign-scoped)
            channel.on('ChannelStateChange', async (event, ch) => {
                await redis.hSet(callKey, 'status', ch.state).catch(() => { });
                if (ch.state === 'Up') metrics.recordAnswered();
            });

            channel.on('ChannelDestroyed', async (event, ch) => {
                try {
                    const callData = await redis.hGetAll(callKey);
                    if (callData && callData.lead_id) {
                        let finalStatus, dtmf = '0', duration;

                        if (callData.ari_handled === 'YES') {
                            finalStatus = callData.final_status || STATUS.HANGUP;
                            dtmf = callData.final_dtmf || '0';
                            duration = parseInt(callData.final_duration || '0');
                        } else {
                            const astState = callData.status || 'FAILED';
                            finalStatus = fromAsteriskState(astState);
                            if (astState === 'FAILED') finalStatus = STATUS.FAILED;
                            duration = callData.start_time
                                ? Math.floor((Date.now() - parseInt(callData.start_time)) / 1000)
                                : 0;
                        }

                        // Parallel DB updates + Redis cleanup (just DEL — no counter to decrement!)
                        await Promise.all([
                            pg.query(`
                                UPDATE gescall_leads 
                                SET status = $1, called_count = called_count + 1, last_call_time = NOW() 
                                WHERE lead_id = $2
                            `, [finalStatus, callData.lead_id]),
                            pg.query(`
                                UPDATE gescall_call_log 
                                SET call_status = $1, call_duration = $2, dtmf_pressed = $3
                                WHERE lead_id = $4 AND call_status = '${STATUS.DIALING}'
                                AND call_date >= NOW() - INTERVAL '10 minutes'
                            `, [finalStatus, duration, dtmf, callData.lead_id]),
                            redis.del(callKey)
                        ]);

                        console.log(`[RedisDialer] ✓ lead=${callData.lead_id} ${finalStatus} ${duration}s dtmf=${dtmf}`);
                        metrics.recordDuration(duration);
                        webhooks.callCompleted(callData.campaign_id, callData.lead_id, callData.phone_number, finalStatus, duration, dtmf);
                    }
                } catch (e) {
                    console.error(`[RedisDialer] Finalize error ${ch.id}:`, e.message);
                }
            });

            // Originate — direct PJSIP bypasses Local channels
            const sbcEndpoint = process.env.SBC_ENDPOINT || 'sbc233';
            const sbcHost = process.env.SBC_HOST || '190.242.45.3';
            const sbcPort = process.env.SBC_PORT || '5060';
            const sbcPrefix = process.env.SBC_PREFIX || '1122';
            const fullNumber = `${prefix}${lead.phone_number}`;
            const endpoint = `PJSIP/${sbcEndpoint}/sip:${sbcPrefix}${fullNumber}@${sbcHost}:${sbcPort}`;

            // CallerID rotation
            let cid = campaign.campaign_cid || '0000000000';
            try {
                const rotatedCid = await callerIdRotation.getCallerId(campaign.campaign_id, lead.phone_number);
                if (rotatedCid) cid = rotatedCid;
            } catch (cidErr) { /* fallback */ }

            channel.originate({
                endpoint,
                app: 'gescall-ivr',
                appArgs: 'outbound',
                callerId: `"${cid}" <${cid}>`,
                variables: {
                    leadid: lead.lead_id,
                    campaign_id: campaign.campaign_id,
                    phone_number: lead.phone_number,
                    GESCALL_NATIVE: 'YES',
                    __GESCALL_CID: cid
                }
            }).catch(async (err) => {
                console.error(`[RedisDialer] ✗ Originate ${lead.phone_number}: ${err.message}`);
                metrics.recordFailedOriginate();
                try {
                    await Promise.all([
                        pg.query(`
                            UPDATE gescall_call_log 
                            SET call_status = '${STATUS.FAILED}', call_duration = 0
                            WHERE lead_id = $1 AND call_status = '${STATUS.DIALING}'
                            AND call_date >= NOW() - INTERVAL '10 minutes'
                        `, [lead.lead_id]),
                        pg.query(`
                            UPDATE gescall_leads 
                            SET status = '${STATUS.FAILED}', called_count = called_count + 1, last_call_time = NOW() 
                            WHERE lead_id = $1
                        `, [lead.lead_id]),
                        redis.del(callKey)
                    ]);
                } catch (cleanupErr) {
                    console.error(`[RedisDialer] Cleanup failed:`, cleanupErr.message);
                }
            });

        } catch (error) {
            console.error(`[RedisDialer] Setup failed lead ${lead.lead_id}:`, error.message);
        }
    }
}

module.exports = new RedisDialerEngine();
