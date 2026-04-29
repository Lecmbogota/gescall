const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.PG_USER || 'gescall_admin',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'gescall_db',
    password: process.env.PG_PASSWORD || 'TEcnologia2020',
    port: process.env.PG_PORT || 5432,
    max: 500 // Increased from 20 for extreme scale concurrency when hanging up 1000 channels
});

pool.on('error', (err, client) => {
    console.error('[Postgres] Unexpected error on idle client', err);
    // Do NOT crash — let the pool self-heal
});

async function connect() {
    try {
        const client = await pool.connect();
        console.log('[Postgres] Connected successfully to gescall_db');
        client.release();
    } catch (err) {
        console.error('[Postgres] Failed to connect! Retrying in 5s...', err.message);
        setTimeout(connect, 5000);
    }
}

connect();

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool: pool
};
