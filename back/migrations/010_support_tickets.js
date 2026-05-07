/**
 * Migration 010: Create support tickets and ticket comments tables
 * For Jira-integrated support ticket system
 */
const pg = require('../config/pgDatabase');

async function migrate() {
    const client = await pg.pool.connect();
    try {
        await client.query('BEGIN');

        // Support tickets table
        await client.query(`
      CREATE TABLE IF NOT EXISTS gescall_support_tickets (
        id SERIAL PRIMARY KEY,
        jira_key VARCHAR(20),
        jira_id VARCHAR(50),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'Open',
        priority VARCHAR(20) DEFAULT 'Medium',
        created_by VARCHAR(50) NOT NULL,
        assigned_to VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
        console.log('[Migration 010] ✓ gescall_support_tickets created');

        // Ticket comments table
        await client.query(`
      CREATE TABLE IF NOT EXISTS gescall_ticket_comments (
        id SERIAL PRIMARY KEY,
        ticket_id INT REFERENCES gescall_support_tickets(id) ON DELETE CASCADE,
        jira_comment_id VARCHAR(50),
        author VARCHAR(100) NOT NULL,
        body TEXT NOT NULL,
        source VARCHAR(10) DEFAULT 'gescall',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
        console.log('[Migration 010] ✓ gescall_ticket_comments created');

        // Indexes
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON gescall_support_tickets(created_by);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON gescall_support_tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_jira_key ON gescall_support_tickets(jira_key);
      CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON gescall_ticket_comments(ticket_id);
    `);
        console.log('[Migration 010] ✓ Indexes created');

        await client.query('COMMIT');
        console.log('[Migration 010] ✓ Migration completed successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 010] ✗ Migration failed:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

// Run if called directly
if (require.main === module) {
    migrate()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = migrate;
