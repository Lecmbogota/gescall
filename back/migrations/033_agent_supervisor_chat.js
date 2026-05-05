/**
 * Migration 033: Chat bidireccional agente <-> supervisor por campaña.
 * - Tabla de mensajes con hilo por (campaign_id, agent_username)
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
            CREATE TABLE IF NOT EXISTS gescall_agent_supervisor_chat_messages (
                id BIGSERIAL PRIMARY KEY,
                campaign_id VARCHAR(64) NOT NULL REFERENCES gescall_campaigns(campaign_id) ON DELETE CASCADE,
                agent_username VARCHAR(100) NOT NULL,
                sender_user_id INTEGER REFERENCES gescall_users(user_id) ON DELETE SET NULL,
                sender_username VARCHAR(100) NOT NULL,
                sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('AGENT', 'SUPERVISOR')),
                body TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_agent_supervisor_chat_thread
            ON gescall_agent_supervisor_chat_messages (campaign_id, agent_username, created_at DESC)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_agent_supervisor_chat_sender
            ON gescall_agent_supervisor_chat_messages (sender_user_id, created_at DESC)
        `);

        await client.query('COMMIT');
        console.log('[Migration 033] ✓ Chat agente-supervisor creado');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 033] ✗ Migration failed:', err.message);
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
