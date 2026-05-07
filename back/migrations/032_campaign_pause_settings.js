/**
 * Migration 032: Configuración de pausas por campaña.
 * - Agrega gescall_campaigns.pause_settings (JSONB)
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
            ALTER TABLE gescall_campaigns
            ADD COLUMN IF NOT EXISTS pause_settings JSONB
            NOT NULL DEFAULT '{}'::jsonb
        `);
        await client.query('COMMIT');
        console.log('[Migration 032] ✓ pause_settings agregado en gescall_campaigns');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 032] ✗ Migration failed:', err.message);
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

