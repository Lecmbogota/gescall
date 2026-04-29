const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');

// GET all schedules
router.get('/', async (req, res) => {
    try {
        const { rows } = await pg.query(`
            SELECT * FROM gescall_schedules 
            ORDER BY scheduled_at DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('[pg_schedules] Error fetching:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET upcoming schedules
router.get('/upcoming', async (req, res) => {
    try {
        const { start, end } = req.query;
        let query = 'SELECT * FROM gescall_schedules WHERE 1=1';
        const params = [];
        let pIndex = 1;

        if (start) {
            query += ' AND (scheduled_at >= $' + pIndex + ' OR end_at >= $' + pIndex + ')';
            params.push(start);
            pIndex++;
        }
        if (end) {
            query += ' AND DATE(scheduled_at) <= DATE($' + pIndex + ')';
            params.push(end);
            pIndex++;
        }

        query += ' ORDER BY scheduled_at ASC';

        const { rows } = await pg.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('[pg_schedules] Error upcoming:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST create schedule
router.post('/', async (req, res) => {
    try {
        const {
            schedule_type, target_id, target_name, action,
            scheduled_at, end_at, recurring, created_by
        } = req.body;

        if (!schedule_type || !target_id || !action || !scheduled_at) {
            return res.status(400).json({
                error: 'Missing required fields: schedule_type, target_id, action, scheduled_at'
            });
        }

        const scheduledDate = new Date(scheduled_at);
        if (scheduledDate <= new Date()) {
            return res.status(400).json({
                error: 'La fecha y hora programada debe ser mayor a la actual'
            });
        }

        const { rows } = await pg.query(`
            INSERT INTO gescall_schedules 
            (schedule_type, target_id, target_name, action, scheduled_at, end_at, recurring, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            schedule_type, target_id, target_name || null, action,
            scheduled_at, end_at || null, recurring || 'none', created_by || null
        ]);

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('[pg_schedules] Error create:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT update schedule
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { scheduled_at, end_at, action, recurring } = req.body;

        const updates = [];
        const params = [];
        let pIndex = 1;

        if (scheduled_at) { updates.push('scheduled_at = $' + pIndex++); params.push(scheduled_at); }
        if (end_at !== undefined) { updates.push('end_at = $' + pIndex++); params.push(end_at); }
        if (action) { updates.push('action = $' + pIndex++); params.push(action); }
        if (recurring) { updates.push('recurring = $' + pIndex++); params.push(recurring); }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(id);
        const { rows } = await pg.query(
            'UPDATE gescall_schedules SET ' + updates.join(', ') + ' WHERE id = $' + pIndex + ' RETURNING *',
            params
        );

        res.json(rows[0]);
    } catch (error) {
        console.error('[pg_schedules] Error update:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE schedule
router.delete('/:id', async (req, res) => {
    try {
        await pg.query('DELETE FROM gescall_schedules WHERE id = $1', [req.params.id]);
        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        console.error('[pg_schedules] Error delete:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET targets/campaigns
router.get('/targets/campaigns', async (req, res) => {
    try {
        const { rows } = await pg.query('SELECT campaign_id, campaign_name, active FROM gescall_campaigns ORDER BY campaign_name');
        res.json(rows);
    } catch (error) {
        console.error('[pg_schedules] Error targets/campaigns:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET targets/lists
router.get('/targets/lists', async (req, res) => {
    try {
        const { rows } = await pg.query('SELECT list_id, list_name, active, campaign_id FROM gescall_lists ORDER BY list_name');
        res.json(rows);
    } catch (error) {
        console.error('[pg_schedules] Error targets/lists:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
