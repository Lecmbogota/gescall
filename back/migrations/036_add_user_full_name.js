/**
 * Migration 036: agrega full_name a usuarios
 * - Permite mostrar nombre completo en UI sin cambiar username técnico.
 */
const fs = require('fs');
const dotenv = require('dotenv');
if (fs.existsSync(`${__dirname}/../.env`)) {
    const envConfig = dotenv.parse(fs.readFileSync(`${__dirname}/../.env`));
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
            ALTER TABLE gescall_users
            ADD COLUMN IF NOT EXISTS full_name VARCHAR(120)
        `);

        await client.query(`
            UPDATE gescall_users
            SET full_name = username
            WHERE full_name IS NULL OR TRIM(full_name) = ''
        `);

        await client.query('COMMIT');
        console.log('[Migration 036] ✓ Columna full_name creada y datos inicializados');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 036] ✗ Error:', err.message);
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
