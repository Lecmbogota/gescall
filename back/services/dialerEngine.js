const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const database = require('../config/database');

// Paths for Asterisk spooling
const SPOOL_DIR = '/var/spool/asterisk/outgoing';
const TMP_DIR = '/tmp/gescall_dialer';

// Ensure tmp dir exists
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

class DialerEngine {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.checkIntervalMs = parseInt(process.env.DIALER_INTERVAL_MS) || 2000;
        this.maxConcurrentCalls = parseInt(process.env.DIALER_MAX_CONCURRENT) || 100;
        this.activeCallsCount = 0; // Simple tracker for in-flight requests

        // CPS Tracking
        this.lastCpsReset = Date.now();
        this.callsThisSecond = 0;

        console.log(`[Dialer] Initialized. Interval: ${this.checkIntervalMs}ms, Max Concurrent: ${this.maxConcurrentCalls}`);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[Dialer] Starting Core Engine Loop...');
        this.intervalId = setInterval(() => this.tick(), this.checkIntervalMs);
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        clearInterval(this.intervalId);
        console.log('[Dialer] Stopped Core Engine Loop.');
    }

    async tick() {
        if (!this.isRunning) return;

        try {
            // 1. If we are at capacity, skip this tick
            if (this.activeCallsCount >= this.maxConcurrentCalls) {
                return;
            }

            // 2. Find campaigns that are active and use RATIO/progress matching
            const campaigns = await database.query(
                `SELECT campaign_id, dial_prefix, campaign_cid 
                 FROM vicidial_campaigns 
                 WHERE active = 'Y' AND dial_method = 'RATIO'`
            );

            if (!campaigns || campaigns.length === 0) return;

            // 3. For each active campaign, pull leads from the hopper
            for (const camp of campaigns) {
                // Calculate how many calls we can safely launch this tick
                const availableSlots = this.maxConcurrentCalls - this.activeCallsCount;
                if (availableSlots <= 0) break;

                // We allow the per-campaign pull to fetch as many slots as are available
                const fetchLimit = availableSlots;

                // Ensure pool is connected before getting a connection for transaction
                if (!database.pool) {
                    await database.connect();
                }

                if (!database.pool) {
                    console.warn(`[Dialer] MySQL Pool unavailable.`);
                    return;
                }

                // Start transaction to safely pull leads
                const connection = await database.pool.getConnection();
                try {
                    await connection.beginTransaction();

                    // Lock hopper rows for this campaign
                    const [hopperLeads] = await connection.execute(
                        `SELECT h.hopper_id, h.lead_id, l.phone_number, l.list_id
                         FROM vicidial_hopper h
                         JOIN vicidial_list l ON h.lead_id = l.lead_id
                         WHERE h.campaign_id = ? AND h.status = 'READY'
                         ORDER BY h.priority DESC, h.hopper_id ASC 
                         LIMIT ? FOR UPDATE`,
                        [camp.campaign_id, fetchLimit]
                    );

                    if (hopperLeads.length > 0) {
                        const hopperIds = hopperLeads.map(l => l.hopper_id);

                        // Mark as QUEUE so another dialer instance/tick doesn't grab them
                        await connection.query(
                            `UPDATE vicidial_hopper SET status = 'QUEUE' WHERE hopper_id IN (?)`,
                            [hopperIds]
                        );

                        await connection.commit();

                        // Fire the calls asynchronously
                        this.launchCalls(hopperLeads, camp);
                    } else {
                        await connection.commit();
                    }
                } catch (err) {
                    await connection.rollback();
                    console.error(`[Dialer] Error fetching hopper for ${camp.campaign_id}:`, err.message);
                } finally {
                    connection.release();
                }
            }
        } catch (error) {
            console.error('[Dialer] Core Loop Error:', error.message);
        }
    }

    launchCalls(leads, campaign) {
        const timestamp = Date.now();
        const prefix = campaign.dial_prefix || '';
        const defaultCid = campaign.campaign_cid || '0000000000';

        leads.forEach(lead => {
            this.activeCallsCount++;
            const filename = `gescall_${campaign.campaign_id}_${lead.lead_id}_${timestamp}_${uuidv4()}.call`;
            const tmpPath = path.join(TMP_DIR, filename);
            const spoolPath = path.join(SPOOL_DIR, filename);

            // Using Local/ channel to go through Vicidial/Gescall dialplan
            // E.g. Local/900013152092535@default or Local/523152092535@default
            const dialString = `Local/${prefix}${lead.phone_number}@default`;

            // .call file contents
            // It will call the number, and if answered, dump it into the Stasis app at 8300
            const fileContent = `Channel: ${dialString}
CallerID: "${defaultCid}" <${defaultCid}>
MaxRetries: 0
RetryTime: 60
WaitTime: 40
Context: default
Extension: 8300
Priority: 1
SetVar: leadid=${lead.lead_id}
SetVar: campaign_id=${campaign.campaign_id}
SetVar: phone_number=${lead.phone_number}
`;

            try {
                // Write to /tmp first (Atomic strategy)
                fs.writeFileSync(tmpPath, fileContent);
                // Move to /var/spool/asterisk/outgoing
                fs.renameSync(tmpPath, spoolPath);

                // Set a timeout to decrement active calls count strictly as a fallback.
                // A better approach would be to track channel hangups via AMI/ARI, 
                // but this ensures the loop doesn't stay blocked forever if Asterisk drops it silently.
                setTimeout(() => {
                    this.activeCallsCount = Math.max(0, this.activeCallsCount - 1);
                }, 500); // 500ms later, assume this specific call attempt is cleared from Asterisk

                // Track CPS
                const now = Date.now();
                if (now - this.lastCpsReset >= 1000) {
                    console.log(`[Dialer] 🚀 ACTUAL CPS: ${this.callsThisSecond} calls spooled in the last second.`);
                    this.callsThisSecond = 1;
                    this.lastCpsReset = now;
                } else {
                    this.callsThisSecond++;
                }

                // Insert into gescall_call_log natively so dropped calls are tracked
                database.query(
                    `INSERT IGNORE INTO gescall_call_log 
                    (lead_id, phone_number, campaign_id, list_id, call_date, call_status, dtmf_pressed, call_duration) 
                    VALUES (?, ?, ?, ?, NOW(), 'DIALING', '0', 0)`,
                    [lead.lead_id, lead.phone_number, campaign.campaign_id, lead.list_id || 0]
                ).catch(e => {
                    console.error(`[Dialer] DB Error logging DIALING for ${lead.lead_id}:`, e.message);
                });

                // Update hopper status to DONE (or delete it like vicidial does)
                database.query(`DELETE FROM vicidial_hopper WHERE hopper_id = ?`, [lead.hopper_id]).catch(e => { });

            } catch (err) {
                this.activeCallsCount = Math.max(0, this.activeCallsCount - 1);
                console.error(`[Dialer] Failed to spool call for lead ${lead.lead_id}:`, err.message);
            }
        });
    }
}

module.exports = new DialerEngine();
