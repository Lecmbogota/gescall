/**
 * Migration 034: Metas del workspace — ventana de N días y tipificación contable
 * - gescall_campaigns.workspace_goal_period_days (1 = solo hoy, como hasta ahora)
 * - gescall_campaigns.workspace_goal_typification_id (NULL = todas las tipificaciones)
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
            ADD COLUMN IF NOT EXISTS workspace_goal_period_days INTEGER NOT NULL DEFAULT 1
        `);

        await client.query(`
            ALTER TABLE gescall_campaigns
            ADD COLUMN IF NOT EXISTS workspace_goal_typification_id INTEGER
        `);

        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_workspace_goal_typification'
                ) THEN
                    ALTER TABLE gescall_campaigns
                    ADD CONSTRAINT fk_workspace_goal_typification
                    FOREIGN KEY (workspace_goal_typification_id)
                    REFERENCES gescall_typifications(id) ON DELETE SET NULL;
                END IF;
            END
            $$
        `);

        await client.query('COMMIT');
        console.log('[Migration 034] ✓ Migration completed');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 034] ✗ Migration failed:', err.message);
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
