const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function syncTransferNumbers() {
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

        console.log('Fetching campaigns with xferconf_c_number (Transfer-Conf Number 3)...');
        const [campaigns] = await connection.execute(
            'SELECT campaign_id, campaign_name, xferconf_c_number FROM vicidial_campaigns WHERE active = "Y"'
        );

        console.log(`Found ${campaigns.length} active campaigns.`);

        for (const camp of campaigns) {
            const transferNumber = camp.xferconf_c_number;

            if (!transferNumber) {
                console.log(`[SKIP] Campaign ${camp.campaign_id} has no Transfer-Conf Number 3 set.`);
                continue;
            }

            // Get IVR flow
            const [rows] = await connection.execute(
                'SELECT flow_json FROM gescall_ivr_flows WHERE campaign_id = ?',
                [camp.campaign_id]
            );

            if (rows.length === 0) {
                // console.log(`[SKIP] Campaign ${camp.campaign_id} has no IVR flow.`);
                continue;
            }

            let flow;
            try {
                flow = JSON.parse(rows[0].flow_json);
            } catch (e) {
                console.error(`[ERROR] Failed to parse JSON for campaign ${camp.campaign_id}`);
                continue;
            }

            let updated = false;

            // Update transfer nodes
            if (flow.nodes && Array.isArray(flow.nodes)) {
                for (const node of flow.nodes) {
                    if (node.type === 'transfer' || node.data?.nodeType === 'transfer') {
                        if (node.data.number !== transferNumber) {
                            console.log(`[UPDATE] Campaign ${camp.campaign_id}: Updating transfer node ${node.id} from '${node.data.number}' to '${transferNumber}'`);
                            node.data.number = transferNumber;
                            updated = true;
                        }
                    }
                }
            }

            if (updated) {
                await connection.execute(
                    'UPDATE gescall_ivr_flows SET flow_json = ?, updated_at = NOW() WHERE campaign_id = ?',
                    [JSON.stringify(flow), camp.campaign_id]
                );
                console.log(`[SAVED] Campaign ${camp.campaign_id} updated successfully.`);
            } else {
                // console.log(`[NO CHANGE] Campaign ${camp.campaign_id} is already up to date.`);
            }
        }

        console.log('Sync completed successfully!');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (connection) await connection.end();
    }
}

syncTransferNumbers();
