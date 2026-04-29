const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixRemoteAgent() {
    const config = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    };

    const connection = await mysql.createConnection(config);

    try {
        console.log('Updating vicidial_remote_agents for APIAPI0009...');
        await connection.query("UPDATE vicidial_remote_agents SET on_hook_agent='Y' WHERE user_start='APIAPI0009'");
        console.log('Update Complete.');

        // Also try to set live agent to PAUSED to give it a head start
        console.log('Setting live agent to PAUSED...');
        await connection.query("UPDATE vicidial_live_agents SET status='PAUSED' WHERE user='APIAPI0009'");

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

fixRemoteAgent();
