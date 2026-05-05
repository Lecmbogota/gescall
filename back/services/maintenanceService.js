/**
 * GesCall Maintenance Jobs
 * Periodic tasks: cleanup stuck leads, retry failed calls, health checks
 */
const pg = require('../config/pgDatabase');
const redis = require('../config/redisClient');
const { queryClickHouse } = require('../config/clickhouse');
const loadHopper = require('../scripts/loadToRedisHopper');

class MaintenanceService {
    constructor() {
        this.intervals = [];
    }

    start() {
        console.log('[Maintenance] Starting periodic jobs...');

        // Every 60s: Cleanup stuck DIALING leads
        this.intervals.push(setInterval(() => this.cleanupStuckLeads(), 60 * 1000));

        // Every 2s: Load Hopper with fresh Leads for the fast Go Dialer
        this.intervals.push(setInterval(async () => {
            try {
                const result = await loadHopper();
                if (result && result.count > 0) {
                    // console.log(`[Maintenance] 🔄 Hopper: +${result.count} leads`); // Muted to reduce spam
                }
            } catch (err) {
                console.error('[Maintenance] Error loading hopper:', err.message);
            }
        }, 2 * 1000));

        // Every 5 min: Retry failed leads
        this.intervals.push(setInterval(() => this.retryFailedLeads(), 5 * 60 * 1000));

        // Every 2 min: Cleanup stale Redis keys
        this.intervals.push(setInterval(() => this.cleanupStaleRedisKeys(), 2 * 60 * 1000));

        // Every 3 min: Auto-deactivate exhausted campaigns
        this.intervals.push(setInterval(() => this.autoDeactivateExhaustedCampaigns(), 3 * 60 * 1000));

        // Every 24 hours: Archive old call logs to ClickHouse to prevent Postgres bloat
        this.intervals.push(setInterval(() => this.archiveOldCallLogs(), 24 * 60 * 60 * 1000));

        // Run immediately on start
        setTimeout(() => this.cleanupStuckLeads(), 5000);
        setTimeout(() => this.cleanupStaleRedisKeys(), 10000);
        setTimeout(() => this.retryFailedLeads(), 5000); // Trigger retries immediately safely
        setTimeout(async () => {
            const result = await loadHopper();
            if (result && result.count > 0) {
                console.log(`[Maintenance] 🔄 Hopper init: +${result.count} leads`);
            }
        }, 8000);
    }

    stop() {
        this.intervals.forEach(i => clearInterval(i));
        this.intervals = [];
    }

    /**
     * Reset leads stuck in DIALING/QUEUE for more than 5 minutes → FAILED
     */
    async cleanupStuckLeads() {
        try {
            const result = await pg.query(`
                UPDATE gescall_leads 
                SET status = 'FAILED', called_count = called_count + 1
                WHERE status IN ('DIALING', 'QUEUE')
                AND last_call_time < NOW() - INTERVAL '5 minutes'
                AND last_call_time IS NOT NULL
            `);

            // Reset QUEUE leads never dialed only when their campaign is inactive (avoid
            // fighting the hopper every minute while a campaign is actively dialing).
            const result2 = await pg.query(`
                UPDATE gescall_leads l
                SET status = 'NEW'
                FROM gescall_lists ls
                JOIN gescall_campaigns c ON ls.campaign_id = c.campaign_id
                WHERE l.list_id = ls.list_id
                  AND l.status = 'QUEUE'
                  AND l.last_call_time IS NULL
                  AND c.active = false
            `);

            // Update corresponding call_log entries
            await pg.query(`
                UPDATE gescall_call_log 
                SET call_status = 'FAILED', call_duration = 0
                WHERE call_status = 'DIALING'
                AND call_date < NOW() - INTERVAL '5 minutes'
            `);

            const total = (result.rowCount || 0) + (result2.rowCount || 0);
            if (total > 0) {
                console.log(`[Maintenance] 🧹 Cleaned ${result.rowCount} stuck leads → FAILED, ${result2.rowCount} orphan QUEUE → NEW`);
            }
        } catch (err) {
            console.error('[Maintenance] Cleanup error:', err.message);
        }
    }

