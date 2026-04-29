/**
 * Upload Task Service - Persistence for lead upload tasks
 */
const databaseService = require('./databaseService');

class UploadTaskService {
    /**
     * Create a new upload task
     */
    async createTask(taskId, listId, campaignId, leads) {
        const query = `
      INSERT INTO gescall_upload_tasks 
      (id, task_type, list_id, campaign_id, status, total_records, leads_data)
      VALUES (?, 'lead_upload', ?, ?, 'pending', ?, ?)
    `;

        // Store leads as JSON (compressed for large datasets)
        const leadsJson = JSON.stringify(leads);

        await databaseService.executeQuery(query, [
            taskId,
            listId,
            campaignId,
            leads.length,
            leadsJson
        ]);

        return { id: taskId, status: 'pending', total: leads.length };
    }

    /**
     * Get task by ID
     */
    async getTask(taskId) {
        const query = `SELECT * FROM gescall_upload_tasks WHERE id = ?`;
        const results = await databaseService.executeQuery(query, [taskId]);
        return results[0] || null;
    }

    /**
     * Update task status
     */
    async updateTaskStatus(taskId, status, processed = null, successful = null, errors = null) {
        let query = `UPDATE gescall_upload_tasks SET status = ?`;
        const params = [status];

        if (processed !== null) {
            query += `, processed_records = ?`;
            params.push(processed);
        }
        if (successful !== null) {
            query += `, successful_records = ?`;
            params.push(successful);
        }
        if (errors !== null) {
            query += `, error_records = ?`;
            params.push(errors);
        }
        if (status === 'completed' || status === 'cancelled' || status === 'failed') {
            query += `, completed_at = NOW()`;
        }

        query += ` WHERE id = ?`;
        params.push(taskId);

        await databaseService.executeQuery(query, params);
    }

    /**
     * Update task progress
     */
    async updateProgress(taskId, processed, successful, errors) {
        const query = `
      UPDATE gescall_upload_tasks 
      SET processed_records = ?, 
          successful_records = ?, 
          error_records = ?,
          status = 'running'
      WHERE id = ?
    `;
        await databaseService.executeQuery(query, [processed, successful, errors, taskId]);
    }

    /**
     * Get running/pending tasks for recovery
     */
    async getRecoverableTasks() {
        const query = `
      SELECT * FROM gescall_upload_tasks 
      WHERE status IN ('pending', 'running', 'paused')
      AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY created_at DESC
    `;
        return await databaseService.executeQuery(query);
    }

    /**
     * Get remaining leads for a task (for resume)
     */
    async getRemainingLeads(taskId) {
        const task = await this.getTask(taskId);
        if (!task || !task.leads_data) return [];

        try {
            const allLeads = JSON.parse(task.leads_data);
            // Return leads starting from processed_records index
            return allLeads.slice(task.processed_records || 0);
        } catch (e) {
            console.error('[UploadTaskService] Error parsing leads data:', e);
            return [];
        }
    }

    /**
     * Mark task as failed
     */
    async markFailed(taskId, errorMessage) {
        const query = `
      UPDATE gescall_upload_tasks 
      SET status = 'failed', 
          error_log = ?,
          completed_at = NOW()
      WHERE id = ?
    `;
        await databaseService.executeQuery(query, [errorMessage, taskId]);
    }

    /**
     * Clean up old completed tasks (older than 7 days)
     */
    async cleanupOldTasks() {
        const query = `
      DELETE FROM gescall_upload_tasks 
      WHERE completed_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
    `;
        const result = await databaseService.executeQuery(query);
        return result.affectedRows || 0;
    }

    /**
     * Check if task exists and is active
     */
    async isTaskActive(taskId) {
        const task = await this.getTask(taskId);
        return task && ['pending', 'running', 'paused'].includes(task.status);
    }
}

module.exports = new UploadTaskService();
