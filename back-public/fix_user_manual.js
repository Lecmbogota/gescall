const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixUserManual() {
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
        console.log(`Fixing permissions for User: ${user}`);

        // Update with CORRECT column name: agentcall_manual
        await connection.query("UPDATE vicidial_users SET agentcall_manual='1' WHERE user = ?", [user]);
        console.log('Updated vicidial_users.agentcall_manual = 1');

        // Force re-login/refresh permissions by removing live session
        console.log('Clearing live agent session to force refresh...');
        await connection.query("DELETE FROM vicidial_live_agents WHERE user = ?", [user]);
        console.log('Live session cleared. Agent should reconnect automatically via Remote Agent script.');

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

fixUserManual();
