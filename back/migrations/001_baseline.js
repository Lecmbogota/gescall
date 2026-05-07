const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

if (fs.existsSync('.env')) {
    const envConfig = dotenv.parse(fs.readFileSync('.env'));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
} else if (fs.existsSync(path.join(__dirname, '../.env'))) {
    const envConfig = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env')));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const pgDatabase = require('../config/pgDatabase');

async function migrate() {
    console.log('[Migration] 001_baseline starting...');
    try {
        // Check if database is already initialized
        const checkRes = await pgDatabase.query("SELECT to_regclass('public.gescall_users') as exists");
        if (checkRes.rows[0].exists) {
            console.log('[Migration] 001_baseline: Database already initialized. Skipping baseline schema injection to protect existing data.');
            return;
        }

        console.log('[Migration] 001_baseline: Empty database detected. Injecting full golden schema...');
        
        const schemaPath = path.join(__dirname, '../../database_schemas/gescall_db_schema.sql');
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found at ${schemaPath}`);
        }
        
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await pgDatabase.query(schemaSql);
        
        console.log('[Migration] 001_baseline completed successfully.');
    } catch (error) {
        console.error('[Migration] 001_baseline failed:', error);
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
