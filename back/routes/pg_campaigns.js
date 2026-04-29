const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const pg = require('../config/pgDatabase');
const databaseService = require('../services/databaseService');
const pgDatabaseService = require('../services/pgDatabaseService');

router.get('/', async (req, res) => {
    try {
        const { campaign_id, allowed_campaigns } = req.query;
        let query = 'SELECT * FROM gescall_campaigns';
        let params = [];

        if (campaign_id) {
            query += ' WHERE campaign_id = $1';
            params.push(campaign_id);
        } else if (allowed_campaigns) {
            const allowedIds = typeof allowed_campaigns === 'string' ? allowed_campaigns.split(',') : allowed_campaigns;
            if (allowedIds.length > 0) {
                query += ' WHERE campaign_id = ANY($1)';
                params.push(allowedIds);
            } else {
                return res.json({ success: true, data: [] });
            }
        }

        const { rows } = await pg.query(query, params);
        const mappedRows = rows.map(row => ({
            ...row,
            active: row.active ? 'Y' : 'N',
            archived: row.archived || false
        }));
        res.json({ success: true, data: mappedRows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/ids', async (req, res) => {
    try {
        const { allowed_campaigns } = req.query;
        let query = 'SELECT campaign_id FROM gescall_campaigns';
        let params = [];

        if (allowed_campaigns) {
            const allowedIds = typeof allowed_campaigns === 'string' ? allowed_campaigns.split(',') : allowed_campaigns;
            if (allowedIds.length > 0) {
                query += ' WHERE campaign_id = ANY($1)';
                params.push(allowedIds);
            } else {
                return res.json({ success: true, data: [] });
            }
        }

        query += ' ORDER BY campaign_id ASC';

        const { rows } = await pg.query(query, params);
        const mappedRows = rows.map(row => row.campaign_id);
        res.json({ success: true, data: mappedRows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/prefixes', async (req, res) => {
    try {
        const { rows } = await pg.query('SELECT id, prefix, country_name, country_code FROM gescall_campaigns_prefixes WHERE is_active = true ORDER BY country_name ASC');
        console.log(`[pg_campaigns] Fetched ${rows.length} prefixes`);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[pg_campaigns] Error fetching prefixes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/cps-availability', async (req, res) => {
    try {
        const trunkQuery = await pg.query('SELECT SUM(max_cps) as total_cps FROM gescall_trunks WHERE active = true');
        const campQuery = await pg.query("SELECT SUM(auto_dial_level) as used_cps FROM gescall_campaigns WHERE active = true AND dial_method = 'RATIO'");

        const total_cps = parseInt(trunkQuery.rows[0].total_cps) || 0;
        const used_cps = parseFloat(campQuery.rows[0].used_cps) || 0;
        const available_cps = Math.max(0, total_cps - used_cps);

        res.json({ success: true, data: { total_cps, used_cps, available_cps } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});



router.post('/:campaign_id/start', async (req, res) => {
    try {
        const campCheck = await pg.query('SELECT auto_dial_level, active FROM gescall_campaigns WHERE campaign_id = $1', [req.params.campaign_id]);
        if (campCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Campaign not found' });
        
        if (!campCheck.rows[0].active) {
            const level = parseFloat(campCheck.rows[0].auto_dial_level) || 1.0;
            const trunkQuery = await pg.query('SELECT SUM(max_cps) as total_cps FROM gescall_trunks WHERE active = true');
            const usedQuery = await pg.query("SELECT SUM(auto_dial_level) as used_cps FROM gescall_campaigns WHERE active = true AND dial_method = 'RATIO'");
            
            const total_cps = parseInt(trunkQuery.rows[0].total_cps) || 0;
            const currently_used_cps = parseFloat(usedQuery.rows[0].used_cps) || 0;
            const projected_total = currently_used_cps + level;

            if (projected_total > total_cps) {
                return res.status(400).json({ 
                    success: false, 
                    error: `No se puede iniciar. Saldo insuficiente de CPS. Límite: ${total_cps}, Utilizado: ${currently_used_cps}, Campaña requiere: ${level}` 
                });
            }
        }

        await pg.query('UPDATE gescall_campaigns SET active = true WHERE campaign_id = $1', [req.params.campaign_id]);
        
        const username = req.user?.username || 'system';
        await pg.query(`
            INSERT INTO gescall_campaign_sessions (campaign_id, activated_by, activated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
        `, [req.params.campaign_id, username]);
        
        res.json({ success: true, status: 'active' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/:campaign_id/stop', async (req, res) => {
    try {
        await pg.query('UPDATE gescall_campaigns SET active = false WHERE campaign_id = $1', [req.params.campaign_id]);
        
        const username = req.user?.username || 'system';
        await pg.query(`
            UPDATE gescall_campaign_sessions 
            SET deactivated_at = CURRENT_TIMESTAMP, 
                deactivated_by = $2,
                duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - activated_at))::INT
            WHERE campaign_id = $1 AND deactivated_at IS NULL
        `, [req.params.campaign_id, username]);

        res.json({ success: true, status: 'inactive' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/:campaign_id/archive', async (req, res) => {
    try {
        await pg.query('UPDATE gescall_campaigns SET archived = true WHERE campaign_id = $1', [req.params.campaign_id]);
        res.json({ success: true, archived: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/:campaign_id/unarchive', async (req, res) => {
    try {
        await pg.query('UPDATE gescall_campaigns SET archived = false WHERE campaign_id = $1', [req.params.campaign_id]);
        res.json({ success: true, archived: false });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:campaign_id/stats', async (req, res) => {
    try {
        const { campaign_id } = req.params;
        const campQuery = await pg.query('SELECT * FROM gescall_campaigns WHERE campaign_id = $1', [campaign_id]);
        if (campQuery.rows.length === 0) return res.status(404).json({ success: false });

        // Native aggregation
        const statQuery = await pg.query(`
      SELECT 
        COUNT(lead_id) as total_leads,
        SUM(CASE WHEN status = 'NEW' THEN 1 ELSE 0 END) as leads_new,
        SUM(CASE WHEN status = 'ANSWER' THEN 1 ELSE 0 END) as leads_answered
      FROM gescall_leads l
      JOIN gescall_lists ls ON l.list_id = ls.list_id
      WHERE ls.campaign_id = $1
    `, [campaign_id]);

        const stats = statQuery.rows[0];
        
        const sessionQuery = await pg.query(`
            SELECT activated_at FROM gescall_campaign_sessions 
            WHERE campaign_id = $1 AND deactivated_at IS NULL 
            ORDER BY activated_at DESC LIMIT 1
        `, [campaign_id]);
        const active_since = sessionQuery.rows.length > 0 ? sessionQuery.rows[0].activated_at : null;

        res.json({
            success: true,
            data: {
                campaign_id: campQuery.rows[0].campaign_id,
                campaign_name: campQuery.rows[0].campaign_name,
                active: campQuery.rows[0].active ? 'Y' : 'N',
                active_since: active_since,
                archived: campQuery.rows[0].archived || false,
                total_leads: parseInt(stats.total_leads) || 0,
                leads_new: parseInt(stats.leads_new) || 0,
                leads_answered: parseInt(stats.leads_answered) || 0,
                max_retries: parseInt(campQuery.rows[0].max_retries) ?? 3,
                retry_settings: campQuery.rows[0].retry_settings || {},
                lead_structure_schema: campQuery.rows[0].lead_structure_schema || [],
                alt_phone_enabled: campQuery.rows[0].alt_phone_enabled || false
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/:campaign_id/call-log', async (req, res) => {
    try {
        const { campaign_id } = req.params;
        const { startDatetime, endDatetime } = req.body;

        let query = `
            SELECT 
                cl.log_id, 
                cl.lead_id, 
                cl.campaign_id, 
                cl.list_id, 
                cl.phone_number, 
                cl.call_date, 
                cl.call_status, 
                cl.call_duration as length_in_sec, 
                cl.dtmf_pressed, 
                cl.transferred_to as agent,
                ROW_NUMBER() OVER (PARTITION BY cl.lead_id ORDER BY cl.call_date ASC) as attempt_number,
                l.status,
                l.vendor_lead_code,
                l.called_count,
                l.tts_vars,
                ls.list_name,
                ls.list_name as list_description
            FROM gescall_call_log cl
            LEFT JOIN gescall_leads l ON cl.lead_id = l.lead_id
            LEFT JOIN gescall_lists ls ON cl.list_id = ls.list_id
            WHERE cl.campaign_id = $1
        `;
        let params = [campaign_id];

        if (startDatetime && endDatetime) {
            query += ` AND cl.call_date BETWEEN $2 AND $3`;
            params.push(startDatetime, endDatetime);
        }

        query += ` ORDER BY cl.call_date DESC`;

        const { rows } = await pg.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[pg_campaigns] Error fetching call log:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:campaign_id/lists', async (req, res) => {
    try {
        const { campaign_id } = req.params;
        const { rows } = await pg.query(`
            SELECT 
                l.*,
                COUNT(led.lead_id) as total_leads,
                SUM(CASE WHEN led.status = 'NEW' THEN 1 ELSE 0 END) as leads_new,
                SUM(CASE WHEN led.status NOT IN ('NEW', 'QUEUE') THEN 1 ELSE 0 END) as leads_contacted,
                SUM(COALESCE(led.called_count, 0)) as total_attempts,
                l.created_at,
                l.updated_at,
                l.updated_by
            FROM gescall_lists l
            LEFT JOIN gescall_leads led ON l.list_id = led.list_id
            WHERE l.campaign_id = $1
            GROUP BY l.list_id
            ORDER BY l.list_id DESC
        `, [campaign_id]);
        const rowsWithMappedActive = rows.map(r => ({
            ...r,
            active: r.active ? 'Y' : 'N'
        }));
        res.json({ success: true, data: rowsWithMappedActive });
    } catch (error) {
        console.error('[pg_campaigns] Error fetching lists:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/:campaign_id/progress', async (req, res) => {
    try {
        const { campaign_id } = req.params;

        const data = await pgDatabaseService.getProgressForSingleCampaign(
            campaign_id
        );

        console.log(`[pg_campaigns Progress] Campaign: ${campaign_id}, Data:`, data);

        res.json({
            success: true,
            data,
        });
    } catch (error) {
        console.error('[pg_campaigns Progress] Error:', error);
        res.json({
            success: false,
            error: error.message,
        });
    }
});

// ==================== CAMPAIGN STRUCTURE SCHEMA ====================

router.put('/:campaign_id/structure', async (req, res) => {
    try {
        const { campaign_id } = req.params;
        const { schema } = req.body;

        if (!Array.isArray(schema)) {
            return res.status(400).json({ success: false, error: 'esquema debe ser un array' });
        }

        console.log(`[pg_campaigns] Updating campaign ${campaign_id} structure schema`);
        await pg.query(
            'UPDATE gescall_campaigns SET lead_structure_schema = $1::jsonb WHERE campaign_id = $2',
            [JSON.stringify(schema), campaign_id]
        );

        res.json({
            success: true,
            message: `Estructura guardada exitosamente`,
            schema
        });
    } catch (error) {
        console.error('[pg_campaigns] Structure Schema Update Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CAMPAIGN ALT PHONE ====================

router.put('/:campaign_id/alt-phone', async (req, res) => {
    try {
        const { campaign_id } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ success: false, error: 'enabled debe ser un booleano' });
        }

        console.log(`[pg_campaigns] Updating campaign ${campaign_id} alt_phone_enabled to ${enabled}`);
        await pg.query(
            'UPDATE gescall_campaigns SET alt_phone_enabled = $1 WHERE campaign_id = $2',
            [enabled, campaign_id]
        );

        res.json({
            success: true,
            message: `Configuración de teléfonos alternos guardada`,
            enabled
        });
    } catch (error) {
        console.error('[pg_campaigns] Alt Phone Update Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== TTS TEMPLATES ====================

router.put('/:campaign_id/tts_templates', async (req, res) => {
    try {
        const { campaign_id } = req.params;
        const { templates } = req.body;

        if (!Array.isArray(templates)) {
            return res.status(400).json({ success: false, error: 'templates debe ser un array' });
        }

        console.log(`[pg_campaigns] Updating campaign ${campaign_id} TTS templates`);
        await pg.query(
            'UPDATE gescall_campaigns SET tts_templates = $1::jsonb WHERE campaign_id = $2',
            [JSON.stringify(templates), campaign_id]
        );

        res.json({
            success: true,
            message: `Plantillas guardadas exitosamente`,
            templates
        });
    } catch (error) {
        console.error('[pg_campaigns] TTS Templates Update Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CAMPAIGN DIAL LEVEL ====================

router.put('/:campaign_id/dial-level', async (req, res) => {
    try {
        const { campaign_id } = req.params;
        let { level } = req.body;

        if (level === undefined || level === null) {
            return res.status(400).json({ success: false, error: 'Target dial level is required' });
        }
        level = parseFloat(level);

        const campCheck = await pg.query("SELECT active FROM gescall_campaigns WHERE campaign_id = $1", [campaign_id]);
        if (campCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Campaign not found' });
        
        if (campCheck.rows[0].active) {
            const trunkQuery = await pg.query('SELECT SUM(max_cps) as total_cps FROM gescall_trunks WHERE active = true');
            const usedQuery = await pg.query("SELECT SUM(auto_dial_level) as used_cps FROM gescall_campaigns WHERE active = true AND dial_method = 'RATIO' AND campaign_id != $1", [campaign_id]);
            
            const total_cps = parseInt(trunkQuery.rows[0].total_cps) || 0;
            const other_used_cps = parseFloat(usedQuery.rows[0].used_cps) || 0;
            const projected_total = other_used_cps + level;

            if (projected_total > total_cps) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Saldo CPS insuficiente. Límite global: ${total_cps}, Usado por otras activas: ${other_used_cps}, Solicitado: ${level}` 
                });
            }
        }

        console.log(`[pg_campaigns] Updating campaign ${campaign_id} dial level to: ${level}`);
        await pg.query(
            'UPDATE gescall_campaigns SET auto_dial_level = $1 WHERE campaign_id = $2',
            [String(level), campaign_id]
        );

        res.json({
            success: true,
            message: `Nivel de marcación actualizado a ${level}`,
            level
        });
    } catch (error) {
        console.error('[pg_campaigns] Dial Level Update Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CAMPAIGN RETRIES LEVEL ====================

router.put('/:campaign_id/retries', async (req, res) => {
    try {
        const { campaign_id } = req.params;
        const { maxRetries } = req.body;

        if (maxRetries === undefined || maxRetries === null) {
            return res.status(400).json({ success: false, error: 'Target max retries is required' });
        }

        console.log(`[pg_campaigns] Updating campaign ${campaign_id} max retries to: ${maxRetries}`);
        await pg.query(
            'UPDATE gescall_campaigns SET max_retries = $1 WHERE campaign_id = $2',
            [parseInt(maxRetries), campaign_id]
        );

        res.json({
            success: true,
            message: `Límite de reintentos actualizado a ${maxRetries}`,
            maxRetries: parseInt(maxRetries)
        });
    } catch (error) {
        console.error('[pg_campaigns] Max Retries Update Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CAMPAIGN RETRIES SETTINGS ====================

router.put('/:campaign_id/retry-settings', async (req, res) => {
    try {
        const { campaign_id } = req.params;
        const { retry_settings } = req.body;

        if (!retry_settings || typeof retry_settings !== 'object') {
            return res.status(400).json({ success: false, error: 'retry_settings must be a JSON object' });
        }

        console.log(`[pg_campaigns] Updating campaign ${campaign_id} retry_settings to:`, retry_settings);
        await pg.query(
            'UPDATE gescall_campaigns SET retry_settings = $1::jsonb WHERE campaign_id = $2',
            [JSON.stringify(retry_settings), campaign_id]
        );

        res.json({
            success: true,
            message: `Tiempos de reintento actualizados`,
            retry_settings
        });
    } catch (error) {
        console.error('[pg_campaigns] Retry Settings Update Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CALLERID SETTINGS ====================

router.get('/:campaign_id/callerid-settings', async (req, res) => {
    try {
        const { campaign_id } = req.params;
        const settings = await databaseService.getCampaignCallerIdSettings(campaign_id);

        const defaultSettings = {
            campaign_id,
            rotation_mode: 'OFF',
            pool_id: null,
            pool_name: null,
            match_mode: 'LEAD',
            fixed_area_code: null,
            fallback_callerid: null,
            selection_strategy: 'ROUND_ROBIN',
            match_area_code: true
        };

        res.json({
            success: true,
            data: settings || defaultSettings
        });
    } catch (error) {
        console.error('[pg_campaigns] Error fetching CallerID Settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/:campaign_id/callerid-settings', async (req, res) => {
    try {
        const { campaign_id } = req.params;
        const { rotation_mode, pool_id, match_mode, fixed_area_code, fallback_callerid, selection_strategy, match_area_code } = req.body;

        await databaseService.upsertCampaignCallerIdSettings(campaign_id, {
            rotation_mode,
            pool_id,
            match_mode,
            fixed_area_code,
            fallback_callerid,
            selection_strategy,
            match_area_code
        });

        res.json({ success: true, message: 'Configuración guardada' });
    } catch (error) {
        console.error('[pg_campaigns] Error saving CallerID Settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CONSOLIDATED REPORTS ====================

router.post('/consolidated', async (req, res) => {
    /*  #swagger.tags = ['Campaigns']
        #swagger.description = 'Obtener registros de logs detallados de llamadas filtrados por campaña y fechas.'
        #swagger.parameters['body'] = {
            in: 'body',
            description: 'Filtros para los registros de campañas',
            required: true,
            schema: {
                $campaigns: ['DEMOCOL'],
                $startDatetime: '2026-03-01 00:00:00',
                $endDatetime: '2026-03-04 23:59:59'
            }
        }
    */
    try {
        const { campaigns, startDatetime, endDatetime } = req.body;

        if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
            return res.status(400).json({ success: false, error: 'campaigns array is required and cannot be empty' });
        }

        if (!startDatetime || !endDatetime) {
            return res.status(400).json({ success: false, error: 'startDatetime and endDatetime are required' });
        }

        let query = `
            SELECT 
                cl.log_id, 
                cl.lead_id, 
                cl.campaign_id, 
                cl.list_id, 
                cl.phone_number, 
                cl.call_date, 
                cl.call_status, 
                cl.call_duration as length_in_sec, 
                cl.dtmf_pressed, 
                cl.transferred_to as agent,
                ROW_NUMBER() OVER (PARTITION BY cl.lead_id ORDER BY cl.call_date ASC) as attempt_number,
                l.status as lead_status,
                l.vendor_lead_code,
                l.called_count,
                l.tts_vars,
                ls.list_name,
                ls.list_name as list_description
            FROM gescall_call_log cl
            LEFT JOIN gescall_leads l ON cl.lead_id = l.lead_id
            LEFT JOIN gescall_lists ls ON cl.list_id = ls.list_id
            WHERE cl.campaign_id = ANY($1)
              AND cl.call_date BETWEEN $2 AND $3
            ORDER BY cl.call_date DESC
            
        `;

        let params = [campaigns, startDatetime, endDatetime];

        const { rows } = await pg.query(query, params);

        console.log(`[pg_campaigns] Consolidated Report: ${campaigns.join(',')}, Records: ${rows.length}`);

        res.json({
            success: true,
            data: rows,
            meta: {
                campaigns: campaigns.length,
                records: rows.length,
                startDatetime,
                endDatetime,
            }
        });
    } catch (error) {
        console.error('[pg_campaigns] Error calculating consolidated report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/consolidated-stats', async (req, res) => {
    /*  #swagger.tags = ['Campaigns']
        #swagger.description = 'Obtener métricas consolidadas / reportes estadísticos de campañas.'
        #swagger.parameters['body'] = {
            in: 'body',
            description: 'Filtros de fechas e IDs de campaña',
            required: true,
            schema: {
                campaigns: ['DEMOCOL'],
                $startDatetime: '2026-03-01 00:00:00',
                $endDatetime: '2026-03-04 23:59:59'
            }
        }
    */
    try {
        const { startDatetime, endDatetime, campaigns } = req.body;

        if (!startDatetime || !endDatetime) {
            return res.status(400).json({ success: false, error: 'startDatetime and endDatetime are required' });
        }

        let query = `
            SELECT 
                c.campaign_id,
                c.campaign_name,
                COUNT(cl.log_id) as total_calls,
                SUM(CASE WHEN cl.call_status IN ('SALE', 'ANSWER') THEN 1 ELSE 0 END) as answered_calls,
                SUM(CASE WHEN cl.call_status = 'SALE' THEN 1 ELSE 0 END) as total_sales,
                SUM(CASE WHEN cl.call_status = 'DROP' THEN 1 ELSE 0 END) as total_drops,
                SUM(COALESCE(cl.call_duration, 0)) as total_talk_time_sec
            FROM gescall_campaigns c
            LEFT JOIN gescall_call_log cl ON c.campaign_id = cl.campaign_id 
                AND cl.call_date BETWEEN $1 AND $2
            WHERE 1=1
        `;

        let params = [startDatetime, endDatetime];

        if (campaigns && Array.isArray(campaigns) && campaigns.length > 0) {
            query += ` AND c.campaign_id = ANY($3)`;
            params.push(campaigns);
        } else {
            query += ` AND c.active = true`;
        }

        query += ` GROUP BY c.campaign_id, c.campaign_name ORDER BY c.campaign_name ASC`;

        const { rows } = await pg.query(query, params);

        // Convert string counts to integers
        const formattedRows = rows.map(row => ({
            campaign_id: row.campaign_id,
            campaign_name: row.campaign_name,
            total_calls: parseInt(row.total_calls) || 0,
            answered_calls: parseInt(row.answered_calls) || 0,
            total_sales: parseInt(row.total_sales) || 0,
            total_drops: parseInt(row.total_drops) || 0,
            total_talk_time_sec: parseInt(row.total_talk_time_sec) || 0
        }));

        res.json({
            success: true,
            data: formattedRows,
            meta: {
                startDatetime,
                endDatetime,
            }
        });
    } catch (error) {
        console.error('[pg_campaigns] Error calculating consolidated stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CAMPAIGN CREATION ====================

router.post('/create', async (req, res) => {
    try {
        const { campaign_name, dial_prefix = '52', auto_dial_level = 1.0, max_retries = 3, campaign_cid = '0000000000' } = req.body;

        if (!campaign_name) {
            return res.status(400).json({ success: false, error: 'campaign_name es requerido' });
        }

        const cname = campaign_name.slice(0, 40);

        // Auto-generate campaign_id: C001, C002, C003, ...
        const { rows: maxRows } = await pg.query(`
            SELECT campaign_id FROM gescall_campaigns
            WHERE campaign_id ~ '^C[0-9]+$'
            ORDER BY CAST(SUBSTRING(campaign_id FROM 2) AS INTEGER) DESC
            LIMIT 1
        `);

        let nextNum = 1;
        if (maxRows.length > 0) {
            const lastNum = parseInt(maxRows[0].campaign_id.substring(1), 10);
            nextNum = lastNum + 1;
        }
        const cid = `C${String(nextNum).padStart(3, '0')}`;

        console.log(`[pg_campaigns] Creating campaign: ${cid} - ${cname}`);

        // Insert into gescall_campaigns
        await pg.query(
            `INSERT INTO gescall_campaigns (campaign_id, campaign_name, active, archived, dial_prefix, dial_method, auto_dial_level, max_retries, campaign_cid)
             VALUES ($1, $2, false, false, $3, 'RATIO', $4, $5, $6)`,
            [cid, cname, dial_prefix, auto_dial_level, max_retries, campaign_cid]
        );

        // Create a user assigned to this campaign
        const userPass = `Gc${cid}!`;
        const password_hash = await bcrypt.hash(userPass, 10);
        const { rows: existingUser } = await pg.query('SELECT username FROM gescall_users WHERE username = $1', [cid]);
        if (existingUser.length === 0) {
            const roleNames = ['SUPER-ADMIN', 'ADMINISTRADOR', 'ADMIN'];
            let campaignUserRoleId;
            for (const name of roleNames) {
                const { rows } = await pg.query(
                    'SELECT role_id FROM gescall_roles WHERE role_name = $1 LIMIT 1',
                    [name]
                );
                if (rows[0]?.role_id != null) {
                    campaignUserRoleId = rows[0].role_id;
                    break;
                }
            }
            if (campaignUserRoleId == null) {
                const { rows: sysRows } = await pg.query(
                    `SELECT role_id FROM gescall_roles WHERE is_system = true ORDER BY role_id LIMIT 1`
                );
                campaignUserRoleId = sysRows[0]?.role_id;
            }
            if (campaignUserRoleId == null) {
                throw new Error(
                    'No hay rol de administración en gescall_roles (SUPER-ADMIN, ADMINISTRADOR o rol is_system). Revise la tabla gescall_roles.'
                );
            }
            await pg.query(
                `INSERT INTO gescall_users (username, password_hash, role_id) VALUES ($1, $2, $3)`,
                [cid, password_hash, campaignUserRoleId]
            );
        }

        // CallerID settings
        try {
            await pg.query(
                `INSERT INTO gescall_campaign_callerid_settings (campaign_id, rotation_mode) VALUES ($1, 'OFF') ON CONFLICT DO NOTHING`,
                [cid]
            );
        } catch (e) {
            console.log(`[pg_campaigns] CallerID settings skipped: ${e.message}`);
        }

        res.json({
            success: true,
            data: {
                campaign_id: cid,
                campaign_name: cname,
                user: cid,
                user_password: userPass,
                dial_prefix: dial_prefix,
            },
            message: `Campaña ${cid} creada exitosamente`
        });

    } catch (error) {
        console.error('[pg_campaigns] Create Campaign Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
