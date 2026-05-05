const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { exec } = require('child_process');
const { regeneratePjsipGescallUsers } = require('../services/regeneratePjsipGescallUsers');

/** PIN/clave SIP inicial para nuevos usuarios rol agente (pausas + teléfono web). */
const DEFAULT_AGENT_SIP_PASSWORD = '1234';

function isAgentRoleName(roleName) {
    const u = String(roleName || '').trim().toUpperCase();
    return u === 'AGENT' || u === 'AGENTE';
}

function getExtensionStatus(extension) {
    return new Promise((resolve) => {
        if (!extension) return resolve('N/A');
        exec(`asterisk -rx "pjsip show endpoint ${extension}" 2>/dev/null`, (err, stdout) => {
            if (err || !stdout) return resolve('Offline');
            // The state line looks like: " Endpoint:  100    Not in use    0 of inf"
            // Possible states: Not in use, Unavailable, In use, Busy, etc.
            if (stdout.includes('not found') || stdout.includes('object not found') || stdout.includes('Unable to find')) {
                resolve('Offline');
            } else if (stdout.match(new RegExp(`Endpoint:\\s+${extension}\\s+Unavailable`))) {
                resolve('Offline');
            } else if (stdout.match(new RegExp(`Endpoint:\\s+${extension}\\s+(Not in use|In use|Busy|Reachable)`))) {
                resolve('Online');
            } else if (stdout.includes('Endpoint:')) {
                // Endpoint exists but in an unknown state — assume online
                resolve('Online');
            } else {
                resolve('Offline');
            }
        });
    });
}

// Fetch role level dynamically using role_id
const getRoleLevel = async (role_id) => {
    try {
        const result = await pg.query('SELECT is_system, role_name FROM gescall_roles WHERE role_id = $1', [role_id]);
        if (result.rows.length === 0) return 20;

        const { is_system, role_name } = result.rows[0];
        
        if (is_system) return 100;
        
        switch ((role_name || '').toUpperCase()) {
            case 'MANAGER': return 50;
            case 'AGENT': return 10;
            default: return 20; // Custom roles
        }
    } catch(err) {
        return 20;
    }
};

const canModifyUser = async (reqRoleId, targetRoleId) => {
    const reqLevel = await getRoleLevel(reqRoleId);
    const tgtLevel = await getRoleLevel(targetRoleId);
    if (reqLevel === 100) return true;    // System users can do anything
    if (tgtLevel === 100) return false;   // No one touches System users
    return reqLevel >= tgtLevel;          // Allow modifying same or lower levels
};

// Helper function to check if a role has a specific permission
const checkPermission = async (role_id, permissionId) => {
    try {
        // Fast path: system roles bypass permission checks
        const roleRes = await pg.query('SELECT is_system FROM gescall_roles WHERE role_id = $1', [role_id]);
        if (roleRes.rows.length > 0 && roleRes.rows[0].is_system) {
            return true;
        }

        const result = await pg.query(
            'SELECT 1 FROM gescall_role_permissions WHERE role_id = $1 AND permission = $2',
            [role_id, permissionId]
        );
        return result.rows.length > 0;
    } catch (error) {
        console.error(`Error checking permission ${permissionId} for role_id ${role_id}:`, error);
        return false;
    }
};

// GET all users
router.get('/', async (req, res) => {
    try {
        const query = 'SELECT u.user_id, u.username, u.full_name, u.role_id, r.role_name as role, u.active, u.created_at, u.api_token, u.sip_extension FROM gescall_users u LEFT JOIN gescall_roles r ON u.role_id = r.role_id ORDER BY COALESCE(NULLIF(TRIM(u.full_name), \'\'), u.username) ASC';
        const result = await pg.query(query);

        const reqRoleId = req.user?.role_id;

        // Filter users based on role hierarchy
        const filteredUsers = [];
        for (const user of result.rows) {
            if (await canModifyUser(reqRoleId, user.role_id)) {
                filteredUsers.push(user);
            }
        }

        // Add extension status
        const usersWithStatus = await Promise.all(filteredUsers.map(async (user) => {
            const status = await getExtensionStatus(user.sip_extension);
            return { ...user, extension_status: status };
        }));

        res.json({ success: true, data: usersWithStatus });
    } catch (error) {
        console.error('[Users API] Error fetching users:', error);
        res.status(500).json({ success: false, error: 'Database error fetching users' });
    }
});

