const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkPermissions() {
    const config = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    };

    const connection = await mysql.createConnection(config);

    try {
        const user = 'APIAPI0009';
        const campaignId = 'API0009';

        console.log(`Checking permissions for User: ${user} and Campaign: ${campaignId}`);

        // Check Campaign (Most critical)
        const [c] = await connection.query('SELECT campaign_id, manual_dial, auto_dial_level FROM vicidial_campaigns WHERE campaign_id = ?', [campaignId]);
        console.log('\n--- Campaign ---');
        console.table(c);

        // Check User Group
        const [u] = await connection.query('SELECT user, user_group FROM vicidial_users WHERE user = ?', [user]);
        if (u.length > 0) {
            console.log('\n--- User ---');
            console.table(u);

            const [ug] = await connection.query('SELECT user_group, allowed_campaigns FROM vicidial_user_groups WHERE user_group = ?', [u[0].user_group]);
            console.log('\n--- User Group ---');
            console.table(ug);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

checkPermissions();
