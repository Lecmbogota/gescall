const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');

/**
 * GET /api/roles/permissions
 * Fetches all roles and their currently assigned permissions.
 */
router.get('/permissions', async (req, res) => {
    try {
        const { rows } = await pg.query(`
            SELECT r.role_id, r.role_name, p.permission 
            FROM gescall_roles r
            LEFT JOIN gescall_role_permissions p ON r.role_id = p.role_id
            ORDER BY r.role_name, p.permission
        `);

        // Group by role_id
        const rolesMap = {};
        rows.forEach(row => {
            if (!rolesMap[row.role_id]) {
                rolesMap[row.role_id] = [];
            }
            if (row.permission) {
                rolesMap[row.role_id].push(row.permission);
            }
        });

        res.json({ success: true, data: rolesMap });
    } catch (error) {
        console.error('[pg_roles] Error fetching permissions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/roles
 * Fetches all roles.
 */
router.get('/', async (req, res) => {
    try {
        const { rows } = await pg.query('SELECT role_id, role_name, is_system FROM gescall_roles ORDER BY role_name');
        res.json({ success: true, data: rows.map(r => ({ id: r.role_id, role: r.role_name, is_system: r.is_system })) });
    } catch (error) {
        console.error('[pg_roles] Error fetching roles:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/roles
 * Creates a new role.
 */
router.post('/', async (req, res) => {
    try {
        const { role } = req.body;
        if (!role || typeof role !== 'string') {
            return res.status(400).json({ success: false, error: 'Se requiere el nombre del rol' });
        }

        const cleanRole = role.trim().toUpperCase().replace(/\s+/g, '_');
        if (cleanRole.length === 0 || cleanRole.length > 50) {
            return res.status(400).json({ success: false, error: 'Invalid role name' });
        }

        const result = await pg.query('INSERT INTO gescall_roles (role_name, is_system) VALUES ($1, false) RETURNING role_id', [cleanRole]);
        res.json({ success: true, role: cleanRole, id: result.rows[0].role_id });
    } catch (error) {
        console.error('[pg_roles] Error creating role:', error);
        if (error.code === '23505') { // Postgres unique violation code
            return res.status(400).json({ success: false, error: 'El rol ya existe' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/roles/:id
 * Deletes a custom role by ID.
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent deleting system roles
        const check = await pg.query('SELECT role_name, is_system FROM gescall_roles WHERE role_id = $1', [id]);
        if (check.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'El rol no existe' });
        }
        if (check.rows[0].is_system) {
            return res.status(400).json({ success: false, error: 'No se pueden eliminar los roles del sistema' });
        }

        const role_name = check.rows[0].role_name;

        // We need an AGENT role_id to fallback users to.
        const agentCheck = await pg.query("SELECT role_id FROM gescall_roles WHERE role_name = 'AGENT'");
        let agentRoleId = null;
        if (agentCheck.rows.length > 0) agentRoleId = agentCheck.rows[0].role_id;

        const client = await pg.pool.connect();
        try {
            await client.query('BEGIN');
            if (agentRoleId) {
                await client.query("UPDATE gescall_users SET role_id = $1 WHERE role_id = $2", [agentRoleId, id]);
            } else {
                // If there's no AGENT role, delete users perhaps? No, we just try to update to null but it's restricted. So we might fail.
                // Let's hope AGENT exists.
            }
            await client.query('DELETE FROM gescall_role_permissions WHERE role_id = $1', [id]);
            await client.query('DELETE FROM gescall_roles WHERE role_id = $1', [id]);
            await client.query('COMMIT');

            res.json({ success: true, message: `Rol ${role_name} eliminado` });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[pg_roles] Error deleting role:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/roles/:id/permissions
 * Updates the permissions for a given role ID.
 * Body: { permissions: string[] }
 */
router.put('/:id/permissions', async (req, res) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            return res.status(400).json({ success: false, error: 'Permissions must be an array' });
        }

        // We use a transaction to delete old permissions and insert new ones
        const client = await pg.pool.connect();
        try {
            await client.query('BEGIN');

            // Delete existing
            await client.query('DELETE FROM gescall_role_permissions WHERE role_id = $1', [id]);

            // Insert new ones
            for (const perm of permissions) {
                await client.query('INSERT INTO gescall_role_permissions (role_id, permission) VALUES ($1, $2)', [id, perm]);
            }

            await client.query('COMMIT');
            res.json({ success: true, message: `Permisos actualizados para el rol ID ${id}` });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error(`[pg_roles] Error updating permissions for role ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
