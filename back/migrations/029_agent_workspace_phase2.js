/**
 * Migration 029: Fase 2 workspace agente — avisos supervisor, callbacks, meta diaria por campaña
 * - gescall_supervisor_notices + dismissals por usuario
 * - gescall_agent_callbacks (asignados por user_id)
 * - gescall_campaigns.workspace_daily_target (meta diaria mostrada en widget)
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
            CREATE TABLE IF NOT EXISTS gescall_supervisor_notices (
                id SERIAL PRIMARY KEY,
                body TEXT NOT NULL,
                campaign_id VARCHAR(64) REFERENCES gescall_campaigns(campaign_id) ON DELETE CASCADE,
                starts_at TIMESTAMPTZ DEFAULT NOW(),
                ends_at TIMESTAMPTZ,
                active BOOLEAN NOT NULL DEFAULT true,
                created_by_user_id INTEGER REFERENCES gescall_users(user_id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_supervisor_notices_active ON gescall_supervisor_notices (active, starts_at, ends_at)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_supervisor_notices_campaign ON gescall_supervisor_notices (campaign_id)`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS gescall_supervisor_notice_dismissals (
                notice_id INTEGER NOT NULL REFERENCES gescall_supervisor_notices(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES gescall_users(user_id) ON DELETE CASCADE,
                dismissed_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (notice_id, user_id)
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS gescall_agent_callbacks (
                id SERIAL PRIMARY KEY,
                assignee_user_id INTEGER NOT NULL REFERENCES gescall_users(user_id) ON DELETE CASCADE,
                campaign_id VARCHAR(64) REFERENCES gescall_campaigns(campaign_id) ON DELETE SET NULL,
                contact_name VARCHAR(200) NOT NULL,
                phone VARCHAR(40),
                scheduled_at TIMESTAMPTZ NOT NULL,
                notes TEXT,
                status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                created_by_user_id INTEGER REFERENCES gescall_users(user_id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_callbacks_assignee ON gescall_agent_callbacks (assignee_user_id, status, scheduled_at)`);

        await client.query(`
            ALTER TABLE gescall_campaigns
            ADD COLUMN IF NOT EXISTS workspace_daily_target INTEGER NOT NULL DEFAULT 20
        `);

        await client.query('COMMIT');
        console.log('[Migration 029] ✓ Migration completed');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 029] ✗ Migration failed:', err.message);
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
