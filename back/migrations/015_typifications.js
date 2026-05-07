/**
 * Migration 015: Tipificaciones de llamadas por campaña
 * - gescall_typifications: tipificaciones configurables por campaña
 * - gescall_typification_forms: formularios asociados a campañas
 * - gescall_typification_form_fields: campos personalizados del formulario
 * - gescall_typification_results: resultados de tipificación guardados
 * - Agrega typification_id a gescall_call_log
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
            CREATE TABLE IF NOT EXISTS gescall_typifications (
                id SERIAL PRIMARY KEY,
                campaign_id VARCHAR(50) NOT NULL REFERENCES gescall_campaigns(campaign_id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(50) NOT NULL DEFAULT 'Contactado',
                form_id INTEGER,
                sort_order INTEGER DEFAULT 0,
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_typifications_campaign ON gescall_typifications(campaign_id)`);
        console.log('[Migration 015] ✓ Created gescall_typifications');

        await client.query(`
            CREATE TABLE IF NOT EXISTS gescall_typification_forms (
                id SERIAL PRIMARY KEY,
                campaign_id VARCHAR(50) NOT NULL REFERENCES gescall_campaigns(campaign_id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_typification_forms_campaign ON gescall_typification_forms(campaign_id)`);
        console.log('[Migration 015] ✓ Created gescall_typification_forms');

        await client.query(`
            CREATE TABLE IF NOT EXISTS gescall_typification_form_fields (
                id SERIAL PRIMARY KEY,
                form_id INTEGER NOT NULL REFERENCES gescall_typification_forms(id) ON DELETE CASCADE,
                field_name VARCHAR(100) NOT NULL,
                field_label VARCHAR(255) NOT NULL,
                field_type VARCHAR(50) NOT NULL DEFAULT 'text',
                is_required BOOLEAN DEFAULT false,
                options JSONB,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_form_fields_form ON gescall_typification_form_fields(form_id)`);
        console.log('[Migration 015] ✓ Created gescall_typification_form_fields');

        await client.query(`
            CREATE TABLE IF NOT EXISTS gescall_typification_results (
                id SERIAL PRIMARY KEY,
                call_log_id INTEGER REFERENCES gescall_call_log(log_id) ON DELETE SET NULL,
                typification_id INTEGER REFERENCES gescall_typifications(id) ON DELETE SET NULL,
                agent_username VARCHAR(100),
                campaign_id VARCHAR(50),
                form_data JSONB,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_typification_results_call_log ON gescall_typification_results(call_log_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_typification_results_campaign ON gescall_typification_results(campaign_id)`);
        console.log('[Migration 015] ✓ Created gescall_typification_results');

        // FK to typifications on form_id
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_typifications_form'
                ) THEN
                    ALTER TABLE gescall_typifications 
                    ADD CONSTRAINT fk_typifications_form 
                    FOREIGN KEY (form_id) REFERENCES gescall_typification_forms(id) ON DELETE SET NULL;
                END IF;
            END
            $$
        `);

        await client.query('COMMIT');
        console.log('[Migration 015] ✓ Core tables created');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 015] ✗ Migration failed:', err.message);
        throw err;
    } finally {
        client.release();
    }

    // ALTER TABLE outside transaction (may fail due to ownership)
    try {
        const alterClient = await pg.pool.connect();
        try {
            await alterClient.query(`
                ALTER TABLE gescall_call_log 
                ADD COLUMN IF NOT EXISTS typification_id INTEGER
            `);
            await alterClient.query(`CREATE INDEX IF NOT EXISTS idx_call_log_typification ON gescall_call_log(typification_id)`);
            console.log('[Migration 015] ✓ Added typification_id to gescall_call_log');
        } finally {
            alterClient.release();
        }
    } catch (alterErr) {
        console.warn('[Migration 015] ⚠ Could not alter gescall_call_log (no owner). Run ALTER manually if needed.');
    }

    console.log('[Migration 015] ✓ Migration completed');
}

if (require.main === module) {
    migrate()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = migrate;
