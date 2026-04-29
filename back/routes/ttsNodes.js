/**
 * ttsNodes.js — REST API for managing TTS nodes (DB Agnostic)
 */
const express = require('express');
const pg = require('../config/pgDatabase');
const router = express.Router();

module.exports = function (database) {
    const getPool = () => {
        if (!database.pool) throw new Error('Database not connected');
        return database.pool;
    };

    async function checkPermission(role_id, permissionId) {
        try {
            // Fast path: system roles bypass permission checks
            const roleRes = await pg.query('SELECT is_system FROM gescall_roles WHERE role_id = $1', [role_id]);
            if (roleRes.rows.length > 0 && roleRes.rows[0].is_system) return true;

            const result = await pg.query(
                'SELECT 1 FROM gescall_role_permissions WHERE role_id = $1 AND permission = $2',
                [role_id, permissionId]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error(`[API] Error checking permission ${permissionId} for role_id ${role_id}:`, error);
            return false;
        }
    }

    function requirePermission(permissionId) {
        return async (req, res, next) => {
            // Use role_id from JWT (integer) — fallback to is_system flag
            if (req.user?.is_system) return next();
            const role_id = req.user?.role_id;
            if (!role_id) {
                return res.status(403).json({ error: 'Acceso denegado: Permiso requerido' });
            }
            const allowed = await checkPermission(role_id, permissionId);
            if (!allowed) {
                return res.status(403).json({ error: 'Acceso denegado: Permiso requerido' });
            }
            next();
        };
    }

    const executeQuery = async (query, params = []) => {
        const pool = getPool();
        if (pool.execute) {
            // MySQL
            const [rows] = await pool.execute(query, params);
            return rows;
        } else {
            // PostgreSQL — rewrite MySQL placeholders to $N
            let pgQuery = query;
            let counter = 1;
            while (pgQuery.includes('?')) {
                pgQuery = pgQuery.replace('?', '$' + counter);
                counter++;
            }
            const { rows } = await pool.query(pgQuery, params);
            return rows;
        }
    };

    // GET /api/tts-nodes
    router.get('/', requirePermission('manage_tts_nodes'), async (req, res) => {
        try {
            const rows = await executeQuery('SELECT * FROM gescall_tts_nodes ORDER BY id ASC');
            res.json(rows);
        } catch (err) {
            console.error('[API] Error fetching TTS nodes:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/tts-nodes/active
    router.get('/active', requirePermission('manage_tts_nodes'), async (req, res) => {
        try {
            // For MySQL, true is 1. We can use is_active = true for PG, but is_active = 1 for MySQL. 
            // Better to use parameter mapping.
            const rows = await executeQuery('SELECT * FROM gescall_tts_nodes WHERE is_active = ? ORDER BY id ASC', [true]);
            res.json(rows);
        } catch (err) {
            console.error('[API] Error fetching active TTS nodes:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/tts-nodes
    router.post('/', requirePermission('manage_tts_nodes'), async (req, res) => {
        try {
            const { name, url, is_active } = req.body;
            if (!name || !url) return res.status(400).json({ error: 'Name and URL are required' });

            const active = is_active !== undefined ? is_active : true;

            const pool = getPool();
            if (pool.execute) { // MySQL
                const result = await executeQuery(`INSERT INTO gescall_tts_nodes (name, url, is_active) VALUES (?, ?, ?)`, [name, url, active]);
                const rows = await executeQuery('SELECT * FROM gescall_tts_nodes WHERE id = ?', [result.insertId]);
                res.status(201).json(rows[0]);
            } else { // PG
                const rows = await executeQuery(`INSERT INTO gescall_tts_nodes (name, url, is_active) VALUES (?, ?, ?) RETURNING *`, [name, url, active]);
                res.status(201).json(rows[0]);
            }
        } catch (err) {
            console.error('[API] Error creating TTS node:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/tts-nodes/:id
    router.put('/:id', requirePermission('manage_tts_nodes'), async (req, res) => {
        try {
            const { id } = req.params;
            const { name, url, is_active } = req.body;
            if (!name || !url) return res.status(400).json({ error: 'Name and URL are required' });

            const active = is_active !== undefined ? is_active : true;

            const pool = getPool();
            if (pool.execute) { // MySQL
                await executeQuery(`UPDATE gescall_tts_nodes SET name = ?, url = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [name, url, active, id]);
                const rows = await executeQuery('SELECT * FROM gescall_tts_nodes WHERE id = ?', [id]);
                if (rows.length === 0) return res.status(404).json({ error: 'TTS Node not found' });
                res.json(rows[0]);
            } else { // PG
                const rows = await executeQuery(`UPDATE gescall_tts_nodes SET name = ?, url = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *`, [name, url, active, id]);
                if (rows.length === 0) return res.status(404).json({ error: 'TTS Node not found' });
                res.json(rows[0]);
            }
        } catch (err) {
            console.error('[API] Error updating TTS node:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/tts-nodes/:id
    router.delete('/:id', requirePermission('manage_tts_nodes'), async (req, res) => {
        try {
            const { id } = req.params;
            const pool = getPool();
            if (pool.execute) { // MySQL
                const result = await executeQuery('DELETE FROM gescall_tts_nodes WHERE id = ?', [id]);
                if (result.affectedRows === 0) return res.status(404).json({ error: 'TTS Node not found' });
            } else { // PG
                const rows = await executeQuery('DELETE FROM gescall_tts_nodes WHERE id = ? RETURNING id', [id]);
                if (rows.length === 0) return res.status(404).json({ error: 'TTS Node not found' });
            }
            res.json({ success: true, message: 'TTS Node deleted successfully' });
        } catch (err) {
            console.error('[API] Error deleting TTS node:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
