/**
 * Migration 026: Sembrar reglas OUTBOUND desde gescall_campaigns.trunk_id
 * (solo si aún no existe regla saliente para esa campaña).
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

        const insertRes = await client.query(`
            INSERT INTO gescall_route_rules (
                direction, priority, active, trunk_id, match_did, match_campaign_id,
                destination_type, destination_campaign_id, description
            )
            SELECT
                'OUTBOUND', 100, true, NULLIF(TRIM(c.trunk_id), ''), NULL, c.campaign_id,
                'OVERRIDE_TRUNK', NULL,
                'Sembrado desde trunk_id de campaña (026)'
            FROM gescall_campaigns c
            WHERE c.trunk_id IS NOT NULL AND TRIM(c.trunk_id) <> ''
              AND c.campaign_type IN ('BLASTER', 'OUTBOUND_PREDICTIVE', 'OUTBOUND_PROGRESSIVE', 'OUTBOUND')
              AND NOT EXISTS (
                  SELECT 1 FROM gescall_route_rules r
                  WHERE r.direction = 'OUTBOUND' AND r.match_campaign_id = c.campaign_id
              )
            RETURNING id, match_campaign_id
        `);
        console.log(`[Migration 026] ✓ Inserted ${insertRes.rows.length} outbound route rule(s) from campaign trunks`);

        await client.query('COMMIT');
        console.log('[Migration 026] ✓ Migration completed');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 026] ✗ Migration failed:', err.message);
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
