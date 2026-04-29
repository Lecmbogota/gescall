const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixCampaign() {
    const config = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    };

    const connection = await mysql.createConnection(config);

    try {
        const campaignId = 'API0009';
        console.log(`Fixing permissions for Campaign: ${campaignId}`);

        // Update ALL potential manual dial flags
        await connection.query(
            "UPDATE vicidial_campaigns SET api_manual_dial='STANDARD', manual_dial_override='ALLOW_ALL', manual_preview_dial='Y' WHERE campaign_id = ?",
            [campaignId]
        );
        console.log('Updated vicidial_campaigns OK');

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

fixCampaign();
