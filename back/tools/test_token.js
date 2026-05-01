require('dotenv').config();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const secret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const token = jwt.sign({ username: 'admin', role: 'ADMIN', user_id: 1 }, secret, { expiresIn: '1h' });

fetch('http://localhost:3001/api/users/10/api-token', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(console.log).catch(console.error);
