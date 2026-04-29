/**
 * Upload Task Service - Persistence for lead upload tasks
 */
const pg = require('../config/pgDatabase');

class UploadTaskService {
    /**
     * Create a new upload task
     */
    async createTask(taskId, listId, campaignId, leads) {
        const query = process.env.USE_GESCALL_DIALER === 'true' ? `
            INSERT INTO gescall_upload_tasks 
            (id, task_type, list_id, campaign_id, status, total_records, leads_data)
            VALUES ($1, 'lead_upload', $2, $3, 'pending', $4, $5)
        ` : `
            INSERT INTO gescall_upload_tasks 
            (id, task_type, list_id, campaign_id, status, total_records, leads_data)
            VALUES (?, 'lead_upload', ?, ?, 'pending', ?, ?)
        `;

        // Store leads as JSON (compressed for large datasets)
        const leadsJson = JSON.stringify(leads);

        await pg.query(query, [
            taskId,
            listId,
            campaignId,
            leads.length,
            leadsJson
        ]);

        return { id: taskId, status: 'pending', total: leads.length };
    }

    /**
     * Create a file-based upload task (stores file path, NOT leads data)
     */
    async createFileTask(taskId, listId, campaignId, totalRecords, filePath) {
        const query = process.env.USE_GESCALL_DIALER === 'true' ? `
            INSERT INTO gescall_upload_tasks 
            (id, task_type, list_id, campaign_id, status, total_records, leads_data)
            VALUES ($1, 'lead_upload', $2, $3, 'pending', $4, $5)
        ` : `
            INSERT INTO gescall_upload_tasks 
            (id, task_type, list_id, campaign_id, status, total_records, leads_data)
            VALUES (?, 'lead_upload', ?, ?, 'pending', ?, ?)
        `;

        // Store only a reference, not the full data
        const metaJson = JSON.stringify({ file_path: filePath, type: 'file_upload' });

        await pg.query(query, [
            taskId,
            listId,
            campaignId,
            totalRecords,
            metaJson
        ]);

        return { id: taskId, status: 'pending', total: totalRecords };
    }

    /**
     * Get task by ID
     */
    async getTask(taskId) {
        const query = process.env.USE_GESCALL_DIALER === 'true'
            ? `SELECT * FROM gescall_upload_tasks WHERE id = $1`
            : `SELECT * FROM gescall_upload_tasks WHERE id = ?`;
        const { rows } = await pg.query(query, [taskId]);
        return rows[0] || null;
    }

    /**
     * Update task status
     */
    async updateTaskStatus(taskId, status, processed = null, successful = null, errors = null) {
        let query = `UPDATE gescall_upload_tasks SET status = `;
        const params = [status];
        let paramIndex = 1;

        const getPlaceholder = () => process.env.USE_GESCALL_DIALER === 'true' ? `$${paramIndex++}` : '?';

        query += getPlaceholder();

        if (processed !== null) {
            query += `, processed_records = ${getPlaceholder()}`;
            params.push(processed);
        }
        if (successful !== null) {
            query += `, successful_records = ${getPlaceholder()}`;
            params.push(successful);
        }
        if (errors !== null) {
            query += `, error_records = ${getPlaceholder()}`;
            params.push(errors);
        }
        if (status === 'completed' || status === 'cancelled' || status === 'failed') {
            query += `, completed_at = NOW()`;
        }

        query += ` WHERE id = ${getPlaceholder()}`;
        params.push(taskId);

        await pg.query(query, params);
    }

    /**
     * Update task progress
     */
    async updateProgress(taskId, processed, successful, errors) {
        const isPg = process.env.USE_GESCALL_DIALER === 'true';
        const query = isPg ? `
            UPDATE gescall_upload_tasks 
            SET processed_records = $1, 
                successful_records = $2, 
                error_records = $3,
                status = 'running'
            WHERE id = $4
        ` : `
            UPDATE gescall_upload_tasks 
            SET processed_records = ?, 
                successful_records = ?, 
                error_records = ?,
                status = 'running'
            WHERE id = ?
        `;
        await pg.query(query, [processed, successful, errors, taskId]);
    }

    /**
     * Get running/pending tasks for recovery
     */
    async getRecoverableTasks() {
        const isPg = process.env.USE_GESCALL_DIALER === 'true';
        const query = isPg ? `
            SELECT * FROM gescall_upload_tasks 
            WHERE status IN ('pending', 'running', 'paused')
            AND created_at > NOW() - INTERVAL '24 hours'
            ORDER BY created_at DESC
        ` : `
            SELECT * FROM gescall_upload_tasks 
            WHERE status IN ('pending', 'running', 'paused')
            AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY created_at DESC
        `;
        const { rows } = await pg.query(query);
        return rows;
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
        const isPg = process.env.USE_GESCALL_DIALER === 'true';
        const query = isPg ? `
            UPDATE gescall_upload_tasks 
            SET status = 'failed', 
                error_log = $1,
                completed_at = NOW()
            WHERE id = $2
        ` : `
            UPDATE gescall_upload_tasks 
            SET status = 'failed', 
                error_log = ?,
                completed_at = NOW()
            WHERE id = ?
        `;
        await pg.query(query, [errorMessage, taskId]);
    }

    /**
     * Clean up old completed tasks (older than 7 days)
     */
    async cleanupOldTasks() {
        const isPg = process.env.USE_GESCALL_DIALER === 'true';
        const query = isPg ? `
            DELETE FROM gescall_upload_tasks 
            WHERE completed_at < NOW() - INTERVAL '7 days'
        ` : `
            DELETE FROM gescall_upload_tasks 
            WHERE completed_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
        `;
        const result = await pg.query(query);
        return isPg ? result.rowCount : (result.affectedRows || 0);
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
