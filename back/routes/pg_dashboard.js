const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');
const redis = require('../config/redisClient');

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics (KPIs) in PostgreSQL Native Mode
 */
router.get('/stats', async (req, res) => {
    try {
        // Active calls from Redis
        let active_calls = 0;
        try {
            const keys = await redis.keys('gescall:call:*');
            active_calls = keys ? keys.length : 0;
        } catch (redisErr) {
            console.error('[pg_dashboard] Redis error fetching active calls:', redisErr.message);
        }

        const sql = `
            SELECT
                (SELECT COUNT(*) FROM gescall_users WHERE active = true) as active_agents,
                (SELECT COUNT(*) FROM gescall_campaigns WHERE active = true) as active_campaigns,
                (SELECT COUNT(*)
                 FROM gescall_leads l
                 INNER JOIN gescall_lists ls ON l.list_id = ls.list_id
                 WHERE ls.active = true AND (l.status = 'NEW' OR l.status = 'QUEUE')
                ) as pending_leads,
                (SELECT COUNT(*) FROM gescall_call_log WHERE call_date >= CURRENT_DATE) as calls_today,
                (SELECT COUNT(*) FROM gescall_call_log WHERE call_status = 'SALE' AND call_date >= CURRENT_DATE) as sales_today,
                (SELECT COALESCE(AVG(call_duration), 0) FROM gescall_call_log WHERE call_date >= CURRENT_DATE AND call_duration > 0) as avg_talk_time_today,
                (SELECT COUNT(*)
                 FROM gescall_leads l
                 INNER JOIN gescall_lists ls ON l.list_id = ls.list_id
                 WHERE ls.active = true
                ) as total_leads_active_lists
        `;

        const { rows } = await pg.query(sql);
        const stats = rows[0] || {};

        stats.active_calls = active_calls;

        // Ensure numeric types
        stats.active_agents = parseInt(stats.active_agents) || 0;
        stats.active_campaigns = parseInt(stats.active_campaigns) || 0;
        stats.pending_leads = parseInt(stats.pending_leads) || 0;
        stats.calls_today = parseInt(stats.calls_today) || 0;
        stats.sales_today = parseInt(stats.sales_today) || 0;
        stats.avg_talk_time_today = parseFloat(stats.avg_talk_time_today) || 0;
        stats.total_leads_active_lists = parseInt(stats.total_leads_active_lists) || 0;

        stats.conversion_rate = stats.calls_today > 0
            ? ((stats.sales_today / stats.calls_today) * 100).toFixed(2)
            : 0;

        stats.calls_per_agent = stats.active_agents > 0
            ? Math.round(stats.calls_today / stats.active_agents)
            : 0;

        res.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        console.error('[pg_dashboard] Stats Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/dashboard/agents
 * Get active agents with their current status
 */
router.get('/agents', async (req, res) => {
    try {
        // Native mode: agents aren't stored in live_agents table. Returning empty array for now.
        // In the future, this could fetch from Asterisk AMI/ARI or a Redis agent session list.
        res.json({
            success: true,
            data: [],
        });
    } catch (error) {
        console.error('[pg_dashboard] Agents Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/dashboard/campaigns/status
 * Get campaigns status by IDs 
 */
router.post('/campaigns/status', async (req, res) => {
    try {
        const { campaigns, limit = 1000 } = req.body;

        if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
            return res.status(400).json({ success: false, error: 'campaigns array is required and cannot be empty' });
        }

        const sql = `
            SELECT
                campaign_id,
                campaign_name,
                CASE WHEN active THEN 'Activa' ELSE 'Inactiva' END as estado
            FROM gescall_campaigns
            WHERE campaign_id = ANY($1)
            ORDER BY campaign_name
            LIMIT $2
        `;

        const { rows } = await pg.query(sql, [campaigns, limit]);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[pg_dashboard] Campaigns Status Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/dashboard/campaigns/progress
 * Get campaign progress by list
 */
router.post('/campaigns/progress', async (req, res) => {
    try {
        const { campaigns, startDatetime, endDatetime, limit = 10000 } = req.body;

        if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
            return res.status(400).json({ success: false, error: 'campaigns array is required and cannot be empty' });
        }
        if (!startDatetime || !endDatetime) {
            return res.status(400).json({ success: false, error: 'startDatetime and endDatetime are required' });
        }

        const sql = `
            SELECT
                ls.campaign_id,
                l.list_id,
                ls.list_name,
                SUM(CASE WHEN l.status = 'ANSWER' THEN 1 ELSE 0 END) as AA,
                SUM(CASE WHEN l.status = 'NA' THEN 1 ELSE 0 END) as NA,
                SUM(CASE WHEN l.status = 'NEW' THEN 1 ELSE 0 END) as NEW,
                SUM(CASE WHEN l.status = 'DROP' THEN 1 ELSE 0 END) as PDROP,
                SUM(CASE WHEN l.status = 'PM' THEN 1 ELSE 0 END) as PM,
                SUM(CASE WHEN l.status = 'PU' THEN 1 ELSE 0 END) as PU,
                SUM(CASE WHEN l.status = 'SVYEXT' THEN 1 ELSE 0 END) as SVYEXT,
                COUNT(*) as TOTAL
            FROM gescall_leads l
            INNER JOIN gescall_lists ls ON l.list_id = ls.list_id
            WHERE ls.campaign_id = ANY($1) 
              -- Optionally filter by date if needed. The Vicidial equivalent filtered by log call_date.
              -- Here we just group all leads in the list for progress.
            GROUP BY ls.campaign_id, l.list_id, ls.list_name
            ORDER BY ls.campaign_id, l.list_id
            LIMIT $2
        `;

        const { rows } = await pg.query(sql, [campaigns, limit]);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[pg_dashboard] Campaigns Progress Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/dashboard/dial-log
 * Get dial log by campaign and date range
 */
router.post('/dial-log', async (req, res) => {
    try {
        const { campaigns, startDatetime, endDatetime, limit = 500000 } = req.body;

        if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
            return res.status(400).json({ success: false, error: 'campaigns array is required' });
        }
        if (!startDatetime || !endDatetime) {
            return res.status(400).json({ success: false, error: 'startDatetime and endDatetime are required' });
        }

        const sql = `
            SELECT
                cl.call_date,
                cl.phone_number,
                cl.call_status as status,
                cl.list_id,
                ls.list_name,
                ls.list_name as list_description,
                cl.campaign_id,
                '' as caller_code,
                '' as outbound_cid,
                COALESCE((SELECT called_count FROM gescall_leads WHERE lead_id = cl.lead_id), 1) as attempts,
                cl.dtmf_pressed as dtmf_response
            FROM gescall_call_log cl
            LEFT JOIN gescall_lists ls ON cl.list_id = ls.list_id
            WHERE cl.call_date BETWEEN $1 AND $2
              AND cl.campaign_id = ANY($3)
            ORDER BY cl.call_date ASC
            LIMIT $4
        `;

        const { rows } = await pg.query(sql, [startDatetime, endDatetime, campaigns, limit]);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[pg_dashboard] Dial Log Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/dashboard/status-summary
 * Get status summary by list 
 */
router.post('/status-summary', async (req, res) => {
    try {
        const { campaigns, startDatetime, endDatetime, limit = 10000 } = req.body;

        if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
            return res.status(400).json({ success: false, error: 'campaigns array is required' });
        }
        if (!startDatetime || !endDatetime) {
            return res.status(400).json({ success: false, error: 'startDatetime and endDatetime are required' });
        }

        // Simulating the log aggregation
        const sql = `
            SELECT
                cl.campaign_id,
                cl.list_id,
                ls.list_name,
                cl.call_status as status,
                COUNT(*) as total
            FROM gescall_call_log cl
            LEFT JOIN gescall_lists ls ON cl.list_id = ls.list_id
            WHERE cl.call_date BETWEEN $1 AND $2
              AND cl.campaign_id = ANY($3)
            GROUP BY cl.campaign_id, cl.list_id, ls.list_name, cl.call_status
            ORDER BY cl.campaign_id, cl.list_id, cl.call_status
            LIMIT $4
        `;

        const { rows } = await pg.query(sql, [startDatetime, endDatetime, campaigns, limit]);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[pg_dashboard] Status Summary Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
