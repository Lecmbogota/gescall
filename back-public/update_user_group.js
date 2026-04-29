const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateUserGroup() {
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
        console.log(`Updating ${user} to ADMIN group...`);

        await connection.query("UPDATE vicidial_users SET user_group='ADMIN' WHERE user = ?", [user]);
        console.log('Update Complete.');

        // Also update phone login/pass to match user just in case (like 1014)
        // Though usually API user doesn't need phone login if using remote agent, but let's see.
        // 1014 has phone_login=1014. APIAPI0009 has empty. 
        // Wait, APIAPI0009 is a REMOTE agent user?
        // Let's just update the group first.

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

updateUserGroup();
