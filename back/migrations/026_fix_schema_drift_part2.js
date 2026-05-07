const fs = require('fs');
const dotenv = require('dotenv');

if (fs.existsSync('.env')) {
    const envConfig = dotenv.parse(fs.readFileSync('.env'));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const pgDatabase = require('../config/pgDatabase');

async function migrate() {
    console.log('[Migration] 026_fix_schema_drift_part2 starting...');
    try {
        await pgDatabase.query(`
            -- Drop legacy 'role' column from role permissions to satisfy NOT NULL constraints on old templates
            ALTER TABLE gescall_role_permissions DROP COLUMN IF EXISTS role CASCADE;
            
            -- Drop legacy 'role' column from users just in case
            ALTER TABLE gescall_users DROP COLUMN IF EXISTS role CASCADE;

            -- Add missing user columns
            ALTER TABLE gescall_users ADD COLUMN IF NOT EXISTS sip_extension character varying(50);
            ALTER TABLE gescall_users ADD COLUMN IF NOT EXISTS sip_password character varying(255);

            -- Add missing call log columns
            ALTER TABLE gescall_call_log ADD COLUMN IF NOT EXISTS hangup_cause character varying(100);
            ALTER TABLE gescall_call_log ADD COLUMN IF NOT EXISTS trunk_id character varying(50);
            ALTER TABLE gescall_call_log ADD COLUMN IF NOT EXISTS uniqueid character varying(255) DEFAULT NULL;
            
            -- Add missing user widgets table if not exists
            CREATE TABLE IF NOT EXISTS gescall_user_widgets (
                user_id integer NOT NULL REFERENCES gescall_users(user_id) ON DELETE CASCADE,
                widget_id character varying(50) NOT NULL,
                visible boolean DEFAULT true,
                position_order integer DEFAULT 0,
                config jsonb DEFAULT '{}'::jsonb,
                PRIMARY KEY (user_id, widget_id)
            );
        `);
        console.log('[Migration] 026_fix_schema_drift_part2 completed.');
    } catch (error) {
        console.error('[Migration] 026_fix_schema_drift_part2 failed:', error);
        throw error;
    } finally {
        // Exit process if run standalone
        if (require.main === module) {
            process.exit(0);
        }
    }
}

if (require.main === module) {
    migrate();
}

module.exports = migrate;
