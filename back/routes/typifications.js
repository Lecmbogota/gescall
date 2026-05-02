const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');

// ========================
// TIPIFICACIONES (por campaña)
// ========================

router.get('/campaigns/:campaignId/typifications', async (req, res) => {
    try {
        const { rows } = await pg.query(
            `SELECT t.*, f.name as form_name 
             FROM gescall_typifications t 
             LEFT JOIN gescall_typification_forms f ON t.form_id = f.id 
             WHERE t.campaign_id = $1 AND t.active = true 
             ORDER BY t.sort_order ASC, t.name ASC`,
            [req.params.campaignId]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/campaigns/:campaignId/typifications', async (req, res) => {
    try {
        const { name, category, form_id, sort_order } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'name is required' });
        const { rows } = await pg.query(
            `INSERT INTO gescall_typifications (campaign_id, name, category, form_id, sort_order) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.params.campaignId, name, category || 'Contactado', form_id || null, sort_order || 0]
        );
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/campaigns/:campaignId/typifications/:typificationId', async (req, res) => {
    try {
        const { name, category, form_id, sort_order, active } = req.body;
        const fields = [];
        const params = [];
        let idx = 1;
        if (name !== undefined) { fields.push(`name=$${idx++}`); params.push(name); }
        if (category !== undefined) { fields.push(`category=$${idx++}`); params.push(category); }
        if (form_id !== undefined) { fields.push(`form_id=$${idx++}`); params.push(form_id); }
        if (sort_order !== undefined) { fields.push(`sort_order=$${idx++}`); params.push(sort_order); }
        if (active !== undefined) { fields.push(`active=$${idx++}`); params.push(active); }
        fields.push(`updated_at=NOW()`);
        params.push(req.params.typificationId, req.params.campaignId);
        const { rows } = await pg.query(
            `UPDATE gescall_typifications SET ${fields.join(', ')} WHERE id=$${idx++} AND campaign_id=$${idx} RETURNING *`,
            params
        );
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Typification not found' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/campaigns/:campaignId/typifications/:typificationId', async (req, res) => {
    try {
        const { rows } = await pg.query(
            'DELETE FROM gescall_typifications WHERE id=$1 AND campaign_id=$2 RETURNING *',
            [req.params.typificationId, req.params.campaignId]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Typification not found' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================
// FORMULARIOS (por campaña)
// ========================

router.get('/campaigns/:campaignId/forms', async (req, res) => {
    try {
        const { rows } = await pg.query(
            `SELECT f.*, 
                    (SELECT COUNT(*) FROM gescall_typification_form_fields WHERE form_id = f.id) as field_count,
                    (SELECT COUNT(*) FROM gescall_typifications WHERE form_id = f.id) as usage_count
             FROM gescall_typification_forms f 
             WHERE f.campaign_id = $1 
             ORDER BY f.name ASC`,
            [req.params.campaignId]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/campaigns/:campaignId/forms', async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'name is required' });
        const { rows } = await pg.query(
            `INSERT INTO gescall_typification_forms (campaign_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
            [req.params.campaignId, name, description || '']
        );
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/campaigns/:campaignId/forms/:formId', async (req, res) => {
    try {
        const { name, description } = req.body;
        const fields = [];
        const params = [];
        let idx = 1;
        if (name !== undefined) { fields.push(`name=$${idx++}`); params.push(name); }
        if (description !== undefined) { fields.push(`description=$${idx++}`); params.push(description); }
        fields.push(`updated_at=NOW()`);
        params.push(req.params.formId, req.params.campaignId);
        const { rows } = await pg.query(
            `UPDATE gescall_typification_forms SET ${fields.join(', ')} WHERE id=$${idx++} AND campaign_id=$${idx} RETURNING *`,
            params
        );
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Form not found' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/campaigns/:campaignId/forms/:formId', async (req, res) => {
    try {
        const { rows } = await pg.query(
            'DELETE FROM gescall_typification_forms WHERE id=$1 AND campaign_id=$2 RETURNING *',
            [req.params.formId, req.params.campaignId]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Form not found' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================
// CAMPOS DE FORMULARIO
// ========================

router.get('/campaigns/:campaignId/forms/:formId/fields', async (req, res) => {
    try {
        const { rows } = await pg.query(
            'SELECT * FROM gescall_typification_form_fields WHERE form_id = $1 ORDER BY sort_order ASC, id ASC',
            [req.params.formId]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/campaigns/:campaignId/forms/:formId/fields', async (req, res) => {
    try {
        const { field_name, field_label, field_type, is_required, options, sort_order } = req.body;
        if (!field_name || !field_label) return res.status(400).json({ success: false, error: 'field_name and field_label are required' });
        const { rows } = await pg.query(
            `INSERT INTO gescall_typification_form_fields (form_id, field_name, field_label, field_type, is_required, options, sort_order) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.params.formId, field_name, field_label, field_type || 'text', is_required || false, options || null, sort_order || 0]
        );
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/campaigns/:campaignId/forms/:formId/fields/:fieldId', async (req, res) => {
    try {
        const { field_name, field_label, field_type, is_required, options, sort_order } = req.body;
        const fields = [];
        const params = [];
        let idx = 1;
        if (field_name !== undefined) { fields.push(`field_name=$${idx++}`); params.push(field_name); }
        if (field_label !== undefined) { fields.push(`field_label=$${idx++}`); params.push(field_label); }
        if (field_type !== undefined) { fields.push(`field_type=$${idx++}`); params.push(field_type); }
        if (is_required !== undefined) { fields.push(`is_required=$${idx++}`); params.push(is_required); }
        if (options !== undefined) { fields.push(`options=$${idx++}`); params.push(JSON.stringify(options)); }
        if (sort_order !== undefined) { fields.push(`sort_order=$${idx++}`); params.push(sort_order); }
        params.push(req.params.fieldId, req.params.formId);
        const { rows } = await pg.query(
            `UPDATE gescall_typification_form_fields SET ${fields.join(', ')} WHERE id=$${idx++} AND form_id=$${idx} RETURNING *`,
            params
        );
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Field not found' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/campaigns/:campaignId/forms/:formId/fields/:fieldId', async (req, res) => {
    try {
        const { rows } = await pg.query(
            'DELETE FROM gescall_typification_form_fields WHERE id=$1 AND form_id=$2 RETURNING *',
            [req.params.fieldId, req.params.formId]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Field not found' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================
// ENVÍO DE RESULTADOS
// ========================

router.post('/submit', async (req, res) => {
    try {
        const { call_log_id, phone_number, typification_id, campaign_id, form_data, notes } = req.body;
        if (!typification_id) return res.status(400).json({ success: false, error: 'typification_id is required' });
        if (!campaign_id) return res.status(400).json({ success: false, error: 'campaign_id is required' });

        const agentUsername = req.headers['x-user-name'] || 'system';
        
        let finalLogId = call_log_id;
        
        if (!finalLogId) {
            let queryParams = [campaign_id, agentUsername];
            let sql = `SELECT log_id FROM gescall_call_log 
                       WHERE campaign_id = $1 AND transferred_to = $2 AND typification_id IS NULL `;
            if (phone_number && phone_number !== 'null' && phone_number !== '') {
                sql += ` AND phone_number = $3 `;
                queryParams.push(phone_number);
            }
            sql += ` ORDER BY call_date DESC LIMIT 1`;
            
            let { rows: latestLog } = await pg.query(sql, queryParams);
            
            if (latestLog.length === 0 && phone_number && phone_number !== 'null' && phone_number !== '') {
                const res2 = await pg.query(
                    `SELECT log_id FROM gescall_call_log 
                     WHERE campaign_id = $1 AND phone_number = $2 AND typification_id IS NULL
                     ORDER BY call_date DESC LIMIT 1`,
                    [campaign_id, phone_number]
                );
                latestLog = res2.rows;
            }
            
            if (latestLog.length === 0) {
                const res3 = await pg.query(
                    `SELECT log_id FROM gescall_call_log 
                     WHERE campaign_id = $1 AND typification_id IS NULL
                     ORDER BY call_date DESC LIMIT 1`,
                    [campaign_id]
                );
                latestLog = res3.rows;
            }

            if (latestLog.length > 0) {
                finalLogId = latestLog[0].log_id;
            }
        }

        const { rows } = await pg.query(
            `INSERT INTO gescall_typification_results (call_log_id, typification_id, agent_username, campaign_id, form_data, notes) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [finalLogId || null, typification_id, agentUsername, campaign_id, form_data ? JSON.stringify(form_data) : null, notes || null]
        );

        if (finalLogId) {
            await pg.query(
                'UPDATE gescall_call_log SET typification_id = $1 WHERE log_id = $2',
                [typification_id, finalLogId]
            );
        }

        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/call-logs/:logId/typification', async (req, res) => {
    try {
        const { rows } = await pg.query(
            `SELECT tr.*, t.name as typification_name, t.category as typification_category
             FROM gescall_typification_results tr
             JOIN gescall_typifications t ON tr.typification_id = t.id
             WHERE tr.call_log_id = $1
             ORDER BY tr.created_at DESC LIMIT 1`,
            [req.params.logId]
        );
        res.json({ success: true, data: rows[0] || null });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
