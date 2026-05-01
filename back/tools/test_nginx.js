require('dotenv').config();
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
const token = jwt.sign({ username: 'admin', role: 'ADMIN', user_id: 1 }, secret, { expiresIn: '1h' });

fetch('https://urlpro.cc/api/users/10/api-token', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.text()).then(t => console.log("Response:", t)).catch(console.error);
