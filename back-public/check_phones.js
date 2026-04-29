const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkPhones() {
    const config = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    };

    const connection = await mysql.createConnection(config);

    try {
        console.log('Checking phones for 1014/APIAPI0009...');
        const [rows] = await connection.query("SELECT extension, dialplan_number, voicemail_id, phone_ip, computer_ip, server_ip, login, pass, status, active, protocol, on_hook_agent FROM phones WHERE extension IN ('1014', 'APIAPI0009', 'API0009') OR login IN ('1014', 'APIAPI0009')");
        console.table(rows);

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

checkPhones();
