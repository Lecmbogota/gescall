/**
 * Migration 030: Permiso manage_agent_workspace
 * - Otorga manage_agent_workspace a todo rol que ya tenga permiso 'admin' (mismo alcance que antes en API).
 */
const fs = require('fs');
const dotenv = require('dotenv');
if (fs.existsSync(__dirname + '/../.env')) {
    const envConfig = dotenv.parse(fs.readFileSync(__dirname + '/../.env'));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}
const pg = require('../config/pgDatabase');

async function migrate() {
    const client = await pg.pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            INSERT INTO gescall_role_permissions (role_id, permission)
            SELECT DISTINCT rp.role_id, 'manage_agent_workspace'
            FROM gescall_role_permissions rp
            WHERE rp.permission = 'admin'
            AND NOT EXISTS (
                SELECT 1 FROM gescall_role_permissions x
                WHERE x.role_id = rp.role_id AND x.permission = 'manage_agent_workspace'
            )
        `);

        await client.query(`
            INSERT INTO gescall_role_permissions (role_id, permission)
            SELECT r.role_id, 'manage_agent_workspace'
            FROM gescall_roles r
            WHERE r.is_system = true
            AND NOT EXISTS (
                SELECT 1 FROM gescall_role_permissions x
                WHERE x.role_id = r.role_id AND x.permission = 'manage_agent_workspace'
            )
        `);

        await client.query('COMMIT');
        console.log('[Migration 030] ✓ Migration completed');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 030] ✗ Migration failed:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

if (require.main === module) {
    migrate()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = migrate;
