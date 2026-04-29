const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SOURCE_CAMPAIGN_ID = 'PRUEBAS';

async function copyIvrToAll() {
    let connection;
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'gescall_admin',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'asterisk',
            port: process.env.DB_PORT || 3306
        });

        console.log(`Fetching IVR flow from source campaign: ${SOURCE_CAMPAIGN_ID}`);
        const [sourceRows] = await connection.execute(
            'SELECT flow_json, is_active FROM gescall_ivr_flows WHERE campaign_id = ?',
            [SOURCE_CAMPAIGN_ID]
        );

        if (sourceRows.length === 0) {
            console.error(`No IVR flow found for campaign ${SOURCE_CAMPAIGN_ID}`);
            process.exit(1);
        }

        const sourceFlow = sourceRows[0];
        console.log('Source IVR flow found. Active:', sourceFlow.is_active);

        // Get all other campaigns
        const [campaigns] = await connection.execute(
            'SELECT campaign_id, campaign_name FROM vicidial_campaigns WHERE campaign_id != ? AND active = "Y"',
            [SOURCE_CAMPAIGN_ID]
        );

        console.log(`Found ${campaigns.length} other active campaigns.`);

        for (const camp of campaigns) {
            console.log(`Copying IVR to ${camp.campaign_id} (${camp.campaign_name})...`);

            await connection.execute(
                `INSERT INTO gescall_ivr_flows (campaign_id, flow_json, is_active)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE 
                 flow_json = VALUES(flow_json),
                 is_active = VALUES(is_active),
                 updated_at = NOW()`,
                [camp.campaign_id, sourceFlow.flow_json, sourceFlow.is_active]
            );
        }

        console.log('IVR copy completed successfully!');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (connection) await connection.end();
    }
}

copyIvrToAll();
