/**
 * GesCall Webhook Service
 * Fires HTTP webhooks to external CRMs when call events occur
 * 
 * Events: call.started, call.answered, call.dtmf, call.completed, call.transferred
 * Supports per-campaign webhook URLs stored in gescall_campaigns.webhook_url
 */
const http = require('http');
const https = require('https');
const pg = require('../config/pgDatabase');

class WebhookService {
    constructor() {
        // Cache campaign webhook URLs (30s TTL)
        this._cache = {};
        this._cacheTTL = 30000;
    }

    /**
     * Get webhook URL for a campaign (cached)
     */
    async getWebhookUrl(campaignId) {
        const now = Date.now();
        const cached = this._cache[campaignId];
        if (cached && (now - cached.time) < this._cacheTTL) {
            return cached.url;
        }

        try {
            const result = await pg.query(
                `SELECT webhook_url FROM gescall_campaigns WHERE campaign_id = $1`,
                [campaignId]
            );
            const url = result.rows[0]?.webhook_url || null;
            this._cache[campaignId] = { url, time: now };
            return url;
        } catch (err) {
            return null;
        }
    }

    /**
     * Fire a webhook event (non-blocking)
     */
    async fire(campaignId, event, data) {
        const webhookUrl = await this.getWebhookUrl(campaignId);
        if (!webhookUrl) return; // No webhook configured

        const payload = JSON.stringify({
            event,
            timestamp: new Date().toISOString(),
            campaign_id: campaignId,
            data
        });

        try {
            const parsedUrl = new URL(webhookUrl);
            const httplib = parsedUrl.protocol === 'https:' ? https : http;

            const req = httplib.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    'X-GesCall-Event': event,
                    'X-GesCall-Campaign': campaignId
                },
                timeout: 5000
            }, (res) => {
                // Drain response
                res.on('data', () => { });
                res.on('end', () => {
                    if (res.statusCode >= 400) {
                        console.warn(`[Webhook] ${event} → ${webhookUrl} returned ${res.statusCode}`);
                    }
                });
            });

            req.on('error', (err) => {
                console.error(`[Webhook] ${event} → ${webhookUrl} failed: ${err.message}`);
            });
            req.on('timeout', () => { req.destroy(); });

            req.write(payload);
            req.end();
        } catch (err) {
            console.error(`[Webhook] Fire error:`, err.message);
        }
    }

    // ─── Convenience Methods ─────────────────────────────────────

    callStarted(campaignId, leadId, phoneNumber) {
        this.fire(campaignId, 'call.started', { lead_id: leadId, phone_number: phoneNumber });
    }

    callAnswered(campaignId, leadId, phoneNumber) {
        this.fire(campaignId, 'call.answered', { lead_id: leadId, phone_number: phoneNumber });
    }

    callDtmf(campaignId, leadId, phoneNumber, digit) {
        this.fire(campaignId, 'call.dtmf', { lead_id: leadId, phone_number: phoneNumber, digit });
    }

    callCompleted(campaignId, leadId, phoneNumber, status, duration, dtmf) {
        this.fire(campaignId, 'call.completed', {
            lead_id: leadId, phone_number: phoneNumber,
            status, duration, dtmf
        });
    }

    callTransferred(campaignId, leadId, phoneNumber, transferNumber) {
        this.fire(campaignId, 'call.transferred', {
            lead_id: leadId, phone_number: phoneNumber,
            transfer_number: transferNumber
        });
    }
}

module.exports = new WebhookService();
