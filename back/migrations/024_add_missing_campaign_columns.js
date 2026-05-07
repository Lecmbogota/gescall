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
    console.log('[Migration] 024_add_missing_campaign_columns starting...');
    try {
        await pgDatabase.query(`
            ALTER TABLE gescall_campaigns 
            ADD COLUMN IF NOT EXISTS webhook_url text,
            ADD COLUMN IF NOT EXISTS max_retries integer DEFAULT 3,
            ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false,
            ADD COLUMN IF NOT EXISTS lead_structure_schema jsonb DEFAULT '[{"name": "telefono", "required": true}, {"name": "speech", "required": false}]'::jsonb,
            ADD COLUMN IF NOT EXISTS tts_templates jsonb DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS retry_settings jsonb DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS alt_phone_enabled boolean DEFAULT false,
            ADD COLUMN IF NOT EXISTS campaign_type character varying(30) DEFAULT 'BLASTER';
        `);
        console.log('[Migration] 024_add_missing_campaign_columns completed.');
    } catch (error) {
        console.error('[Migration] 024_add_missing_campaign_columns failed:', error);
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
