const mysql = require('mysql2/promise');
require('dotenv').config();

async function assignPhone() {
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
        const phoneParams = { login: 'gs102', pass: 'test' }; // Using existing phone gs102

        console.log(`Assigning phone ${phoneParams.login} to user ${user}...`);

        await connection.query("UPDATE vicidial_users SET phone_login=?, phone_pass=? WHERE user = ?", [phoneParams.login, phoneParams.pass, user]);

        // Check if gs102 exists in phones
        const [p] = await connection.query("SELECT * FROM phones WHERE extension = ?", [phoneParams.login]);
        if (p.length === 0) {
            console.log('WARNING: Phone gs102 does not exist! Creating dummy...');
            // Create it if missing (unlikely based on prev check, but good for safety)
            await connection.query("INSERT INTO phones (extension, dialplan_number, voicemail_id, phone_ip, computer_ip, server_ip, login, pass, status, active, protocol, on_hook_agent) VALUES (?, '102', '102', '', '', '209.38.233.46', ?, ?, 'ACTIVE', 'Y', 'SIP', 'Y')", [phoneParams.login, phoneParams.login, phoneParams.pass]);
        } else {
            console.log('Phone exists:', p[0].extension);
        }

        // Clear live session
        await connection.query("DELETE FROM vicidial_live_agents WHERE user = ?", [user]);

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

assignPhone();
