const mysql = require('mysql2/promise');

async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'gescall_admin',
        password: process.env.DB_PASSWORD || 'TEcnologia2020',
        database: process.env.DB_NAME || 'asterisk'
    });

    try {
        console.log("Fetching list_id for PRUEBAS campaign...");
        const [lists] = await connection.query("SELECT list_id FROM vicidial_lists WHERE campaign_id = 'PRUEBAS' LIMIT 1;");

        if (lists.length === 0) {
            console.error("No list found for PRUEBAS campaign.");
            process.exit(1);
        }
        const list_id = lists[0].list_id;

        console.log(`Flushing old leads from list ${list_id}...`);
        await connection.query(`DELETE FROM vicidial_list WHERE list_id = ?`, [list_id]);

        console.log(`Clearing hopper for PRUEBAS...`);
        await connection.query(`DELETE FROM vicidial_hopper WHERE campaign_id = 'PRUEBAS'`);

        console.log("Generating 5000 random Colombian numbers...");
        const leads = [];
        // Colombian cellphones format: 3XX-XXX-XXXX. 
        // We use 320 to 322 prefixes for randomization.
        for (let i = 0; i < 5000; i++) {
            const prefix = Math.floor(Math.random() * (322 - 300 + 1) + 300); // 300 to 322
            const suffix = Math.floor(Math.random() * 9000000 + 1000000); // 7 digits
            const phone = `${prefix}${suffix}`;
            leads.push([
                list_id,
                'NEW',
                phone,
                '57',
                'PRUEBAS',
                'PRUEBA BENCHMARK'
            ]);
        }

        console.log("Inserting into vicidial_list in bulk...");
        await connection.query(
            `INSERT INTO vicidial_list (list_id, status, phone_number, phone_code, vendor_lead_code, comments) VALUES ?`,
            [leads]
        );

        console.log("Force loading the hopper...");
        await connection.query(`
            INSERT INTO vicidial_hopper (lead_id, campaign_id, status, list_id, priority)
            SELECT lead_id, 'PRUEBAS', 'READY', list_id, 0 
            FROM vicidial_list 
            WHERE list_id = ? AND status = 'NEW' 
            LIMIT 5000;
        `, [list_id]);

        console.log("✅ Benchmark leads ready! The dialer should start picking them up immediately.");
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await connection.end();
    }
}

run();
