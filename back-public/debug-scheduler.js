require('dotenv').config();
const db = require('./services/databaseService');

async function debugScheduler() {
    console.log('=== SCHEDULER DEBUG ===\n');
    console.log('Current Time:', new Date().toISOString());

    // Get all schedules
    console.log('\n--- All Schedules ---');
    const all = await db.executeQuery('SELECT * FROM gescall_schedules ORDER BY id DESC LIMIT 10');
    console.table(all);

    // Get pending (not executed)
    console.log('\n--- Pending Schedules ---');
    const pending = await db.executeQuery(`
        SELECT * FROM gescall_schedules 
        WHERE executed = FALSE 
        ORDER BY scheduled_at ASC
    `);
    console.table(pending);

    // Get schedules that should have executed by now
    console.log('\n--- Should Have Executed (scheduled_at <= NOW, not executed) ---');
    const overdue = await db.executeQuery(`
        SELECT * FROM gescall_schedules 
        WHERE executed = FALSE 
          AND scheduled_at <= NOW()
    `);
    console.table(overdue);

    // Check campaign status
    console.log('\n--- PRUEBAS Campaign Status ---');
    const campaign = await db.executeQuery(`
        SELECT campaign_id, campaign_name, active 
        FROM vicidial_campaigns 
        WHERE campaign_id = 'PRUEBAS'
    `);
    console.table(campaign);

    process.exit(0);
}

debugScheduler().catch(console.error);
