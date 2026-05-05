/**
 * Migration 035: PIN/clave SIP por defecto para agentes sin valor
 * - agentes con sip_password vacío pasan a '1234' (mismo campo que PIN de pausas / teléfono web)
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

const DEFAULT_AGENT_SIP_PASSWORD = '1234';

async function migrate() {
    const client = await pg.pool.connect();
    try {
        await client.query('BEGIN');

        const { rowCount } = await client.query(
            `UPDATE gescall_users u
             SET sip_password = $1
             FROM gescall_roles r
             WHERE u.role_id = r.role_id
               AND TRIM(UPPER(r.role_name)) IN ('AGENT', 'AGENTE')
               AND (u.sip_password IS NULL OR TRIM(u.sip_password) = '')`,
            [DEFAULT_AGENT_SIP_PASSWORD]
        );

        await client.query('COMMIT');
        console.log(`[Migration 035] ✓ Completado; filas actualizadas: ${rowCount ?? '?'}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 035] ✗ Error:', err.message);
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
