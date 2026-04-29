const axios = require('axios');
const https = require('https');
require('dotenv').config({ path: '/opt/gescall/back-public/.env' });

// Ignore SSL
const agent = new https.Agent({
    rejectUnauthorized: false
});

async function testRaCall() {
    const baseUrl = process.env.VICIDIAL_API_URL;
    const user = process.env.VICIDIAL_API_USER;
    const pass = process.env.VICIDIAL_API_PASS;

    // Agent to use
    const agent_user = 'APIAPI0009';
    const phone_number = '3196233749'; // Customer

    console.log(`Testing ra_call for ${agent_user} -> ${phone_number}`);

    const params = new URLSearchParams({
        source: 'test_script',
        user: user,
        pass: pass,
        function: 'ra_call',
        agent_user: agent_user, // ra_call uses 'agent_user' or 'user'? 
        // Docs say: user (API user), agent_user (Remote Agent ID)
        details: 'YES',
        phone_number: phone_number,
        phone_code: '57',
        campaign_id: 'PRUEBAS'
    });

    // Fix URL (api.php)
    let url = baseUrl;
    if (url.includes('non_agent_api.php')) {
        url = url.replace('vicidial/non_agent_api.php', 'agc/api.php');
        url = url.replace('non_agent_api.php', 'api.php');
    }

    const fullUrl = `${url}?${params.toString()}`;
    console.log(`Request: ${fullUrl}`);

    try {
        const res = await axios.get(fullUrl, { httpsAgent: agent });
        console.log('Response:', res.data);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testRaCall();