// GET single user
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const query = 'SELECT u.user_id, u.username, u.full_name, u.role_id, r.role_name as role, u.active, u.created_at, u.api_token FROM gescall_users u LEFT JOIN gescall_roles r ON u.role_id = r.role_id WHERE u.user_id = $1';
        const result = await pg.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error(`[Users API] Error fetching user ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: 'Database error fetching user' });
    }
});

// CREATE new user
router.post('/', async (req, res) => {
    try {
        const { username, full_name, password, role_id, active } = req.body;
        const reqRoleId = req.user?.role_id;

        const hasPerm = await checkPermission(reqRoleId, 'create_users');
        if (!hasPerm) {
            return res.status(403).json({ success: false, error: 'Acceso denegado: No tienes permiso para crear usuarios' });
        }

        // Validate required fields
        if (!username || !password || !role_id) {
            return res.status(400).json({ success: false, error: 'Username, password and role_id are required' });
        }

        // Hash password with bcrypt before storing
        const password_hash = await bcrypt.hash(password, 10);

        // Check if the role is AGENT to assign extension
        const roleRes = await pg.query('SELECT role_name FROM gescall_roles WHERE role_id = $1', [role_id]);
        let sipExtension = null;
        let sipPassword = null;

        if (roleRes.rows.length > 0 && isAgentRoleName(roleRes.rows[0].role_name)) {
            const extRes = await pg.query("SELECT MAX(sip_extension::integer) as max_ext FROM gescall_users WHERE sip_extension ~ '^[0-9]+$'");
            sipExtension = extRes.rows[0].max_ext ? parseInt(extRes.rows[0].max_ext) + 1 : 1000;
            sipPassword = DEFAULT_AGENT_SIP_PASSWORD;
        }

        const query = `
            INSERT INTO gescall_users (username, full_name, password_hash, role_id, active, sip_extension, sip_password)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING user_id, username, full_name, role_id, active, created_at, sip_extension
        `;

        const normalizedFullName = typeof full_name === 'string' ? full_name.trim() : '';
        const values = [username, normalizedFullName || null, password_hash, role_id, active !== undefined ? active : true, sipExtension?.toString() || null, sipPassword];
        const result = await pg.query(query, values);

        if (sipExtension) {
            await regeneratePjsipGescallUsers();
        }

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('[Users API] Error creating user:', error);
        if (error.code === '23505') { // unique violation
            return res.status(409).json({ success: false, error: 'Username already exists' });
        }
        res.status(500).json({ success: false, error: 'Database error creating user' });
    }
});

// UPDATE user
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, full_name, password, role_id, active } = req.body;
        const reqRoleId = req.user?.role_id;

        const hasPerm = await checkPermission(reqRoleId, 'edit_users');
        if (!hasPerm) {
            return res.status(403).json({ success: false, error: 'Acceso denegado: No tienes permiso para editar usuarios' });
        }

        // Fetch existing user to check their role
        const currentUserQuery = await pg.query('SELECT role_id, sip_extension FROM gescall_users WHERE user_id = $1', [id]);
        if (currentUserQuery.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const existingRoleId = currentUserQuery.rows[0].role_id;
        const existingSipExtension = currentUserQuery.rows[0].sip_extension;

        // Check if requester has permission to modify this user
        const caModify = await canModifyUser(reqRoleId, existingRoleId);
        if (!caModify) {
            return res.status(403).json({ success: false, error: 'Acceso denegado: No puedes modificar a un usuario de este nivel' });
        }

        // Check if requester is trying to assign a role higher than they are allowed
        if (role_id !== undefined && role_id !== existingRoleId && !(await canModifyUser(reqRoleId, role_id))) {
            return res.status(403).json({ success: false, error: `Acceso denegado: No puedes asignar el rol seleccionado` });
        }

        // Build the update query dynamically based on provided fields
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (username !== undefined) {
            updates.push(`username = $${paramCount++}`);
            values.push(username);
        }

        if (full_name !== undefined) {
            updates.push(`full_name = $${paramCount++}`);
            values.push(typeof full_name === 'string' ? (full_name.trim() || null) : null);
        }

        if (password !== undefined && password !== '') {
            updates.push(`password_hash = $${paramCount++}`);
            values.push(await bcrypt.hash(password, 10));
        }

        if (role_id !== undefined) {
            updates.push(`role_id = $${paramCount++}`);
            values.push(role_id);
        }

        if (active !== undefined) {
            updates.push(`active = $${paramCount++}`);
            values.push(active);
        }

        // If assigning AGENT role and user doesn't have an extension, create one
        let needsPjsipRegen = active !== undefined;
        if (role_id !== undefined) {
            const newRoleRes = await pg.query('SELECT role_name FROM gescall_roles WHERE role_id = $1', [role_id]);
            if (newRoleRes.rows.length > 0 && isAgentRoleName(newRoleRes.rows[0].role_name)) {
                if (!existingSipExtension) {
                    const extRes = await pg.query("SELECT MAX(sip_extension::integer) as max_ext FROM gescall_users WHERE sip_extension ~ '^[0-9]+$'");
                    const newExtension = extRes.rows[0].max_ext ? parseInt(extRes.rows[0].max_ext) + 1 : 1000;
                    const sipPassword = DEFAULT_AGENT_SIP_PASSWORD;
                    updates.push(`sip_extension = $${paramCount++}`);
                    values.push(newExtension.toString());
                    updates.push(`sip_password = $${paramCount++}`);
                    values.push(sipPassword);
                    needsPjsipRegen = true;
                }
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No data provided to update' });
        }

        // Add the ID parameter at the end
        values.push(id);
        const query = `
            UPDATE gescall_users 
            SET ${updates.join(', ')} 
            WHERE user_id = $${paramCount}
            RETURNING user_id, username, full_name, role_id, active, created_at, sip_extension
        `;

        const result = await pg.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (needsPjsipRegen) {
            await regeneratePjsipGescallUsers();
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error(`[Users API] Error updating user ${req.params.id}:`, error);
        if (error.code === '23505') { // unique violation
            return res.status(409).json({ success: false, error: 'Username already exists' });
        }
        res.status(500).json({ success: false, error: 'Database error updating user' });
    }
});

// DELETE user
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const reqRoleId = req.user?.role_id;

        const hasPerm = await checkPermission(reqRoleId, 'delete_users');
        if (!hasPerm) {
            return res.status(403).json({ success: false, error: 'Acceso denegado: No tienes permiso para eliminar usuarios' });
        }

        const currentUserQuery = await pg.query('SELECT role_id FROM gescall_users WHERE user_id = $1', [id]);
        if (currentUserQuery.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const existingRoleId = currentUserQuery.rows[0].role_id;

        const caModify = await canModifyUser(reqRoleId, existingRoleId);
        if (!caModify) {
            return res.status(403).json({ success: false, error: 'Acceso denegado: No puedes eliminar a un usuario de este nivel' });
        }

        const query = 'DELETE FROM gescall_users WHERE user_id = $1 RETURNING user_id';
        const result = await pg.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await regeneratePjsipGescallUsers();

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error(`[Users API] Error deleting user ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: 'Database error deleting user' });
    }
});

