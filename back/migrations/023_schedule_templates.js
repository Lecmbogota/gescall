/**
 * Migration 023: Plantillas de horarios reutilizables.
 *
 * - Crea `gescall_schedule_templates` con el mismo formato de ventanas que
 *   `dial_schedule` JSONB de la migración 022:
 *     { enabled, timezone, windows: [{ days: number[], start: "HH:MM", end: "HH:MM" }] }
 *   donde days: 0=domingo … 6=sábado (igual que Date.getDay() / Go Weekday).
 *
 * - Agrega `gescall_campaigns.schedule_template_id` (FK opcional a la nueva tabla,
 *   ON DELETE SET NULL).
 *
 * - Crea un trigger SOLO en la tabla nueva (cuyo owner es gescall_admin) que
 *   propaga cambios del template a todas las campañas vinculadas, copiando la
 *   configuración al `dial_schedule` JSONB. Así **el dialer Go sigue leyendo
 *   exclusivamente `dial_schedule` sin cambios**.
 *
 * - La sincronización inicial (cuando se asigna un template a una campaña) se
 *   hace en el endpoint Node `PUT /api/campaigns/:id/schedule-template` para
 *   evitar requerir ownership de `gescall_campaigns`.
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

        // 1. Tabla de plantillas
        await client.query(`
            CREATE TABLE IF NOT EXISTS gescall_schedule_templates (
                id              SERIAL PRIMARY KEY,
                name            TEXT NOT NULL UNIQUE,
                description     TEXT,
                timezone        TEXT NOT NULL DEFAULT 'America/Mexico_City',
                windows         JSONB NOT NULL DEFAULT '[]'::jsonb,
                enabled         BOOLEAN NOT NULL DEFAULT TRUE,
                created_by      TEXT,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        console.log('[Migration 023] ✓ Tabla gescall_schedule_templates lista');

        // 2. FK en gescall_campaigns
        await client.query(`
            ALTER TABLE gescall_campaigns
            ADD COLUMN IF NOT EXISTS schedule_template_id INTEGER
                REFERENCES gescall_schedule_templates(id) ON DELETE SET NULL
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_gescall_campaigns_schedule_template_id
                ON gescall_campaigns (schedule_template_id)
        `);
        console.log('[Migration 023] ✓ Columna schedule_template_id en gescall_campaigns');

        // 3. Función que arma el JSONB final desde un template
        await client.query(`
            CREATE OR REPLACE FUNCTION gescall_build_dial_schedule_json(
                p_enabled BOOLEAN,
                p_timezone TEXT,
                p_windows JSONB
            ) RETURNS JSONB AS $$
            BEGIN
                RETURN jsonb_build_object(
                    'enabled', COALESCE(p_enabled, FALSE),
                    'timezone', COALESCE(NULLIF(TRIM(p_timezone), ''), 'America/Mexico_City'),
                    'windows', COALESCE(p_windows, '[]'::jsonb)
                );
            END;
            $$ LANGUAGE plpgsql IMMUTABLE;
        `);

        // 4. Trigger en templates: cuando cambia el template, propaga a todas
        //    las campañas que lo usan. (La sincronización inicial al asignar
        //    un template a una campaña se hace en el endpoint Node.)
        await client.query(`
            CREATE OR REPLACE FUNCTION gescall_propagate_schedule_template_changes()
            RETURNS TRIGGER AS $$
            BEGIN
                UPDATE gescall_campaigns
                   SET dial_schedule = gescall_build_dial_schedule_json(
                            NEW.enabled, NEW.timezone, NEW.windows
                       )
                 WHERE schedule_template_id = NEW.id;

                NEW.updated_at := NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await client.query(`DROP TRIGGER IF EXISTS trg_gescall_schedule_template_propagate ON gescall_schedule_templates`);
        await client.query(`
            CREATE TRIGGER trg_gescall_schedule_template_propagate
            BEFORE UPDATE
            ON gescall_schedule_templates
            FOR EACH ROW
            EXECUTE FUNCTION gescall_propagate_schedule_template_changes()
        `);
        console.log('[Migration 023] ✓ Trigger en gescall_schedule_templates');

        await client.query('COMMIT');
        console.log('[Migration 023] ✓ Migration completed successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 023] ✗ Migration failed:', err.message);
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
