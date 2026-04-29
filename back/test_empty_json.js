require('dotenv').config();
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
const token = jwt.sign({ username: 'admin', role: 'ADMIN', user_id: 1 }, secret, { expiresIn: '1h' });

fetch('http://localhost:3001/api/users/10/api-token', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
}).then(async r => {
    console.log("Status:", r.status);
    console.log("Response:", await r.text());
}).catch(console.error);
