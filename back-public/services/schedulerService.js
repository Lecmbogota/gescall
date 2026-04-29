/**
 * Scheduler Service
 * Runs every minute to check for pending scheduled tasks and execute them
 */

const cron = require('node-cron');
const databaseService = require('./databaseService');
const vicidialApi = require('./vicidialApi');

class SchedulerService {
    constructor() {
        this.isRunning = false;
        this.cronJob = null;
    }

    start() {
        if (this.cronJob) {
            console.log('[Scheduler] Already running');
            return;
        }

        console.log('[Scheduler] Starting scheduler service...');

        // Run every minute
        this.cronJob = cron.schedule('* * * * *', async () => {
            await this.checkAndExecutePendingTasks();
        });

        console.log('[Scheduler] ✓ Scheduler service started (runs every minute)');
    }

    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            console.log('[Scheduler] Scheduler service stopped');
        }
    }

    async checkAndExecutePendingTasks() {
        if (this.isRunning) {
            return; // Skip if already running
        }

        this.isRunning = true;

        try {
            // Always check for end_at tasks first (deactivations)
            await this.checkEndTasks();

            // Get pending tasks that are due
            const pendingTasks = await databaseService.executeQuery(`
                SELECT * FROM gescall_schedules 
                WHERE executed = FALSE 
                  AND scheduled_at <= NOW()
                ORDER BY scheduled_at ASC
            `);

            if (pendingTasks.length > 0) {
                console.log(`[Scheduler] Found ${pendingTasks.length} pending task(s)`);

                for (const task of pendingTasks) {
                    await this.executeTask(task);
                }
            }

        } catch (error) {
            console.error('[Scheduler] Error:', error.message);
        }

        this.isRunning = false;
    }

    async executeTask(task) {
        console.log(`[Scheduler] Executing task #${task.id}: ${task.action} ${task.schedule_type} ${task.target_id}`);

        try {
            if (task.schedule_type === 'campaign') {
                await this.executeCampaignTask(task);
            } else if (task.schedule_type === 'list') {
                await this.executeListTask(task);
            }

            // Mark as executed
            await databaseService.executeQuery(`
                UPDATE gescall_schedules 
                SET executed = TRUE, executed_at = NOW() 
                WHERE id = ?
            `, [task.id]);

            console.log(`[Scheduler] ✓ Task #${task.id} executed successfully`);

            // Handle recurring tasks
            if (task.recurring && task.recurring !== 'none') {
                await this.createNextRecurrence(task);
            }

        } catch (error) {
            console.error(`[Scheduler] ✗ Task #${task.id} failed:`, error.message);
            // Don't mark as executed so it can be retried
        }
    }

    async executeCampaignTask(task) {
        const newStatus = task.action === 'activate' ? 'Y' : 'N';

        // Update via Vicidial API
        try {
            await vicidialApi.updateCampaignStatus(task.target_id, newStatus);
        } catch (apiError) {
            console.log('[Scheduler] API call failed, falling back to direct DB update');
        }

        // Also update directly in DB to ensure consistency
        await databaseService.executeQuery(`
            UPDATE vicidial_campaigns SET active = ? WHERE campaign_id = ?
        `, [newStatus, task.target_id]);
    }

    async executeListTask(task) {
        const newStatus = task.action === 'activate' ? 'Y' : 'N';

        // Update via Vicidial API
        try {
            await vicidialApi.updateListStatus(task.target_id, newStatus);
        } catch (apiError) {
            console.log('[Scheduler] API call failed, falling back to direct DB update');
        }

        // Also update directly in DB
        await databaseService.executeQuery(`
            UPDATE vicidial_lists SET active = ? WHERE list_id = ?
        `, [newStatus, task.target_id]);
    }

    async checkEndTasks() {
        // Find tasks where end_at has passed - need to deactivate
        // We look for executed 'activate' tasks where end_at <= NOW()
        // To avoid re-processing, we check if the target is still active
        const endTasks = await databaseService.executeQuery(`
            SELECT * FROM gescall_schedules 
            WHERE executed = TRUE 
              AND action = 'activate'
              AND end_at IS NOT NULL 
              AND end_at <= NOW()
        `);

        for (const task of endTasks) {
            try {
                // Check if target is still active before deactivating
                let isStillActive = false;

                if (task.schedule_type === 'campaign') {
                    const [campaign] = await databaseService.executeQuery(
                        'SELECT active FROM vicidial_campaigns WHERE campaign_id = ?',
                        [task.target_id]
                    );
                    isStillActive = campaign && campaign.active === 'Y';
                } else if (task.schedule_type === 'list') {
                    const [list] = await databaseService.executeQuery(
                        'SELECT active FROM vicidial_lists WHERE list_id = ?',
                        [task.target_id]
                    );
                    isStillActive = list && list.active === 'Y';
                }

                if (isStillActive) {
                    console.log(`[Scheduler] End time reached for task #${task.id} (${task.target_name}), deactivating...`);

                    const deactivateTask = {
                        ...task,
                        action: 'deactivate'
                    };

                    if (task.schedule_type === 'campaign') {
                        await this.executeCampaignTask(deactivateTask);
                    } else if (task.schedule_type === 'list') {
                        await this.executeListTask(deactivateTask);
                    }

                    console.log(`[Scheduler] ✓ Task #${task.id} deactivated successfully`);
                }
                // If not active, no need to deactivate - end_at is preserved for display

            } catch (error) {
                console.error(`[Scheduler] ✗ Failed to deactivate task #${task.id}:`, error.message);
            }
        }
    }

    async createNextRecurrence(task) {
        let nextDate;
        const currentDate = new Date(task.scheduled_at);

        switch (task.recurring) {
            case 'daily':
                nextDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
                break;
            case 'weekly':
                nextDate = new Date(currentDate.setDate(currentDate.getDate() + 7));
                break;
            case 'monthly':
                nextDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
                break;
            default:
                return;
        }

        const nextEndDate = task.end_at ? new Date(new Date(task.end_at).getTime() + (nextDate.getTime() - new Date(task.scheduled_at).getTime())) : null;

        await databaseService.executeQuery(`
            INSERT INTO gescall_schedules 
            (schedule_type, target_id, target_name, action, scheduled_at, end_at, recurring, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            task.schedule_type,
            task.target_id,
            task.target_name,
            task.action,
            nextDate.toISOString().slice(0, 19).replace('T', ' '),
            nextEndDate ? nextEndDate.toISOString().slice(0, 19).replace('T', ' ') : null,
            task.recurring,
            task.created_by
        ]);

        console.log(`[Scheduler] Created next recurring task for ${nextDate.toISOString()}`);
    }
}

module.exports = new SchedulerService();
