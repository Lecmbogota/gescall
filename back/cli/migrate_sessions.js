const pg = require('../config/pgDatabase');

async function migrate() {
    try {
        await pg.query(`
            CREATE TABLE IF NOT EXISTS gescall_campaign_sessions (
                session_id SERIAL PRIMARY KEY,
                campaign_id VARCHAR(50) NOT NULL REFERENCES gescall_campaigns(campaign_id),
                activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                activated_by VARCHAR(50) NOT NULL,
                deactivated_at TIMESTAMP NULL,
                deactivated_by VARCHAR(50) NULL,
                duration_seconds INT NULL
            );
        `);
        console.log("Table created.");
        await pg.query(`
            CREATE INDEX IF NOT EXISTS idx_campaign_sessions_camp ON gescall_campaign_sessions(campaign_id);
        `);
        console.log("Index created.");
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
migrate();
