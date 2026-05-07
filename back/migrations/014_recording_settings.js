/**
 * Migration 014: Add recording_settings JSONB column to gescall_campaigns
 * Stores: enabled, storage (local|external), external_type (sftp|ftp|s3),
 * host, port, username, password, access_key, secret_key, region, bucket,
 * filename_pattern
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
            ADD COLUMN IF NOT EXISTS recording_settings JSONB DEFAULT '{"enabled":true,"storage":"local","filename_pattern":"{campaign_name}_{date}_{time}"}'::jsonb
        `);
        console.log('[Migration 014] ✓ Added recording_settings to gescall_campaigns');

        await client.query('COMMIT');
        console.log('[Migration 014] ✓ Migration completed successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 014] ✗ Migration failed:', err.message);
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
