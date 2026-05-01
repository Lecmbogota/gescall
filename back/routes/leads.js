const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');

/**
 * GET /api/leads/search
 * Search for leads by phone number
 */
router.get('/search', async (req, res) => {
    try {
        const { phone_number, records = 1000 } = req.query;

        if (!phone_number) {
            return res.status(400).json({ success: false, error: 'phone_number is required' });
        }

        const sql = `
            SELECT l.*, ls.list_name, ls.campaign_id 
            FROM gescall_leads l
            LEFT JOIN gescall_lists ls ON l.list_id = ls.list_id
            WHERE l.phone_number LIKE $1
            ORDER BY l.created_at DESC
            LIMIT $2
        `;

        const { rows } = await pg.query(sql, [`%${phone_number}%`, records]);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('[pg_leads] Search Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/leads/:lead_id
 * Get all information about a specific lead
 */
router.get('/:lead_id', async (req, res) => {
    try {
        const { lead_id } = req.params;

        const sql = `
            SELECT l.*, ls.list_name, ls.campaign_id 
            FROM gescall_leads l
            LEFT JOIN gescall_lists ls ON l.list_id = ls.list_id
            WHERE l.lead_id = $1
        `;

        const { rows } = await pg.query(sql, [lead_id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }

        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('[pg_leads] Get Lead Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/leads
 * Create a new lead
 */
router.post('/', async (req, res) => {
    try {
        const {
            phone_number,
            list_id,
            vendor_lead_code
        } = req.body;

        if (!phone_number || !list_id) {
            return res.status(400).json({ success: false, error: 'Missing required fields: phone_number, list_id' });
        }

        const sql = `
            INSERT INTO gescall_leads 
            (list_id, phone_number, vendor_lead_code, status)
            VALUES ($1, $2, $3, 'NEW')
            RETURNING lead_id
        `;

        const values = [
            list_id,
            phone_number,
            vendor_lead_code || null
        ];

        const { rows } = await pg.query(sql, values);

        res.status(201).json({
            success: true,
            message: 'Lead created successfully',
            lead_id: rows[0].lead_id,
            data: rows[0]
        });
    } catch (error) {
        console.error('[pg_leads] Create Lead Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/leads/:lead_id
 * Update an existing lead
 */
router.put('/:lead_id', async (req, res) => {
    try {
        const { lead_id } = req.params;
        const updates = req.body;

        // Allowed fields for update in gescall_leads
        const allowedFields = [
            'list_id', 'status', 'phone_number', 
            'vendor_lead_code', 'called_count'
        ];

        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                setClauses.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields provided for update' });
        }

        values.push(lead_id);
        const sql = `
            UPDATE gescall_leads
            SET ${setClauses.join(', ')}
            WHERE lead_id = $${paramIndex}
            RETURNING *
        `;

        const { rows } = await pg.query(sql, values);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }

        res.json({
            success: true,
            message: 'Lead updated successfully',
            data: rows[0]
        });
    } catch (error) {
        console.error('[pg_leads] Update Lead Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/leads/:lead_id
 * Delete a lead
 */
router.delete('/:lead_id', async (req, res) => {
    try {
        const { lead_id } = req.params;

        const sql = `DELETE FROM gescall_leads WHERE lead_id = $1 RETURNING lead_id`;

        const { rows } = await pg.query(sql, [lead_id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }

        res.json({
            success: true,
            message: 'Lead deleted successfully'
        });
    } catch (error) {
        console.error('[pg_leads] Delete Lead Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
