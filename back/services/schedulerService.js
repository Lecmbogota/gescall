/**
 * Scheduler Service
 * Runs every minute to check for pending scheduled tasks and execute them
 */

const cron = require('node-cron');
const vicidialApi = require('./vicidialApi');
const USE_NATIVE_DB = process.env.USE_GESCALL_DIALER === 'true';

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

    async getDb() {
        if (USE_NATIVE_DB) {
            return {
                query: async (sql, params) => {
                    const pg = require('../config/pgDatabase');
                    const { rows } = await pg.query(sql.replace(/\?/g, (_, offset, str) => {
                        // Very basic ? to $n conversion for these specific queries
                        // Since we control the queries here, we can just write them with $n or convert manually.
                        // Actually, it's safer to just write the queries properly. Let's return pg directly.
                    }));
                }
            }
        }
    }

    async checkAndExecutePendingTasks() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            if (USE_NATIVE_DB) {
                const pg = require('../config/pgDatabase');
                // Get pending tasks
                const pendingSchedulesQuery = `
                    SELECT * FROM gescall_schedules 
                    WHERE executed = false AND scheduled_at <= NOW()
                `;
                const { rows: pendingTasks } = await pg.query(pendingSchedulesQuery);

                if (pendingTasks && pendingTasks.length > 0) {
                    console.log(`[Scheduler] Found ${pendingTasks.length} pending tasks to execute`);

                    for (const task of pendingTasks) {
                        try {
                            const newActiveState = task.action === 'activate' ? 'Y' : 'N';
                            let updateQuery = '';
                            let queryParams = [newActiveState, task.target_id];

                            if (task.schedule_type === 'campaign') {
                                updateQuery = 'UPDATE gescall_campaigns SET active = $1 WHERE campaign_id = $2';
                            } else if (task.schedule_type === 'list') {
                                updateQuery = 'UPDATE gescall_lists SET active = $1 WHERE list_id = $2';
                            }

                            if (updateQuery) {
                                // Execute toggle
                                await pg.query(updateQuery, queryParams);
                                
                                // Mark schedule as executed
                                await pg.query('UPDATE gescall_schedules SET executed = true WHERE id = $1', [task.id]);

                                console.log(`[Scheduler] Executed task ${task.id}: set ${task.schedule_type} ${task.target_id} to ${task.action}`);
                            }
                        } catch (taskError) {
                            console.error(`[Scheduler] Failed to execute task ${task.id}:`, taskError);
                        }
                    }
                }
            }
        } catch (e) { 
            console.error('[Scheduler] Error checking pending tasks:', e);
        } finally {
            this.isRunning = false;
        }
    }
}

module.exports = new SchedulerService();
