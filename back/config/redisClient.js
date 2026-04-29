const redis = require('redis');

const client = redis.createClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

client.on('error', (err) => {
    console.error('[Redis] Error:', err);
});

client.on('connect', () => {
    console.log('[Redis] Connected successfully to high-speed cache');
});

async function connect() {
    try {
        await client.connect();
    } catch (err) {
        console.error('[Redis] Connection failed! Retrying in 5s...', err.message);
        setTimeout(connect, 5000);
    }
}

connect();

module.exports = client;
