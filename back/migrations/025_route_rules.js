/**
 * Migration 025: Reglas de enrutamiento entrante/saliente (MVP)
 * - gescall_route_rules: troncal opcional + DID (entrante) o campaña (saliente) + tipo de destino
 * - Permiso manage_routing para el rol sistema (role_id=1 o is_system)
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
            CREATE TABLE IF NOT EXISTS gescall_route_rules (
                id SERIAL PRIMARY KEY,
                direction VARCHAR(16) NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
                priority INTEGER NOT NULL DEFAULT 100,
                active BOOLEAN NOT NULL DEFAULT true,
                trunk_id VARCHAR(50) REFERENCES gescall_trunks(trunk_id) ON DELETE SET NULL,
                match_did VARCHAR(64),
                match_campaign_id VARCHAR(64) REFERENCES gescall_campaigns(campaign_id) ON DELETE CASCADE,
                destination_type VARCHAR(32) NOT NULL,
                destination_campaign_id VARCHAR(64) REFERENCES gescall_campaigns(campaign_id) ON DELETE SET NULL,
                destination_external_number VARCHAR(64),
                description TEXT,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
                CONSTRAINT chk_route_inbound_did CHECK (
                    direction <> 'INBOUND' OR match_did IS NOT NULL
                ),
                CONSTRAINT chk_route_outbound_campaign CHECK (
                    direction <> 'OUTBOUND' OR match_campaign_id IS NOT NULL
                ),
                CONSTRAINT chk_route_dest_campaign CHECK (
                    (destination_type IN ('CAMPAIGN_QUEUE', 'IVR_THEN_QUEUE') AND destination_campaign_id IS NOT NULL)
                    OR (destination_type NOT IN ('CAMPAIGN_QUEUE', 'IVR_THEN_QUEUE'))
                )
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_route_rules_inbound
            ON gescall_route_rules (direction, active, match_did)
            WHERE direction = 'INBOUND'
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_route_rules_outbound
            ON gescall_route_rules (direction, active, match_campaign_id)
            WHERE direction = 'OUTBOUND'
        `);

        console.log('[Migration 025] ✓ Created gescall_route_rules');

        const sysRoleRes = await client.query(
            `SELECT role_id FROM gescall_roles WHERE role_id = 1 OR is_system = true ORDER BY role_id ASC LIMIT 1`
        );

        if (sysRoleRes.rows.length > 0) {
            const sysRoleId = sysRoleRes.rows[0].role_id;
            await client.query(
                `INSERT INTO gescall_role_permissions (role_id, permission)
                 VALUES ($1, 'manage_routing')
                 ON CONFLICT DO NOTHING`,
                [sysRoleId]
            );
            console.log(`[Migration 025] ✓ Granted manage_routing to role_id=${sysRoleId}`);
        } else {
            console.warn('[Migration 025] ⚠ No system role found; manage_routing not granted');
        }

        await client.query('COMMIT');
        console.log('[Migration 025] ✓ Migration completed');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 025] ✗ Migration failed:', err.message);
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
