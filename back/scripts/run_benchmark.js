const mysql = require('mysql2/promise');

async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'gescall_admin',
        password: process.env.DB_PASSWORD || 'TEcnologia2020',
        database: process.env.DB_NAME || 'asterisk'
    });

    console.log("Starting 5-minute benchmark feed...");

    const endTime = Date.now() + 5 * 60 * 1000; // 5 mins from now

    try {
        const [lists] = await connection.query("SELECT list_id FROM vicidial_lists WHERE campaign_id = 'PRUEBAS' LIMIT 1;");
        const list_id = lists[0].list_id;

        while (Date.now() < endTime) {
            // Check how many are currently in the hopper for PRUEBAS
            const [hopperRows] = await connection.query("SELECT COUNT(*) as count FROM vicidial_hopper WHERE campaign_id = 'PRUEBAS'");
            const currentHopper = hopperRows[0].count;

            // If hopper drops below 150, refill it
            if (currentHopper < 150) {
                const fillAmount = 300 - currentHopper;
                console.log(`Hopper at ${currentHopper}, refilling ${fillAmount} leads...`);

                await connection.query(`
                    INSERT INTO vicidial_hopper (lead_id, campaign_id, status, list_id, priority)
                    SELECT lead_id, 'PRUEBAS', 'READY', list_id, 0 
                    FROM vicidial_list 
                    WHERE list_id = ? AND status = 'NEW' 
                    LIMIT ?;
                `, [list_id, fillAmount]);

                // Immediately "consume" the status in vicidial_list so we don't grab the same NEW leads repeatedly
                await connection.query(`
                    UPDATE vicidial_list 
                    SET status = 'QUEUE' 
                    WHERE list_id = ? AND status = 'NEW' 
                    ORDER BY lead_id ASC LIMIT ?;
                `, [list_id, fillAmount]);
            }

            // Wait 500ms before checking again
            await new Promise(res => setTimeout(res, 500));
        }

        console.log("✅ Benchmark 5-minute feed completed!");
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await connection.end();
    }
}

run();
