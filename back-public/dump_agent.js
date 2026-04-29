const mysql = require('mysql2/promise');
require('dotenv').config();

async function dumpAgent() {
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
        console.log(`Dumping info for ${user}...`);

        const [u] = await connection.query('SELECT * FROM vicidial_users WHERE user = ?', [user]);
        console.log('\n--- vicidial_users ---');
        console.table(u);

        const [ra] = await connection.query('SELECT * FROM vicidial_remote_agents WHERE user_start = ?', [user]);
        console.log('\n--- vicidial_remote_agents ---');
        console.table(ra);

        const [la] = await connection.query('SELECT * FROM vicidial_live_agents WHERE user = ?', [user]);
        console.log('\n--- vicidial_live_agents ---');
        console.table(la);

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

dumpAgent();
