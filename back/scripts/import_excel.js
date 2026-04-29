require('dotenv').config();
const xlsx = require('xlsx');
const pg = require('../config/pgDatabase');

async function importLeads() {
    console.log("Reading Excel file...");
    const workbook = xlsx.readFile('/root/GlobalConnect (1).xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    console.log(`Found ${rows.length} rows`);

    let numbers = new Set();
    rows.forEach(row => {
        row.forEach(cell => {
            const str = String(cell).trim();
            // Match any 10-digit number
            if (/^\d{10}$/.test(str)) {
                numbers.add(str);
            }
        });
    });

    console.log(`Extracted ${numbers.size} unique valid 10-digit numbers`);

    // Ensure Campaign PRUEBAS exists
    await pg.query(`
        INSERT INTO gescall_campaigns (campaign_id, campaign_name, active) 
        VALUES ('PRUEBAS', 'Campaña Benchmark', true) 
        ON CONFLICT (campaign_id) DO NOTHING
    `);

    // Ensure List 999 exists for PRUEBAS
    const list_id = 999;
    await pg.query(`
        INSERT INTO gescall_lists (list_id, list_name, campaign_id, active) 
        VALUES ($1, 'Lista Benchmark', 'PRUEBAS', true) 
        ON CONFLICT (list_id) DO NOTHING
    `, [list_id]);

    console.log("Clearing old leads for PRUEBAS list 999...");
    await pg.query("DELETE FROM gescall_leads WHERE list_id = $1", [list_id]);

    const numArr = Array.from(numbers);
    const batchSize = 1000;
    for (let i = 0; i < numArr.length; i += batchSize) {
        const batch = numArr.slice(i, i + batchSize);

        let valueStrings = [];
        let params = [];
        let pIndex = 1;

        batch.forEach(num => {
            valueStrings.push(`($${pIndex++}, 'NEW', $${pIndex++}, 'PRUEBAS_EXCEL')`);
            params.push(list_id, num);
        });

        await pg.query(`
            INSERT INTO gescall_leads (list_id, status, phone_number, vendor_lead_code) 
            VALUES ${valueStrings.join(',')}
        `, params);
        console.log(`Inserted ${i + batch.length} / ${numArr.length} leads into PostgreSQL...`);
    }

    console.log("PostgreSQL Import Done. To push to Hopper, run loadToRedisHopper.js");
    process.exit(0);
}

importLeads().catch(err => {
    console.error(err);
    process.exit(1);
});
