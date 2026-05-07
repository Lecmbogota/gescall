/**
 * Migration 016: Call Dispositions (Disposiciones de Llamada)
 * Configurable per campaign with condition-based matching.
 *
 * gescall_dispositions: Each row defines a disposition label and the
 * conditions that trigger it. Evaluated in sort_order; first match wins.
 *
 * Conditions JSONB schema:
 * {
 *   "call_status": ["ANSWER","HANGUP",...],    // match any of these
 *   "lead_status": ["SALE","PU",...],          // match any of these
 *   "dtmf": ["2","1",...],                     // match any of these
 *   "exclude_typification": true,              // only match if NO typification
 *   "require_typification": true,              // only match if HAS typification
 *   "min_duration": 5                          // minimum call duration (seconds)
 * }
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

const DEFAULT_DISPOSITIONS = [
    { code: 'TRANSFERIDO', label: 'Transferido', color: 'bg-green-500', sort_order: 1,
      conditions: { dtmf: ['2'], call_status: ['XFER'], require_typification: true } },
    { code: 'CONTESTADA',  label: 'Contestada',  color: 'bg-blue-500',  sort_order: 2,
      conditions: { require_typification: true } },
    { code: 'COMPLETADO',  label: 'Completado',  color: 'bg-blue-500',  sort_order: 3,
      conditions: { call_status: ['COMPLET'] } },
    { code: 'RECHAZADA',   label: 'Rechazada',   color: 'bg-orange-500', sort_order: 4,
      conditions: { call_status: ['HANGUP'], exclude_typification: true } },
    { code: 'FALLIDA',     label: 'Fallida',     color: 'bg-red-500',   sort_order: 5,
      conditions: { call_status: ['FAILED'] } },
    { code: 'NO_CONTESTA', label: 'No Contesta', color: 'bg-yellow-500', sort_order: 6,
      conditions: { call_status: ['DIALING','IVR_START','NA','RINGING','AA','N'], lead_status: ['NA','AA','N','NEW','QUEUE'], exclude_typification: true } },
    { code: 'OCUPADO',     label: 'Ocupado',     color: 'bg-purple-500', sort_order: 7,
      conditions: { call_status: ['B','BUSY','CONGESTION','AB'], lead_status: ['B','AB'] } },
    { code: 'CORTADA',     label: 'Cortada',     color: 'bg-red-400',  sort_order: 8,
      conditions: { call_status: ['DROP','PDROP','XDROP'], lead_status: ['DROP','PDROP','XDROP'] } },
    { code: 'BUZON',       label: 'Buzón',       color: 'bg-indigo-400', sort_order: 9,
      conditions: { call_status: ['AM','AL'] } },
    { code: 'NO_LLAMAR',   label: 'No Llamar',   color: 'bg-slate-500', sort_order: 10,
      conditions: { call_status: ['DNC','DNCC'] } },
    { code: 'VENTA',       label: 'Venta',       color: 'bg-emerald-600', sort_order: 11,
      conditions: { call_status: ['SALE'], lead_status: ['SALE'] } },
];

async function migrate() {
    const client = await pg.pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS gescall_dispositions (
                id SERIAL PRIMARY KEY,
                campaign_id VARCHAR(50) NOT NULL REFERENCES gescall_campaigns(campaign_id) ON DELETE CASCADE,
                code VARCHAR(50) NOT NULL,
                label VARCHAR(255) NOT NULL,
                color VARCHAR(50) DEFAULT 'bg-slate-400',
                sort_order INTEGER DEFAULT 0,
                conditions JSONB DEFAULT '{}'::jsonb,
                active BOOLEAN DEFAULT true,
                is_default BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(campaign_id, code)
            )
        `);
        console.log('[Migration 016] ✓ Created gescall_dispositions');

        await client.query(`CREATE INDEX IF NOT EXISTS idx_dispositions_campaign ON gescall_dispositions(campaign_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_dispositions_sort ON gescall_dispositions(campaign_id, sort_order)`);

        // Seed defaults for all existing campaigns that don't have dispositions yet
        const { rows: campaigns } = await client.query(
            `SELECT campaign_id FROM gescall_campaigns c
             WHERE NOT EXISTS (
                SELECT 1 FROM gescall_dispositions d WHERE d.campaign_id = c.campaign_id
             )`
        );

        for (const camp of campaigns) {
            for (const d of DEFAULT_DISPOSITIONS) {
                await client.query(
                    `INSERT INTO gescall_dispositions (campaign_id, code, label, color, sort_order, conditions, active, is_default)
                     VALUES ($1, $2, $3, $4, $5, $6::jsonb, true, true)
                     ON CONFLICT (campaign_id, code) DO NOTHING`,
                    [camp.campaign_id, d.code, d.label, d.color, d.sort_order, JSON.stringify(d.conditions)]
                );
            }
            console.log(`[Migration 016] ✓ Seeded defaults for campaign ${camp.campaign_id}`);
        }

        await client.query('COMMIT');
        console.log(`[Migration 016] ✓ Migration completed (${campaigns.length} campaigns seeded)`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 016] ✗ Migration failed:', err.message);
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
