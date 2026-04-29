/**
 * GesCall Metrics & Reports API Routes
 */
const express = require('express');
const router = express.Router();
const metrics = require('../services/metricsService');
const pg = require('../config/pgDatabase');

// ─── Real-time Metrics Snapshot ──────────────────────────────────
router.get('/realtime', async (req, res) => {
    try {
        const snapshot = await metrics.getSnapshot();
        res.json(snapshot);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Call Reports (with filters + CSV export) ────────────────────
router.get('/calls', async (req, res) => {
    try {
        const {
            campaign_id,
            status,
            date_from,
            date_to,
            format = 'json',
            page = 1,
            limit = 100
        } = req.query;

        let where = ['1=1'];
        let params = [];
        let paramCount = 0;

        if (campaign_id) {
            paramCount++;
            where.push(`cl.campaign_id = $${paramCount}`);
            params.push(campaign_id);
        }
        if (status) {
            paramCount++;
            where.push(`cl.call_status = $${paramCount}`);
            params.push(status);
        }
        if (date_from) {
            paramCount++;
            where.push(`cl.call_date >= $${paramCount}`);
            params.push(date_from);
        }
        if (date_to) {
            paramCount++;
            where.push(`cl.call_date <= $${paramCount}::date + INTERVAL '1 day'`);
            params.push(date_to);
        }

        const whereClause = where.join(' AND ');

        // Get total count
        const countResult = await pg.query(
            `SELECT COUNT(*) as total FROM gescall_call_log cl WHERE ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0]?.total) || 0;

        // Get data
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const dataResult = await pg.query(
            `SELECT cl.log_id, cl.lead_id, cl.phone_number, cl.campaign_id, cl.list_id,
                    cl.call_date, cl.call_status, cl.call_duration, cl.dtmf_pressed, cl.pool_callerid
             FROM gescall_call_log cl
             WHERE ${whereClause}
             ORDER BY cl.call_date DESC
             LIMIT ${parseInt(limit)} OFFSET ${offset}`,
            params
        );

        // CSV export
        if (format === 'csv') {
            const rows = dataResult.rows;
            const headers = ['log_id', 'lead_id', 'phone_number', 'campaign_id', 'list_id',
                'call_date', 'call_status', 'call_duration', 'dtmf_pressed', 'pool_callerid'];
            let csv = headers.join(',') + '\n';
            for (const row of rows) {
                csv += headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
            }
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=calls_report_${new Date().toISOString().slice(0, 10)}.csv`);
            return res.send(csv);
        }

        res.json({
            data: dataResult.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Campaign Summary Report ─────────────────────────────────────
router.get('/campaign-summary', async (req, res) => {
    try {
        const { date_from, date_to } = req.query;
        let dateFilter = '';
        let params = [];

        if (date_from && date_to) {
            dateFilter = 'AND cl.call_date >= $1 AND cl.call_date <= $2::date + INTERVAL \'1 day\'';
            params = [date_from, date_to];
        } else {
            dateFilter = 'AND cl.call_date >= CURRENT_DATE';
        }

        const result = await pg.query(`
            SELECT 
                cl.campaign_id,
                COUNT(*) as total_calls,
                COUNT(*) FILTER (WHERE cl.call_status = 'ANSWER') as answered,
                COUNT(*) FILTER (WHERE cl.call_status = 'NA') as no_answer,
                COUNT(*) FILTER (WHERE cl.call_status = 'DROP') as dropped,
                COUNT(*) FILTER (WHERE cl.call_status = 'COMPLET') as completed,
                COUNT(*) FILTER (WHERE cl.call_status = 'FAILED') as failed,
                COUNT(*) FILTER (WHERE cl.call_status = 'XFER') as transferred,
                ROUND(AVG(cl.call_duration)) as avg_duration,
                ROUND(100.0 * COUNT(*) FILTER (WHERE cl.call_status = 'ANSWER') / NULLIF(COUNT(*), 0), 1) as asr
            FROM gescall_call_log cl
            WHERE 1=1 ${dateFilter}
            GROUP BY cl.campaign_id
            ORDER BY total_calls DESC
        `, params);

        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Hourly Distribution ─────────────────────────────────────────
router.get('/hourly', async (req, res) => {
    try {
        const campaign_id = req.query.campaign_id;
        let filter = '';
        let params = [];

        if (campaign_id) {
            filter = 'AND campaign_id = $1';
            params = [campaign_id];
        }

        const result = await pg.query(`
            SELECT 
                EXTRACT(HOUR FROM call_date) as hour,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE call_status = 'ANSWER') as answered,
                ROUND(AVG(call_duration)) as avg_duration
            FROM gescall_call_log
            WHERE call_date >= CURRENT_DATE ${filter}
            GROUP BY EXTRACT(HOUR FROM call_date)
            ORDER BY hour
        `, params);

        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
