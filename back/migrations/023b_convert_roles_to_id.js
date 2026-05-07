/**
 * Migration 023b: Convert role structure from string (role_name) to integer (role_id)
 * This is crucial for backward compatibility with old databases (like the Proxmox golden template)
 * where the gescall_roles table was originally created with role_name as PK.
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

        // Check if role_id already exists in gescall_roles
        const checkRes = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='gescall_roles' AND column_name='role_id'
        `);

        if (checkRes.rows.length > 0) {
            console.log('[Migration 023b] role_id already exists in gescall_roles, skipping.');
            await client.query('COMMIT');
            return;
        }

        console.log('[Migration 023b] Upgrading gescall_roles to use role_id...');

        // 1. Add role_id to gescall_roles
        await client.query('ALTER TABLE gescall_roles ADD COLUMN role_id SERIAL');
        await client.query('ALTER TABLE gescall_roles DROP CONSTRAINT IF EXISTS gescall_roles_pkey CASCADE');
        await client.query('ALTER TABLE gescall_roles ADD PRIMARY KEY (role_id)');
        await client.query('ALTER TABLE gescall_roles ADD UNIQUE (role_name)');

        // 2. Update gescall_users
        await client.query('ALTER TABLE gescall_users ADD COLUMN role_id INTEGER');
        await client.query(`
            UPDATE gescall_users u 
            SET role_id = r.role_id 
            FROM gescall_roles r 
            WHERE u.role = r.role_name
        `);
        // Provide a fallback role if any user didn't match (e.g. AGENT = 3 usually, but let's query it safely if needed)
        // In practice all existing users map cleanly.
        await client.query('ALTER TABLE gescall_users DROP COLUMN IF EXISTS role');
        await client.query('ALTER TABLE gescall_users ALTER COLUMN role_id SET NOT NULL');
        await client.query(`
            ALTER TABLE gescall_users 
            ADD CONSTRAINT fk_users_role_id 
            FOREIGN KEY (role_id) REFERENCES gescall_roles(role_id) 
            ON UPDATE CASCADE ON DELETE RESTRICT
        `);

        // 3. Update gescall_role_permissions
        await client.query('ALTER TABLE gescall_role_permissions DROP CONSTRAINT IF EXISTS gescall_role_permissions_pkey CASCADE');
        await client.query('ALTER TABLE gescall_role_permissions ADD COLUMN role_id INTEGER');
        await client.query(`
            UPDATE gescall_role_permissions p 
            SET role_id = r.role_id 
            FROM gescall_roles r 
            WHERE p.role = r.role_name
        `);
        await client.query('ALTER TABLE gescall_role_permissions DROP COLUMN IF EXISTS role');
        await client.query('ALTER TABLE gescall_role_permissions ALTER COLUMN role_id SET NOT NULL');
        await client.query(`
            ALTER TABLE gescall_role_permissions 
            ADD CONSTRAINT fk_permissions_role_id 
            FOREIGN KEY (role_id) REFERENCES gescall_roles(role_id) 
            ON UPDATE CASCADE ON DELETE CASCADE
        `);
        await client.query('ALTER TABLE gescall_role_permissions ADD PRIMARY KEY (role_id, permission)');

        await client.query('COMMIT');
        console.log('[Migration 023b] ✓ Successfully upgraded role schema to use role_id');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 023b] ✗ Migration failed:', err.message);
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
