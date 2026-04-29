const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkManager() {
    const config = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    };

    const connection = await mysql.createConnection(config);

    try {
        // Check Remote Agent Config again
        console.log('\nChecking Remote Agent Config...');
        const [ra] = await connection.query("SELECT user_start, conf_exten, status, number_of_lines, server_ip, on_hook_agent FROM vicidial_remote_agents WHERE user_start='APIAPI0009'");
        console.table(ra);

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

checkManager();
