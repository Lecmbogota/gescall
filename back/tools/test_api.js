const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: '/opt/gescall/back/.env' });

const token = jwt.sign({ id: 1, user: 'admin', user_group: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '1h' });

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/dnc/3182808563?campaign_id=MEXICO',
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => { console.log('STATUS:', res.statusCode); console.log('BODY:', data); });
});

req.on('error', error => { console.error('ERROR:', error); });
req.end();
