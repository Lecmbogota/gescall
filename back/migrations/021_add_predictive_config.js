/**
 * Migration 021: Add predictive dialer configuration columns to gescall_campaigns.
 *
 * These columns control the adaptive predictive pacing algorithm:
 * - predictive_target_drop_rate: Maximum acceptable PDROP rate (0.0–1.0, default 0.03 = 3%)
 * - predictive_min_factor: Minimum multiplier floor for calls per ready agent
 * - predictive_max_factor: Maximum multiplier cap for calls per ready agent
 * - predictive_adapt_interval_ms: How often the algorithm recalculates (ms)
 * - predictive_sliding_window_sec: Time window for rate calculation (seconds)
 *
 * Run from back/:
 *   node migrations/021_add_predictive_config.js
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Manually load .env (same pattern as other migrations)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf-8');
    const env = dotenv.parse(envFile);
    for (const [k, v] of Object.entries(env)) {
        if (!process.env[k]) process.env[k] = v;
    }
}

const { Pool } = require('pg');

async function run() {
    const pool = new Pool({
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432'),
        user: process.env.PG_USER || 'gescall_admin',
        password: process.env.PG_PASSWORD || 'TEcnologia2020',
        database: process.env.PG_DATABASE || 'gescall_db',
    });

    const client = await pool.connect();
    try {
        console.log('Migration 021: Adding predictive dialer config columns to gescall_campaigns...');

        const columns = [
            {
                name: 'predictive_target_drop_rate',
                type: 'NUMERIC(3,2)',
                default: '0.03',
            },
            {
                name: 'predictive_min_factor',
                type: 'NUMERIC(5,2)',
                default: '1.0',
            },
            {
                name: 'predictive_max_factor',
                type: 'NUMERIC(5,2)',
                default: '4.0',
            },
            {
                name: 'predictive_adapt_interval_ms',
                type: 'INTEGER',
                default: '10000',
            },
            {
                name: 'predictive_sliding_window_sec',
                type: 'INTEGER',
                default: '300',
            },
        ];

        for (const col of columns) {
            try {
                await client.query(
                    `ALTER TABLE gescall_campaigns ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} DEFAULT ${col.default}`
                );
                console.log(`  ✓ Added column ${col.name}`);
            } catch (err) {
                if (err.code === '42701') {
                    console.log(`  → Column ${col.name} already exists, skipping`);
                } else {
                    console.error(`  ✗ Failed to add ${col.name}:`, err.message);
                }
            }
        }

        // Set defaults on existing rows where column is NULL
        console.log('  Setting defaults on existing campaign rows...');
        await client.query(`
            UPDATE gescall_campaigns 
            SET predictive_target_drop_rate = COALESCE(predictive_target_drop_rate, 0.03),
                predictive_min_factor = COALESCE(predictive_min_factor, 1.0),
                predictive_max_factor = COALESCE(predictive_max_factor, 4.0),
                predictive_adapt_interval_ms = COALESCE(predictive_adapt_interval_ms, 10000),
                predictive_sliding_window_sec = COALESCE(predictive_sliding_window_sec, 300)
        `);

        console.log('Migration 021 completed successfully.');
    } catch (err) {
        console.error('Migration 021 failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
