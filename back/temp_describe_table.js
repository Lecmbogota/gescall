require('dotenv').config();
const db = require('./services/databaseService');

async function describe() {
    try {
        console.log('--- Describe vicidial_dial_log ---');
        const rows = await db.executeQuery('DESCRIBE vicidial_dial_log');
        rows.forEach(row => {
            console.log(`${row.Field} (${row.Type})`);
        });
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}

describe();
