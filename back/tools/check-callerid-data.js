require('dotenv').config();
const db = require('./services/databaseService');

async function check() {
    console.log('--- Checking CallerID Pools ---');
    const pools = await db.executeQuery(`SELECT p.id, p.name, p.is_active FROM gescall_callerid_pools p`);

    for (const pool of pools) {
        console.log(`Pool [${pool.id}] ${pool.name} (Active: ${pool.is_active})`);
        const numbers = await db.executeQuery(`SELECT callerid, area_code, is_active FROM gescall_callerid_pool_numbers WHERE pool_id = ? LIMIT 5`, [pool.id]);
        numbers.forEach(n => {
            console.log(`  - CID: ${n.callerid} (Area: ${n.area_code}, Active: ${n.is_active})`);
        });
    }

    console.log('\n--- Checking Campaign Settings for PRUEBAS ---');
    const settings = await db.executeQuery(`SELECT * FROM gescall_campaign_callerid_settings WHERE campaign_id = 'PRUEBAS'`);
    if (settings.length > 0) {
        console.log('Settings found:', settings[0]);
    } else {
        console.log('No specific settings for PRUEBAS (Will use default logic)');
    }

    process.exit(0);
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
