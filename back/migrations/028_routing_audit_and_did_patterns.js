/**
 * Migration 028: Auditoría + patrones DID en gescall_route_rules
 *  - Añade columnas created_by, updated_by (varchar)
 *  - Añade columna match_did_kind (EXACT|PREFIX|REGEX) default 'EXACT'
 *  - Crea tabla gescall_route_rules_audit y trigger AFTER INSERT/UPDATE/DELETE
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
            ALTER TABLE gescall_route_rules
            ADD COLUMN IF NOT EXISTS created_by VARCHAR(100),
            ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100),
            ADD COLUMN IF NOT EXISTS match_did_kind VARCHAR(16) NOT NULL DEFAULT 'EXACT'
        `);

        await client.query(`ALTER TABLE gescall_route_rules DROP CONSTRAINT IF EXISTS chk_route_did_kind`);
        await client.query(`
            ALTER TABLE gescall_route_rules
            ADD CONSTRAINT chk_route_did_kind
            CHECK (match_did_kind IN ('EXACT','PREFIX','REGEX'))
        `);
        console.log('[Migration 028] ✓ columnas created_by/updated_by/match_did_kind añadidas');

        await client.query(`
            CREATE TABLE IF NOT EXISTS gescall_route_rules_audit (
                audit_id SERIAL PRIMARY KEY,
                rule_id INTEGER,
                action VARCHAR(8) NOT NULL,
                changed_by VARCHAR(100),
                changed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
                old_data JSONB,
                new_data JSONB
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_route_audit_rule ON gescall_route_rules_audit(rule_id, changed_at DESC)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_route_audit_changed_at ON gescall_route_rules_audit(changed_at DESC)`);
        console.log('[Migration 028] ✓ gescall_route_rules_audit creada');

        await client.query(`
            CREATE OR REPLACE FUNCTION gescall_route_rules_audit_fn()
            RETURNS TRIGGER AS $$
            DECLARE
                actor TEXT := NULLIF(current_setting('gescall.current_user', true), '');
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    INSERT INTO gescall_route_rules_audit (rule_id, action, changed_by, new_data)
                    VALUES (NEW.id, 'INSERT', COALESCE(actor, NEW.created_by), to_jsonb(NEW));
                    RETURN NEW;
                ELSIF TG_OP = 'UPDATE' THEN
                    INSERT INTO gescall_route_rules_audit (rule_id, action, changed_by, old_data, new_data)
                    VALUES (NEW.id, 'UPDATE', COALESCE(actor, NEW.updated_by), to_jsonb(OLD), to_jsonb(NEW));
                    RETURN NEW;
                ELSIF TG_OP = 'DELETE' THEN
                    INSERT INTO gescall_route_rules_audit (rule_id, action, changed_by, old_data)
                    VALUES (OLD.id, 'DELETE', actor, to_jsonb(OLD));
                    RETURN OLD;
                END IF;
                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await client.query(`DROP TRIGGER IF EXISTS gescall_route_rules_audit_tg ON gescall_route_rules`);
        await client.query(`
            CREATE TRIGGER gescall_route_rules_audit_tg
            AFTER INSERT OR UPDATE OR DELETE ON gescall_route_rules
            FOR EACH ROW EXECUTE FUNCTION gescall_route_rules_audit_fn()
        `);
        console.log('[Migration 028] ✓ trigger AFTER INSERT/UPDATE/DELETE creado');

        await client.query('COMMIT');
        console.log('[Migration 028] ✓ Migration completed');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Migration 028] ✗ Migration failed:', err.message);
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
