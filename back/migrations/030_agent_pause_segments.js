/**
 * Migration 030: Segmentos de pausa por agente (auditoría para reportes).
 * - gescall_agent_pause_segments: cada vez que un agente entra/sale de NOT_READY / NOT_READY_*
 *
 * Ejecutar: node migrations/030_agent_pause_segments.js
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
            CREATE TABLE IF NOT EXISTS gescall_agent_pause_segments (
                segment_id BIGSERIAL PRIMARY KEY,
                agent_username VARCHAR(100) NOT NULL,
                pause_code VARCHAR(64) NOT NULL,
                campaign_id VARCHAR(50),
                started_at TIMESTAMPTZ NOT NULL,
                ended_at TIMESTAMPTZ,
                duration_sec INTEGER,
                CONSTRAINT chk_pause_duration_nonneg CHECK (duration_sec IS NULL OR duration_sec >= 0)
            )
        `);
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_agent_pause_segments_agent_time ON gescall_agent_pause_segments (agent_username, started_at DESC)`
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_agent_pause_segments_open ON gescall_agent_pause_segments (agent_username) WHERE ended_at IS NULL`
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_agent_pause_segments_campaign ON gescall_agent_pause_segments (campaign_id, started_at DESC) WHERE campaign_id IS NOT NULL`
        );

        await client.query('COMMIT');
        console.log('[Migration 030] ✓ gescall_agent_pause_segments listo');
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
