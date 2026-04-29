const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkLiveAgents() {
    const config = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    };

    try {
        const connection = await mysql.createConnection(config);
        const [rows] = await connection.execute('SELECT user, status, campaign_id, server_ip FROM vicidial_live_agents');

        console.log('--- Connected Agents ---');
        if (rows.length === 0) {
            console.log('NO AGENTS LOGGED IN');
        } else {
            console.table(rows);
        }
        await connection.end();
    } catch (err) {
        console.error('DB Error:', err.message);
    }
}

checkLiveAgents();
