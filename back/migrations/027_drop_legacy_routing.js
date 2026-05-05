/**
 * Migration 027: Eliminar enrutamiento legacy
 *  - Migra cualquier fila pendiente de gescall_inbound_dids a gescall_route_rules.
 *  - Convierte reglas OUTBOUND con destination_type='USE_CAMPAIGN_DEFAULT' en OVERRIDE_TRUNK
 *    usando gescall_campaigns.trunk_id; si no hay trunk_id legacy, marca la regla inactiva.
 *  - Hace DROP de gescall_inbound_dids y de la columna gescall_campaigns.trunk_id.
 *  - Añade CHECK constraint en destination_type para evitar valores legacy.
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

async function tableExists(client, name) {
    const r = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public' LIMIT 1`,
        [name]
    );
    return r.rows.length > 0;
}

async function columnExists(client, table, column) {
    const r = await client.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1`,
        [table, column]
    );
    return r.rows.length > 0;
}

async function migrate() {
    const client = await pg.pool.connect();
    try {
        await client.query('BEGIN');

        // 1) Migrar gescall_inbound_dids → gescall_route_rules (CAMPAIGN_QUEUE)
        if (await tableExists(client, 'gescall_inbound_dids')) {
            const ins = await client.query(`
                INSERT INTO gescall_route_rules (
                    direction, priority, active, trunk_id,
                    match_did, match_campaign_id,
                    destination_type, destination_campaign_id, description
                )
                SELECT 'INBOUND', 100, COALESCE(d.active, true), NULLIF(TRIM(d.trunk_id), ''),
                       d.did_number, NULL,
                       'CAMPAIGN_QUEUE', d.campaign_id,
                       'Migrado desde gescall_inbound_dids (027)'
                FROM gescall_inbound_dids d
                WHERE d.campaign_id IS NOT NULL
                  AND d.did_number IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM gescall_route_rules r
                      WHERE r.direction = 'INBOUND'
                        AND r.match_did = d.did_number
                        AND COALESCE(r.trunk_id, '') = COALESCE(NULLIF(TRIM(d.trunk_id),''), '')
                  )
                RETURNING id
            `);
            console.log(`[Migration 027] ✓ Migrados ${ins.rows.length} DID(s) legacy a gescall_route_rules`);

            await client.query('DROP TABLE gescall_inbound_dids');
            console.log('[Migration 027] ✓ DROP gescall_inbound_dids');
        } else {
            console.log('[Migration 027] gescall_inbound_dids no existe, omitido');
        }

        // 2) Convertir reglas USE_CAMPAIGN_DEFAULT → OVERRIDE_TRUNK con trunk_id legacy
        if (await columnExists(client, 'gescall_campaigns', 'trunk_id')) {
            const upd = await client.query(`
                UPDATE gescall_route_rules r
                SET destination_type = 'OVERRIDE_TRUNK',
                    trunk_id = NULLIF(TRIM(c.trunk_id), ''),
                    description = COALESCE(r.description, '') ||
                                  ' [027: migrado de USE_CAMPAIGN_DEFAULT]',
                    updated_at = NOW()
                FROM gescall_campaigns c
                WHERE r.direction = 'OUTBOUND'
                  AND r.destination_type = 'USE_CAMPAIGN_DEFAULT'
                  AND r.match_campaign_id = c.campaign_id
                  AND NULLIF(TRIM(c.trunk_id), '') IS NOT NULL
                RETURNING r.id
            `);
            console.log(`[Migration 027] ✓ Convertidas ${upd.rows.length} reglas USE_CAMPAIGN_DEFAULT con trunk_id legacy`);

            const stale = await client.query(`
                UPDATE gescall_route_rules
                SET active = false,
                    description = COALESCE(description, '') ||
                                  ' [027: USE_CAMPAIGN_DEFAULT sin trunk_id legacy — desactivada]',
                    updated_at = NOW()
                WHERE direction = 'OUTBOUND'
                  AND destination_type = 'USE_CAMPAIGN_DEFAULT'
                RETURNING id
            `);
            if (stale.rows.length > 0) {
                console.log(`[Migration 027] ⚠ Desactivadas ${stale.rows.length} reglas USE_CAMPAIGN_DEFAULT sin troncal legacy. Configúralas en Enrutamiento.`);
            }

            // 3) DROP columna trunk_id legacy
            await client.query('ALTER TABLE gescall_campaigns DROP COLUMN trunk_id');
            console.log('[Migration 027] ✓ DROP gescall_campaigns.trunk_id');
        } else {
            console.log('[Migration 027] gescall_campaigns.trunk_id no existe, omitido');
        }

        // 4) Endurecer CHECK de destination_type
        await client.query(`ALTER TABLE gescall_route_rules DROP CONSTRAINT IF EXISTS chk_route_destination_type`);
        await client.query(`
            ALTER TABLE gescall_route_rules
            ADD CONSTRAINT chk_route_destination_type
            CHECK (destination_type IN ('CAMPAIGN_QUEUE', 'IVR_THEN_QUEUE', 'EXTERNAL_NUMBER', 'OVERRIDE_TRUNK'))
        `);
        console.log('[Migration 027] ✓ CHECK destination_type sin USE_CAMPAIGN_DEFAULT');

        await client.query('COMMIT');
        console.log('[Migration 027] ✓ Migration completed');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 027] ✗ Migration failed:', err.message);
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
