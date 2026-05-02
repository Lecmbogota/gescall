/**
 * Migration 013: Add call_direction column to gescall_call_log
 * - call_direction: 'INBOUND' | 'OUTBOUND'
 * - Defaults to 'OUTBOUND' for backward compatibility
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
            ALTER TABLE gescall_call_log 
            ADD COLUMN IF NOT EXISTS call_direction VARCHAR(10) DEFAULT 'OUTBOUND'
        `);
        console.log('[Migration 013] ✓ Added call_direction to gescall_call_log');

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_gescall_call_log_direction 
            ON gescall_call_log (call_direction)
        `);
        console.log('[Migration 013] ✓ Created index on call_direction');

        await client.query('COMMIT');
        console.log('[Migration 013] ✓ Migration completed successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 013] ✗ Migration failed:', err.message);
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