// GET assigned campaigns for a user
router.get('/:id/campaigns', async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT campaign_id 
            FROM gescall_user_campaigns 
            WHERE user_id = $1
        `;
        const result = await pg.query(query, [id]);

        res.json({ success: true, data: result.rows.map(row => row.campaign_id) });
    } catch (error) {
        console.error(`[Users API] Error fetching campaigns for user ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: 'Database error fetching user campaigns' });
    }
});

// UPDATE assigned campaigns for a user
router.put('/:id/campaigns', async (req, res) => {
    try {
        const { id } = req.params;
        const { campaign_ids } = req.body;
        const reqRoleId = req.user?.role_id;

        const hasPerm = await checkPermission(reqRoleId, 'assign_user_campaigns');
        if (!hasPerm) {
            return res.status(403).json({ success: false, error: 'Acceso denegado: No tienes permiso para asignar campañas' });
        }

        if (!Array.isArray(campaign_ids)) {
            return res.status(400).json({ success: false, error: 'campaign_ids must be an array' });
        }

        const client = await pg.pool.connect();
        try {
            await client.query('BEGIN');

            const userCheck = await client.query('SELECT user_id FROM gescall_users WHERE user_id = $1', [id]);
            if (userCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            await client.query('DELETE FROM gescall_user_campaigns WHERE user_id = $1', [id]);

            if (campaign_ids.length > 0) {
                const values = [];
                const parameters = [];
                let currentParam = 1;

                for (const campaign_id of campaign_ids) {
                    parameters.push(`($1, $${currentParam + 1})`);
                    values.push(campaign_id);
                    currentParam++;
                }

                const insertQuery = `
                    INSERT INTO gescall_user_campaigns (user_id, campaign_id)
                    VALUES ${parameters.join(', ')}
                `;

                const queryParams = [id, ...values];
                await client.query(insertQuery, queryParams);
            }

            await client.query('COMMIT');

            res.json({ success: true, message: 'User campaigns updated successfully' });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error(`[Users API] Error updating campaigns for user ${req.params?.id}:`, error);
        res.status(500).json({ success: false, error: 'Database error updating user campaigns' });
    }
});

// GENERATE API TOKEN
router.post('/:id/api-token', async (req, res) => {
    try {
        const { id } = req.params;
        const reqRoleId = req.user?.role_id;

        const hasPerm = await checkPermission(reqRoleId, 'edit_users');
        if (!hasPerm) {
            return res.status(403).json({ success: false, error: 'Acceso denegado: No tienes permiso para editar usuarios' });
        }

        const userQuery = await pg.query('SELECT role_id FROM gescall_users WHERE user_id = $1', [id]);
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        const existingRoleId = userQuery.rows[0].role_id;
        const caModify = await canModifyUser(reqRoleId, existingRoleId);
        if (!caModify) {
            return res.status(403).json({ success: false, error: 'Jerarquía insuficiente para modificar este usuario' });
        }

        const token = crypto.randomBytes(32).toString('hex');

        await pg.query('UPDATE gescall_users SET api_token = $1 WHERE user_id = $2', [token, id]);

        res.json({ success: true, token, message: 'Token generado correctamente' });
    } catch (error) {
        console.error(`[Users API] Error generating API token for user ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: 'Database error generating API token' });
    }
});

// REVOKE API TOKEN
router.delete('/:id/api-token', async (req, res) => {
    try {
        const { id } = req.params;
        const reqRoleId = req.user?.role_id;

        const hasPerm = await checkPermission(reqRoleId, 'edit_users');
        if (!hasPerm) {
            return res.status(403).json({ success: false, error: 'Acceso denegado: No tienes permiso para editar usuarios' });
        }

        const userQuery = await pg.query('SELECT role_id FROM gescall_users WHERE user_id = $1', [id]);
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        const existingRoleId = userQuery.rows[0].role_id;
        const caModify = await canModifyUser(reqRoleId, existingRoleId);
        if (!caModify) {
            return res.status(403).json({ success: false, error: 'Jerarquía insuficiente para modificar este usuario' });
        }

        await pg.query('UPDATE gescall_users SET api_token = NULL WHERE user_id = $1', [id]);

        res.json({ success: true, message: 'Token revocado correctamente' });
    } catch (error) {
        console.error(`[Users API] Error revoking API token for user ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: 'Database error revoking API token' });
    }
});
// GET user widgets
router.get('/:id/widgets', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pg.query(`
            SELECT widgets_data FROM gescall_user_widgets 
            WHERE user_id = (
                SELECT user_id FROM gescall_users WHERE user_id::text = $1 OR username = $1 LIMIT 1
            )
        `, [id]);
        if (result.rows.length === 0) {
            return res.json({ success: true, data: {} });
        }
        res.json({ success: true, data: result.rows[0].widgets_data });
    } catch (error) {
        console.error(`[Users API] Error fetching widgets for user ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: 'Database error fetching user widgets' });
    }
});

// UPDATE user widgets
router.put('/:id/widgets', async (req, res) => {
    try {
        const { id } = req.params;
        const { widgets_data } = req.body;
        
        // Ensure we get the actual integer user_id
        const userRes = await pg.query('SELECT user_id FROM gescall_users WHERE user_id::text = $1 OR username = $1 LIMIT 1', [id]);
        if (userRes.rows.length === 0) {
             return res.status(404).json({ success: false, error: 'User not found' });
        }
        const actualUserId = userRes.rows[0].user_id;

        const query = `
            INSERT INTO gescall_user_widgets (user_id, widgets_data, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) 
            DO UPDATE SET widgets_data = $2, updated_at = CURRENT_TIMESTAMP
            RETURNING widgets_data
        `;
        const result = await pg.query(query, [actualUserId, widgets_data || {}]);
        res.json({ success: true, data: result.rows[0].widgets_data });
    } catch (error) {
        console.error(`[Users API] Error updating widgets for user ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: 'Database error updating user widgets' });
    }
});

module.exports = router;
