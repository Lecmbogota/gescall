const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixPermissions() {
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

        console.log(`Fixing permissions for User: ${user} and Campaign: ${campaignId}`);

        // 1. vicidial_users: Enable agent_call_manual
        // Note: older versions might not have this column on users, but usually do.
        // If not, it relies on User Group.
        try {
            await connection.query("UPDATE vicidial_users SET agent_call_manual='1' WHERE user = ?", [user]);
            console.log('Updated vicidial_users.agent_call_manual = 1');
        } catch (e) { console.log('Skipping vicidial_users.agent_call_manual (column might be missing)'); }

        // 2. vicidial_user_groups: Enable agent_call_manual
        // First get the group
        const [u] = await connection.query('SELECT user_group FROM vicidial_users WHERE user = ?', [user]);
        if (u.length > 0) {
            const group = u[0].user_group;
            console.log(`User Group: ${group}`);
            await connection.query("UPDATE vicidial_user_groups SET agent_call_manual='1' WHERE user_group = ?", [group]);
            console.log('Updated vicidial_user_groups.agent_call_manual = 1');
        }

        // 3. vicidial_campaigns: Enable manual dialing
        // api_manual_dial usually 'STANDARD' or '1'
        await connection.query("UPDATE vicidial_campaigns SET api_manual_dial='STANDARD', manual_dial_override='ALLOW_ALL' WHERE campaign_id = ?", [campaignId]);
        console.log('Updated vicidial_campaigns parameters');

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

fixPermissions();
