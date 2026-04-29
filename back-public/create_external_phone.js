const mysql = require('mysql2/promise');
require('dotenv').config();

async function createExternalPhone() {
    const config = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    };

    const connection = await mysql.createConnection(config);

    try {
        const extension = 'gs8009';
        const user = 'APIAPI0009';

        console.log(`Creating EXTERNAL phone ${extension} for ${user}...`);

        // Check if exists
        const [p] = await connection.query("SELECT * FROM phones WHERE extension = ?", [extension]);
        if (p.length > 0) {
            console.log('Phone exists, updating...');
            await connection.query("UPDATE phones SET protocol='EXTERNAL', dialplan_number='8300', status='ACTIVE', active='Y', on_hook_agent='Y' WHERE extension = ?", [extension]);
        } else {
            console.log('Creating new phone...');
            // Insert
            await connection.query(
                "INSERT INTO phones (extension, dialplan_number, voicemail_id, phone_ip, computer_ip, server_ip, login, pass, status, active, protocol, on_hook_agent) VALUES (?, '8300', '8300', '', '', '209.38.233.46', ?, 'test', 'ACTIVE', 'Y', 'EXTERNAL', 'Y')",
                [extension, extension]
            );
        }

        // Assign to User
        console.log('Assigning to user APIAPI0009...');
        await connection.query("UPDATE vicidial_users SET phone_login=?, phone_pass='test' WHERE user = ?", [extension, user]);

        // Clear session
        await connection.query("DELETE FROM vicidial_live_agents WHERE user = ?", [user]);

        console.log('Done.');

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

createExternalPhone();
