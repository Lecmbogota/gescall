const http = require('http');
require('dotenv').config();
const { generateToken } = require('./middleware/jwtAuth');

const token = generateToken({ username: 'admin', role: 'ADMIN', user_id: 1 });
console.log("Generated token:", token);

const apiReq = http.request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/campaigns',
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${token}`
    }
}, (apiRes) => {
    let apiData = '';
    apiRes.on('data', chunk => apiData += chunk);
    apiRes.on('end', () => {
        console.log('API Status:', apiRes.statusCode);
        console.log('API Response:', apiData.substring(0, 200));
    });
});
apiReq.end();
