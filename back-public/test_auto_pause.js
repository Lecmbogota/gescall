const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function testAutoPause() {
    const config = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    };

    const connection = await mysql.createConnection(config);

    try {
        // 1. Force Agent to READY
        console.log('1. Forcing agent APIAPI0009 to READY...');
        await connection.query("UPDATE vicidial_live_agents SET status = 'READY' WHERE user = 'APIAPI0009'");

        // 2. Make the API Call
        console.log('2. Making API Call...');
        const response = await axios.post('http://localhost:3002/api/public/v1/calls', {
            phone_number: '3196233749',
            campaign_id: 'PRUEBAS'
        }, {
            headers: { 'x-api-key': 'f67d7c11768641cdad06e14cd380d82970dbdd9fcd7818d81c4a84e8ba8ef257' }
        });

        console.log('3. Result:', response.data);

    } catch (error) {
        console.error('3. Error:', error.response ? error.response.data : error.message);
    } finally {
        await connection.end();
    }
}

testAutoPause();
