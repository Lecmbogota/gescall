/**
 * Migration 011: Add Jira custom fields to support tickets
 * Adds columns for: cliente, url, pais, telefono, usuario
 */
const pg = require('../config/pgDatabase');

async function migrate() {
    const client = await pg.pool.connect();
    try {
        await client.query('BEGIN');

        // Add custom field columns (safe: IF NOT EXISTS via DO block)
        const columns = [
            { name: 'cliente', type: 'VARCHAR(255)' },
            { name: 'url', type: 'TEXT' },
            { name: 'pais', type: 'VARCHAR(100)' },
            { name: 'telefono', type: 'VARCHAR(50)' },
            { name: 'usuario', type: 'VARCHAR(255)' },
        ];

        for (const col of columns) {
            await client.query(`
                DO $$ BEGIN
                    ALTER TABLE gescall_support_tickets ADD COLUMN ${col.name} ${col.type};
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            `);
        }
        console.log('[Migration 011] ✓ Custom field columns added (cliente, url, pais, telefono, usuario)');

        await client.query('COMMIT');
        console.log('[Migration 011] ✓ Migration completed successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 011] ✗ Migration failed:', err.message);
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
