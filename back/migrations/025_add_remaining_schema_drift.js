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
    console.log('[Migration] 025_add_remaining_schema_drift starting...');
    try {
        await pgDatabase.query(`
            ALTER TABLE gescall_leads 
            ADD COLUMN IF NOT EXISTS tts_vars jsonb DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS phone_index smallint DEFAULT 0;

            ALTER TABLE gescall_lists 
            ADD COLUMN IF NOT EXISTS tts_template_id character varying(100);

            ALTER TABLE gescall_schedules 
            ADD COLUMN IF NOT EXISTS executed boolean DEFAULT false;

            ALTER TABLE gescall_trunks 
            ADD COLUMN IF NOT EXISTS max_cps integer DEFAULT 50;
        `);
        console.log('[Migration] 025_add_remaining_schema_drift completed.');
    } catch (error) {
        console.error('[Migration] 025_add_remaining_schema_drift failed:', error);
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
