/**
 * Migration 024: Plantillas de reportes personalizados + permisos asociados
 * - gescall_report_templates: definiciones reutilizables de reportes ad-hoc
 * - Inserta los permisos: create_custom_reports, edit_custom_reports, delete_custom_reports
 * - Asigna esos permisos al rol con role_id = 1 (SUPER-ADMIN) si existe
 *
 * Notas de diseño:
 *   - "definition" guarda en JSONB la configuración del reporte:
 *       {
 *         "scope": "multi_campaign" | "single_campaign",
 *         "campaigns": ["DEMOCOL", ...],          // null o vacío = "todas las accesibles"
 *         "columns": ["call_date", "phone_number", ...],   // ids del catálogo
 *         "filters": { "status": ["ANSWER","SALE"], "direction": "OUTBOUND" },
 *         "sort": { "by": "call_date", "dir": "desc" }
 *       }
 *   - El rango de fechas NO se guarda en la plantilla — se elige al ejecutar.
 *   - El backend valida cada columna/filter contra una whitelist en routes/reports.js.
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
            CREATE TABLE IF NOT EXISTS gescall_report_templates (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                description TEXT,
                scope VARCHAR(30) NOT NULL DEFAULT 'multi_campaign',
                definition JSONB NOT NULL DEFAULT '{}'::jsonb,
                owner_user_id INTEGER REFERENCES gescall_users(user_id) ON DELETE SET NULL,
                owner_username VARCHAR(100),
                is_shared BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_report_templates_owner ON gescall_report_templates(owner_user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_report_templates_shared ON gescall_report_templates(is_shared)`);
        console.log('[Migration 024] ✓ Created gescall_report_templates');

        // Insertar nuevos permisos en SUPER-ADMIN (role_id = 1) si existe
        const newPermissions = [
            'create_custom_reports',
            'edit_custom_reports',
            'delete_custom_reports'
        ];

        // Detectar el rol "system" principal por id=1; si no existe, buscar el primero is_system=true
        const sysRoleRes = await client.query(
            `SELECT role_id FROM gescall_roles WHERE role_id = 1 OR is_system = true ORDER BY role_id ASC LIMIT 1`
        );

        if (sysRoleRes.rows.length > 0) {
            const sysRoleId = sysRoleRes.rows[0].role_id;
            for (const perm of newPermissions) {
                await client.query(
                    `INSERT INTO gescall_role_permissions (role_id, permission)
                     VALUES ($1, $2)
                     ON CONFLICT DO NOTHING`,
                    [sysRoleId, perm]
                );
            }
            console.log(`[Migration 024] ✓ Granted custom-report permissions to role_id=${sysRoleId}`);
        } else {
            console.warn('[Migration 024] ⚠ No system role found; permissions not granted automatically');
        }

        await client.query('COMMIT');
        console.log('[Migration 024] ✓ Migration completed');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 024] ✗ Migration failed:', err.message);
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
