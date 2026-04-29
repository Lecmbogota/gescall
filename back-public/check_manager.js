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
        console.log('Checking recent vicidial_manager entries...');
        // Look for recent actions
        const [rows] = await connection.query(
            "SELECT man_id, uniqueid, entry_date, status, response, action, callerid, cmd_line_b, cmd_line_c FROM vicidial_manager ORDER BY entry_date DESC LIMIT 5"
        );
        console.table(rows);

        console.log('\nChecking Agent Phone Config (vicidial_users)...');
        const [u] = await connection.query("SELECT user, phone_login, phone_pass FROM vicidial_users WHERE user='APIAPI0009'");
        console.table(u);

        console.log('\nChecking Remote Agent Config...');
        const [ra] = await connection.query("SELECT user_start, conf_exten, status, lines, server_ip, on_hook_agent FROM vicidial_remote_agents WHERE user_start='APIAPI0009'");
        console.table(ra);

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

checkManager();
