require('dotenv').config();
const pg = require('../config/pgDatabase');
const redis = require('../config/redisClient');

async function testConnections() {
    try {
        // Test Postgres
        console.log("Testing PostgreSQL connection...");
        const pgRes = await pg.query('SELECT NOW() as current_time');
        console.log("✅ PostgreSQL is alive. Time:", pgRes.rows[0].current_time);

        // Test Redis
        console.log("Testing Redis connection...");
        await redis.set('test_key', 'Hello Gescall High Concurrency!');
        const val = await redis.get('test_key');
        console.log("✅ Redis is alive. Value retrieved:", val);

        process.exit(0);
    } catch (err) {
        console.error("❌ Connection test failed:", err.message);
        process.exit(1);
    }
}

// Give files a second to connect before forcing a test query
setTimeout(testConnections, 1000);
