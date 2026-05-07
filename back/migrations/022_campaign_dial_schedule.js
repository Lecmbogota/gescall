/**
 * Migration 022: Horario de discado por campaña (JSONB).
 * Formato: { enabled, timezone, windows: [{ days: number[], start: "HH:MM", end: "HH:MM" }] }
 * days: 0=domingo … 6=sábado (igual que Date.getDay() / Go Weekday).
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
            ADD COLUMN IF NOT EXISTS dial_schedule JSONB DEFAULT NULL
        `);
        console.log('[Migration 022] ✓ Added dial_schedule to gescall_campaigns');

        await client.query('COMMIT');
        console.log('[Migration 022] ✓ Migration completed successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 022] ✗ Migration failed:', err.message);
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

module.exports = { migrate };
