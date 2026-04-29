const mysql = require('mysql2/promise');
require('dotenv').config();

async function compareAgents() {
    const config = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    };

    const connection = await mysql.createConnection(config);

    try {
        console.log('Comparing APIAPI0009 vs 1014...');

        const [rows] = await connection.query('SELECT * FROM vicidial_users WHERE user IN (?, ?)', ['APIAPI0009', '1014']);

        // Transpose for easier comparison
        const keys = Object.keys(rows[0]);
        console.log('Field | 1014 | APIAPI0009');
        console.log('---|---|---');

        const u1 = rows.find(r => r.user === '1014') || {};
        const u2 = rows.find(r => r.user === 'APIAPI0009') || {};

        keys.forEach(k => {
            if (u1[k] != u2[k]) {
                console.log(`${k} | ${u1[k]} | ${u2[k]}`);
            }
        });

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

compareAgents();