    /**
     * Retry logic: Reset FAILED/NA/DROP leads for re-dialing
     * Rules:
     *   - Max attempts per lead driven by c.max_retries (default 3 if null)
     *   - Min 30 minutes between attempts
     *   - Only for active campaigns
     *   - Leads with status COMPLET, XFER, ANSWER, DNC are never retried
     */
    async retryFailedLeads() {
        try {
            const result = await pg.query(`
                UPDATE gescall_leads led
                SET status = 'NEW', phone_index = 0
                FROM gescall_lists ls
                JOIN gescall_campaigns c ON ls.campaign_id = c.campaign_id
                WHERE led.list_id = ls.list_id
                AND c.active = true
                AND led.status IN ('FAILED', 'NA', 'DROP', 'PDROP', 'XDROP', 'B', 'BUSY', 'CONGESTION', 'AB', 'AM', 'AL', 'RINGING', 'AA', 'N', 'HANGUP', 'UP', 'ANSWER')
                AND led.called_count < COALESCE(c.max_retries, 3)
                AND COALESCE((c.retry_settings->>led.status)::integer, 30) >= 0
                AND (led.last_call_time IS NULL OR led.last_call_time < NOW() - (COALESCE((c.retry_settings->>led.status)::integer, 30) || ' minutes')::interval)
            `);

            const exhausted = await pg.query(`
                UPDATE gescall_leads led
                SET status = 'DNC'
                FROM gescall_lists ls
                JOIN gescall_campaigns c ON ls.campaign_id = c.campaign_id
                WHERE led.list_id = ls.list_id
                AND c.active = true
                AND led.status IN ('FAILED', 'NA', 'DROP', 'PDROP', 'XDROP', 'B', 'BUSY', 'CONGESTION', 'AB', 'AM', 'AL', 'RINGING', 'AA', 'N', 'HANGUP', 'UP', 'ANSWER')
                AND (led.called_count >= COALESCE(c.max_retries, 3) OR COALESCE((c.retry_settings->>led.status)::integer, 30) < 0)
            `);

            if ((result.rowCount || 0) > 0 || (exhausted.rowCount || 0) > 0) {
                console.log(`[Maintenance] 🔄 Retry: ${result.rowCount} leads reset for re-dial, ${exhausted.rowCount} exhausted → DNC`);
            }
        } catch (err) {
            console.error('[Maintenance] Retry error:', err.message);
        }
    }

    /**
     * Periodically check if an active campaign has exhausted all its leads.
     * If there are no leads in NEW/QUEUE/DIALING/UP status, AND no leads waiting for retry,
     * the campaign will be automatically set to inactive.
     */
    async autoDeactivateExhaustedCampaigns() {
        try {
            const result = await pg.query(`
                WITH CampaignExhaustion AS (
                    SELECT 
                        c.campaign_id,
                        c.campaign_name,
                        COUNT(led.lead_id) as total_leads,
                        SUM(CASE WHEN led.status IN ('NEW', 'QUEUE', 'DIALING', 'UP') THEN 1 ELSE 0 END) as active_or_pending,
                        SUM(CASE 
                            WHEN led.status IN ('FAILED', 'NA', 'DROP', 'PDROP', 'XDROP', 'B', 'BUSY', 'CONGESTION', 'AB', 'AM', 'AL', 'RINGING', 'AA', 'N', 'HANGUP') 
                            AND led.called_count < COALESCE(c.max_retries, 3) 
                            AND COALESCE((c.retry_settings->>led.status)::integer, 30) >= 0 
                            THEN 1 ELSE 0 
                        END) as retryable_waiting
                    FROM gescall_campaigns c
                    JOIN gescall_lists ls ON c.campaign_id = ls.campaign_id
                    JOIN gescall_leads led ON ls.list_id = led.list_id
                    WHERE c.active = true
                    GROUP BY c.campaign_id, c.campaign_name
                )
                UPDATE gescall_campaigns gc
                SET active = false
                FROM CampaignExhaustion ce
                WHERE gc.campaign_id = ce.campaign_id
                AND ce.total_leads > 0
                AND ce.active_or_pending = 0
                AND ce.retryable_waiting = 0
                RETURNING gc.campaign_id, gc.campaign_name;
            `);

            if (result.rows && result.rows.length > 0) {
                result.rows.forEach(row => {
                    console.log(`[Maintenance] 🛑 Auto-Stopped Campaign: ${row.campaign_name} (${row.campaign_id}) - Exhausted 100%`);
                });
            }
        } catch (err) {
            console.error('[Maintenance] Auto-Deactivate error:', err.message);
        }
    }

