const express = require('express');
const router = express.Router();
const databaseService = require('../services/databaseService');
const vicidialApi = require('../services/vicidialApi');

// GET all schedules
router.get('/', async (req, res) => {
    try {
        const schedules = await databaseService.executeQuery(`
            SELECT * FROM gescall_schedules 
            ORDER BY scheduled_at DESC
        `);
        res.json(schedules);
    } catch (error) {
        console.error('Error fetching schedules:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET upcoming schedules (for calendar view)
router.get('/upcoming', async (req, res) => {
    try {
        const { start, end } = req.query;
        let query = `
            SELECT * FROM gescall_schedules 
            WHERE 1=1
        `;
        const params = [];

        if (start) {
            query += ` AND (scheduled_at >= ? OR end_at >= ?)`;
            params.push(start, start);
        }
        if (end) {
            // Use DATE function + 1 day to include the entire end day
            query += ` AND DATE(scheduled_at) <= DATE(?)`;
            params.push(end);
        }

        query += ` ORDER BY scheduled_at ASC`;

        const schedules = await databaseService.executeQuery(query, params);
        res.json(schedules);
    } catch (error) {
        console.error('Error fetching upcoming schedules:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST create new schedule
router.post('/', async (req, res) => {
    try {
        const {
            schedule_type,
            target_id,
            target_name,
            action,
            scheduled_at,
            end_at,
            recurring,
            created_by
        } = req.body;

        // Validation
        if (!schedule_type || !target_id || !action || !scheduled_at) {
            return res.status(400).json({
                error: 'Missing required fields: schedule_type, target_id, action, scheduled_at'
            });
        }

        // Validate that scheduled_at is not in the past
        const scheduledDate = new Date(scheduled_at);
        const now = new Date();
        if (scheduledDate <= now) {
            return res.status(400).json({
                error: 'La fecha y hora programada debe ser mayor a la fecha y hora actual'
            });
        }

        const result = await databaseService.executeQuery(`
            INSERT INTO gescall_schedules 
            (schedule_type, target_id, target_name, action, scheduled_at, end_at, recurring, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            schedule_type,
            target_id,
            target_name || null,
            action,
            scheduled_at,
            end_at || null,
            recurring || 'none',
            created_by || null
        ]);

        const newSchedule = await databaseService.executeQuery(
            'SELECT * FROM gescall_schedules WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json(newSchedule[0]);
    } catch (error) {
        console.error('Error creating schedule:', error);
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

        if (scheduled_at) {
            updates.push('scheduled_at = ?');
            params.push(scheduled_at);
        }
        if (end_at !== undefined) {
            updates.push('end_at = ?');
            params.push(end_at);
        }
        if (action) {
            updates.push('action = ?');
            params.push(action);
        }
        if (recurring) {
            updates.push('recurring = ?');
            params.push(recurring);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(id);
        await databaseService.executeQuery(`
            UPDATE gescall_schedules SET ${updates.join(', ')} WHERE id = ?
        `, params);

        const updated = await databaseService.executeQuery(
            'SELECT * FROM gescall_schedules WHERE id = ?',
            [id]
        );

        res.json(updated[0]);
    } catch (error) {
        console.error('Error updating schedule:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE schedule
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await databaseService.executeQuery('DELETE FROM gescall_schedules WHERE id = ?', [id]);
        res.json({ success: true, deleted: id });
    } catch (error) {
        console.error('Error deleting schedule:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET available campaigns for scheduling
router.get('/targets/campaigns', async (req, res) => {
    try {
        const campaigns = await databaseService.executeQuery(`
            SELECT campaign_id, campaign_name, active 
            FROM vicidial_campaigns 
            ORDER BY campaign_name
        `);
        res.json(campaigns);
    } catch (error) {
        console.error('Error fetching campaigns:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET available lists for scheduling
router.get('/targets/lists', async (req, res) => {
    try {
        const lists = await databaseService.executeQuery(`
            SELECT list_id, list_name, active, campaign_id 
            FROM vicidial_lists 
            ORDER BY list_name
        `);
        res.json(lists);
    } catch (error) {
        console.error('Error fetching lists:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
