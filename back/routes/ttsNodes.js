/**
 * pg_tts_nodes.js — REST API for managing TTS nodes
 */
const express = require('express');
const router = express.Router();

module.exports = function (database) {
    const getPool = () => {
        if (!database.pool) throw new Error('Database not connected');
        return database.pool;
    };

    // GET /api/tts-nodes
    router.get('/', async (req, res) => {
        try {
            const pool = getPool();
            const { rows } = await pool.query('SELECT * FROM gescall_tts_nodes ORDER BY id ASC');
            res.json(rows);
        } catch (err) {
            console.error('[API] Error fetching TTS nodes:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/tts-nodes/active
    router.get('/active', async (req, res) => {
        try {
            const pool = getPool();
            const { rows } = await pool.query('SELECT * FROM gescall_tts_nodes WHERE is_active = true ORDER BY id ASC');
            res.json(rows);
        } catch (err) {
            console.error('[API] Error fetching active TTS nodes:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/tts-nodes
    router.post('/', async (req, res) => {
        try {
            const pool = getPool();
            const { name, url, is_active } = req.body;

            if (!name || !url) {
                return res.status(400).json({ error: 'Name and URL are required' });
            }

            const active = is_active !== undefined ? is_active : true;

            const { rows } = await pool.query(
                `INSERT INTO gescall_tts_nodes (name, url, is_active) 
                 VALUES ($1, $2, $3) RETURNING *`,
                [name, url, active]
            );

            res.status(201).json(rows[0]);
        } catch (err) {
            console.error('[API] Error creating TTS node:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/tts-nodes/:id
    router.put('/:id', async (req, res) => {
        try {
            const pool = getPool();
            const { id } = req.params;
            const { name, url, is_active } = req.body;

            if (!name || !url) {
                return res.status(400).json({ error: 'Name and URL are required' });
            }

            const active = is_active !== undefined ? is_active : true;

            const { rows } = await pool.query(
                `UPDATE gescall_tts_nodes 
                 SET name = $1, url = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = $4 RETURNING *`,
                [name, url, active, id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: 'TTS Node not found' });
            }

            res.json(rows[0]);
        } catch (err) {
            console.error('[API] Error updating TTS node:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/tts-nodes/:id
    router.delete('/:id', async (req, res) => {
        try {
            const pool = getPool();
            const { id } = req.params;

            const { rowCount } = await pool.query(
                'DELETE FROM gescall_tts_nodes WHERE id = $1',
                [id]
            );

            if (rowCount === 0) {
                return res.status(404).json({ error: 'TTS Node not found' });
            }

            res.json({ success: true, message: 'TTS Node deleted successfully' });
        } catch (err) {
            console.error('[API] Error deleting TTS node:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