    /**
     * Cleanup Redis call keys older than 3 minutes (safety net for TTL failures)
     */
    async cleanupStaleRedisKeys() {
        try {
            const keys = await redis.keys('gescall:call:*');
            if (!keys || keys.length === 0) return;

            const now = Date.now();
            let cleaned = 0;

            for (const key of keys) {
                try {
                    const data = await redis.hGetAll(key);
                    const startTime = parseInt(data?.start_time || '0', 10);
                    if (!startTime) continue;
                    const age = now - startTime;
                    const terminal =
                        data?.ari_handled === 'YES' ||
                        (data?.final_status && String(data.final_status).trim() !== '');
                    // No borrar llamadas en curso: solo metadatos ya cerrados (Node escribió outcome) o huérfanos muy viejos
                    if (terminal && age > 2 * 60 * 1000) {
                        await redis.del(key);
                        cleaned++;
                    } else if (!terminal && age > 45 * 60 * 1000) {
                        await redis.del(key);
                        cleaned++;
                    }
                } catch (e) { /* skip */ }
            }

            if (cleaned > 0) {
                console.log(`[Maintenance] 🧹 Cleaned ${cleaned} stale Redis call keys`);
            }
        } catch (err) {
            console.error('[Maintenance] Redis cleanup error:', err.message);
        }
    }

    /**
     * Archive logs from gescall_call_log to ClickHouse
     */
    async archiveOldCallLogs() {
        try {
            const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '30');
            
            // 1. Find old logs
            const selectResult = await pg.query(`
                SELECT id, lead_id, phone_number, pool_callerid, campaign_id, list_id,
                       call_date, call_status, dtmf_pressed, call_duration, uniqueid, created_at, updated_at
                FROM gescall_call_log
                WHERE call_date < NOW() - INTERVAL '${retentionDays} days'
                LIMIT 50000; -- Process in batches
            `);

            if (selectResult.rows.length === 0) {
                return; // Nothing to archive
            }

            console.log(`[Maintenance] 📦 Found ${selectResult.rows.length} old logs to archive to ClickHouse...`);

            // 2. Format as NDJSON for ClickHouse
            const ndjson = selectResult.rows.map(row => JSON.stringify({
                id: String(row.id || ''),
                lead_id: Number(row.lead_id) || 0,
                phone_number: row.phone_number || '',
                pool_callerid: row.pool_callerid || '',
                campaign_id: row.campaign_id || '',
                list_id: Number(row.list_id) || 0,
                call_date: row.call_date ? row.call_date.toISOString().replace('T', ' ').substring(0, 19) : null,
                call_status: row.call_status || '',
                dtmf_pressed: row.dtmf_pressed || '',
                call_duration: Number(row.call_duration) || 0,
                uniqueid: row.uniqueid || '',
                created_at: row.created_at ? row.created_at.toISOString().replace('T', ' ').substring(0, 19) : null,
                updated_at: row.updated_at ? row.updated_at.toISOString().replace('T', ' ').substring(0, 19) : null
            })).join('\n') + '\n';

            // 3. Insert into ClickHouse
            await queryClickHouse('INSERT INTO gescall_call_log_archive FORMAT JSONEachRow', ndjson);

            // 4. Delete from PostgreSQL
            // We use the exact IDs to avoid deleting rows inserted after our SELECT
            const idsToDelete = selectResult.rows.map(r => r.id);
            await pg.query(`
                DELETE FROM gescall_call_log 
                WHERE id = ANY($1::int[])
            `, [idsToDelete]);

            console.log(`[Maintenance] ✅ Successfully archived and deleted ${idsToDelete.length} records.`);

            // If we hit the limit, there might be more, run again in 5 seconds
            if (idsToDelete.length === 50000) {
                setTimeout(() => this.archiveOldCallLogs(), 5000);
            }

        } catch (err) {
            console.error('[Maintenance] Archival error:', err.message);
        }
    }
}

module.exports = new MaintenanceService();
