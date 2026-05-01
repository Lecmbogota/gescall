require('dotenv').config();
const db = require('./services/databaseService');

async function triggerEndTasks() {
    console.log('=== MANUALLY TRIGGERING END TASKS ===\n');

    // Find tasks where end_at has passed
    const endTasks = await db.executeQuery(`
        SELECT * FROM gescall_schedules 
        WHERE executed = TRUE 
          AND action = 'activate'
          AND end_at IS NOT NULL 
          AND end_at <= NOW()
    `);

    console.log('Found tasks to deactivate:', endTasks.length);
    console.table(endTasks);

    for (const task of endTasks) {
        console.log(`\nDeactivating: ${task.target_name} (${task.schedule_type} ${task.target_id})`);

        if (task.schedule_type === 'campaign') {
            await db.executeQuery(`
                UPDATE vicidial_campaigns SET active = 'N' WHERE campaign_id = ?
            `, [task.target_id]);
            console.log('✓ Campaign deactivated');
        } else if (task.schedule_type === 'list') {
            await db.executeQuery(`
                UPDATE vicidial_lists SET active = 'N' WHERE list_id = ?
            `, [task.target_id]);
            console.log('✓ List deactivated');
        }

        // Mark as processed
        await db.executeQuery(`
            UPDATE gescall_schedules SET end_at = NULL WHERE id = ?
        `, [task.id]);
        console.log('✓ Schedule marked as end-processed');
    }

    // Verify campaign status
    console.log('\n--- Final Campaign Status ---');
    const campaign = await db.executeQuery(`
        SELECT campaign_id, campaign_name, active 
        FROM vicidial_campaigns 
        WHERE campaign_id = 'PRUEBAS'
    `);
    console.table(campaign);

    process.exit(0);
}

triggerEndTasks().catch(console.error);
