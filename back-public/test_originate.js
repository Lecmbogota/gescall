const axios = require('axios');
const https = require('https');
require('dotenv').config({ path: '/opt/gescall/back-public/.env' });

const agent = new https.Agent({ rejectUnauthorized: false });

async function testOriginate() {
    // Use non_agent_api.php
    const baseUrl = process.env.VICIDIAL_API_URL.replace('agc/api.php', 'vicidial/non_agent_api.php');

    const user = process.env.VICIDIAL_API_USER;
    const pass = process.env.VICIDIAL_API_PASS;
    const phone_number = '3196233749';

    console.log(`Testing originate_call to ${baseUrl}`);

    const params = new URLSearchParams({
        source: 'test_script',
        user: user,
        pass: pass,
        function: 'originate_call',
        channel: 'Local/8300@default',
        exten: `57${phone_number}`,
        context: 'default',
        priority: '1',
        caller_id: `57${phone_number}`
    });

    const fullUrl = `${baseUrl}?${params.toString()}`;
    console.log(`Request: ${fullUrl}`);

    try {
        const res = await axios.get(fullUrl, { httpsAgent: agent });
        console.log('Response:', res.data);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testOriginate();
