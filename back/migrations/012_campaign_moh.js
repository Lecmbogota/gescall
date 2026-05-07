/**
 * Migration 012: Add Music on Hold (MOH) configuration to campaigns
 * - moh_class: Asterisk MOH class name (NULL = system default)
 * - moh_custom_file: custom audio filename for per-campaign queue music
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
            ADD COLUMN IF NOT EXISTS moh_class VARCHAR(100)
        `);
        console.log('[Migration 012] ✓ Added moh_class to gescall_campaigns');

        await client.query(`
            ALTER TABLE gescall_campaigns 
            ADD COLUMN IF NOT EXISTS moh_custom_file VARCHAR(255)
        `);
        console.log('[Migration 012] ✓ Added moh_custom_file to gescall_campaigns');

        await client.query('COMMIT');
        console.log('[Migration 012] ✓ Migration completed successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 012] ✗ Migration failed:', err.message);
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
