const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');

// ─── Condition matching ────────────────────────────────────────────

/**
 * Evaluate whether a disposition's conditions match a call record.
 * Returns true if all conditions are satisfied.
 */
function matchConditions(record, conditions) {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    const cs = (record.call_status || '').toUpperCase();
    const ls = (record.lead_status || '').toUpperCase();
    const dtmf = record.dtmf_pressed || '';
    const duration = parseInt(record.length_in_sec || record.call_duration || '0');

    // call_status and lead_status are OR'd: match if EITHER condition matches
    let hasStatusCondition = false;
    let statusMatched = false;

    if (conditions.call_status && Array.isArray(conditions.call_status) && conditions.call_status.length > 0) {
        hasStatusCondition = true;
        if (conditions.call_status.includes(cs)) statusMatched = true;
    }
    if (conditions.lead_status && Array.isArray(conditions.lead_status) && conditions.lead_status.length > 0) {
        hasStatusCondition = true;
        if (conditions.lead_status.includes(ls)) statusMatched = true;
    }
    if (hasStatusCondition && !statusMatched) return false;

    // dtmf, exclude_typification, require_typification, min_duration are AND conditions
    if (conditions.dtmf && Array.isArray(conditions.dtmf) && conditions.dtmf.length > 0) {
        if (!conditions.dtmf.includes(dtmf)) return false;
    }
    if (conditions.exclude_typification === true) {
        if (record.typification_name) return false;
    }
    if (conditions.require_typification === true) {
        if (!record.typification_name) return false;
    }
    if (typeof conditions.min_duration === 'number') {
        if (duration < conditions.min_duration) return false;
    }

    return true;
}

/**
 * Find the disposition that matches a given call record for a campaign.
 * Evaluates in sort_order; returns the first matching label, or "Desconocido".
 * This is the DB-backed replacement for the hardcoded getDisposition().
 */
async function getDispositionForRecord(record, campaignId) {
    try {
        const { rows } = await pg.query(
            `SELECT id, code, label, color, conditions FROM gescall_dispositions 
             WHERE campaign_id = $1 AND active = true 
             ORDER BY sort_order ASC`,
            [campaignId]
        );

        for (const dispo of rows) {
            const conditions = typeof dispo.conditions === 'string'
                ? JSON.parse(dispo.conditions)
                : dispo.conditions;

            if (matchConditions(record, conditions)) {
                return { label: dispo.label, code: dispo.code, color: dispo.color };
            }
        }

        return { label: 'Desconocido', code: 'DESCONOCIDO', color: 'bg-slate-400' };
    } catch (err) {
        console.error('[dispositions] Error evaluating:', err.message);
        return { label: 'Desconocido', code: 'DESCONOCIDO', color: 'bg-slate-400' };
    }
}

// ─── Routes ─────────────────────────────────────────────────────────

// GET /campaigns/:campaignId/dispositions
router.get('/campaigns/:campaignId/dispositions', async (req, res) => {
    try {
        const { rows } = await pg.query(
            `SELECT * FROM gescall_dispositions 
             WHERE campaign_id = $1 
             ORDER BY sort_order ASC`,
            [req.params.campaignId]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /campaigns/:campaignId/dispositions/defaults (reference only)
router.get('/campaigns/:campaignId/dispositions/defaults', async (req, res) => {
    try {
        const defaults = [
            { code: 'TRANSFERIDO', label: 'Transferido', color: 'bg-green-500', sort_order: 1,
              conditions: { dtmf: ['2'], call_status: ['XFER'], require_typification: true } },
            { code: 'CONTESTADA',  label: 'Contestada',  color: 'bg-blue-500',  sort_order: 2,
              conditions: { require_typification: true } },
            { code: 'COMPLETADO',  label: 'Completado',  color: 'bg-blue-500',  sort_order: 3,
              conditions: { call_status: ['COMPLET'] } },
            { code: 'RECHAZADA',   label: 'Rechazada',   color: 'bg-orange-500', sort_order: 4,
              conditions: { call_status: ['HANGUP'], exclude_typification: true } },
            { code: 'FALLIDA',     label: 'Fallida',     color: 'bg-red-500',   sort_order: 5,
              conditions: { call_status: ['FAILED'] } },
            { code: 'NO_CONTESTA', label: 'No Contesta', color: 'bg-yellow-500', sort_order: 6,
              conditions: { call_status: ['DIALING','IVR_START','NA','RINGING','AA','N'], lead_status: ['NA','AA','N','NEW','QUEUE'], exclude_typification: true } },
            { code: 'OCUPADO',     label: 'Ocupado',     color: 'bg-purple-500', sort_order: 7,
              conditions: { call_status: ['B','BUSY','CONGESTION','AB'], lead_status: ['B','AB'] } },
            { code: 'CORTADA',     label: 'Cortada',     color: 'bg-red-400',  sort_order: 8,
              conditions: { call_status: ['DROP','PDROP','XDROP'], lead_status: ['DROP','PDROP','XDROP'] } },
            { code: 'BUZON',       label: 'Buzón',       color: 'bg-indigo-400', sort_order: 9,
              conditions: { call_status: ['AM','AL'] } },
            { code: 'NO_LLAMAR',   label: 'No Llamar',   color: 'bg-slate-500', sort_order: 10,
              conditions: { call_status: ['DNC','DNCC'] } },
            { code: 'VENTA',       label: 'Venta',       color: 'bg-emerald-600', sort_order: 11,
              conditions: { call_status: ['SALE'], lead_status: ['SALE'] } },
        ];
        res.json({ success: true, data: defaults });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /campaigns/:campaignId/dispositions
router.post('/campaigns/:campaignId/dispositions', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { code, label, color, sort_order, conditions, active } = req.body;

        if (!code || !label) {
            return res.status(400).json({ success: false, error: 'code y label son requeridos' });
        }

        const order = sort_order !== undefined ? sort_order : 999;
        const conds = conditions ? JSON.stringify(conditions) : '{}';
        const isActive = active !== undefined ? active : true;

        const { rows } = await pg.query(
            `INSERT INTO gescall_dispositions (campaign_id, code, label, color, sort_order, conditions, active, is_default)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, false)
             ON CONFLICT (campaign_id, code) DO UPDATE 
             SET label = $3, color = $4, sort_order = $5, conditions = $6::jsonb, active = $7, updated_at = NOW()
             RETURNING *`,
            [campaignId, code, label, color || 'bg-slate-400', order, conds, isActive]
        );

        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /campaigns/:campaignId/dispositions/:id
router.put('/campaigns/:campaignId/dispositions/:id', async (req, res) => {
    try {
        const { campaignId, id } = req.params;
        const { code, label, color, sort_order, conditions, active } = req.body;

        const fields = [];
        const params = [];
        let paramIdx = 1;

        if (code !== undefined) { fields.push(`code = $${paramIdx++}`); params.push(code); }
        if (label !== undefined) { fields.push(`label = $${paramIdx++}`); params.push(label); }
        if (color !== undefined) { fields.push(`color = $${paramIdx++}`); params.push(color); }
        if (sort_order !== undefined) { fields.push(`sort_order = $${paramIdx++}`); params.push(sort_order); }
        if (conditions !== undefined) { fields.push(`conditions = $${paramIdx++}::jsonb`); params.push(JSON.stringify(conditions)); }
        if (active !== undefined) { fields.push(`active = $${paramIdx++}`); params.push(active); }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        fields.push(`updated_at = NOW()`);
        params.push(campaignId, id);

        const { rows } = await pg.query(
            `UPDATE gescall_dispositions SET ${fields.join(', ')} 
             WHERE campaign_id = $${paramIdx++} AND id = $${paramIdx++}
             RETURNING *`,
            params
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Disposition not found' });
        }

        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /campaigns/:campaignId/dispositions/:id
router.delete('/campaigns/:campaignId/dispositions/:id', async (req, res) => {
    try {
        const { campaignId, id } = req.params;

        const { rows } = await pg.query(
            `DELETE FROM gescall_dispositions WHERE campaign_id = $1 AND id = $2 RETURNING *`,
            [campaignId, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Disposition not found' });
        }

        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /campaigns/:campaignId/dispositions/reorder
router.post('/campaigns/:campaignId/dispositions/reorder', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { ids } = req.body; // array of disposition ids in the new order

        if (!Array.isArray(ids)) {
            return res.status(400).json({ success: false, error: 'ids array is required' });
        }

        const client = await pg.pool.connect();
        try {
            await client.query('BEGIN');
            for (let i = 0; i < ids.length; i++) {
                await client.query(
                    `UPDATE gescall_dispositions SET sort_order = $1, updated_at = NOW() 
                     WHERE id = $2 AND campaign_id = $3`,
                    [i + 1, ids[i], campaignId]
                );
            }
            await client.query('COMMIT');
            res.json({ success: true });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /campaigns/:campaignId/dispositions/reset-defaults
router.post('/campaigns/:campaignId/dispositions/reset-defaults', async (req, res) => {
    try {
        const { campaignId } = req.params;

        const defaults = [
            { code: 'TRANSFERIDO', label: 'Transferido', color: 'bg-green-500', sort_order: 1,
              conditions: { dtmf: ['2'], call_status: ['XFER'], require_typification: true } },
            { code: 'CONTESTADA',  label: 'Contestada',  color: 'bg-blue-500',  sort_order: 2,
              conditions: { require_typification: true } },
            { code: 'COMPLETADO',  label: 'Completado',  color: 'bg-blue-500',  sort_order: 3,
              conditions: { call_status: ['COMPLET'] } },
            { code: 'RECHAZADA',   label: 'Rechazada',   color: 'bg-orange-500', sort_order: 4,
              conditions: { call_status: ['HANGUP'], exclude_typification: true } },
            { code: 'FALLIDA',     label: 'Fallida',     color: 'bg-red-500',   sort_order: 5,
              conditions: { call_status: ['FAILED'] } },
            { code: 'NO_CONTESTA', label: 'No Contesta', color: 'bg-yellow-500', sort_order: 6,
              conditions: { call_status: ['DIALING','IVR_START','NA','RINGING','AA','N'], lead_status: ['NA','AA','N','NEW','QUEUE'], exclude_typification: true } },
            { code: 'OCUPADO',     label: 'Ocupado',     color: 'bg-purple-500', sort_order: 7,
              conditions: { call_status: ['B','BUSY','CONGESTION','AB'], lead_status: ['B','AB'] } },
            { code: 'CORTADA',     label: 'Cortada',     color: 'bg-red-400',  sort_order: 8,
              conditions: { call_status: ['DROP','PDROP','XDROP'], lead_status: ['DROP','PDROP','XDROP'] } },
            { code: 'BUZON',       label: 'Buzón',       color: 'bg-indigo-400', sort_order: 9,
              conditions: { call_status: ['AM','AL'] } },
            { code: 'NO_LLAMAR',   label: 'No Llamar',   color: 'bg-slate-500', sort_order: 10,
              conditions: { call_status: ['DNC','DNCC'] } },
            { code: 'VENTA',       label: 'Venta',       color: 'bg-emerald-600', sort_order: 11,
              conditions: { call_status: ['SALE'], lead_status: ['SALE'] } },
        ];

        const client = await pg.pool.connect();
        try {
            await client.query('BEGIN');

            // Delete existing
            await client.query(`DELETE FROM gescall_dispositions WHERE campaign_id = $1`, [campaignId]);

            // Re-insert defaults
            for (const d of defaults) {
                await client.query(
                    `INSERT INTO gescall_dispositions (campaign_id, code, label, color, sort_order, conditions, active, is_default)
                     VALUES ($1, $2, $3, $4, $5, $6::jsonb, true, true)`,
                    [campaignId, d.code, d.label, d.color, d.sort_order, JSON.stringify(d.conditions)]
                );
            }

            await client.query('COMMIT');

            const { rows } = await pg.query(
                `SELECT * FROM gescall_dispositions WHERE campaign_id = $1 ORDER BY sort_order ASC`,
                [campaignId]
            );
            res.json({ success: true, data: rows });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
module.exports.getDispositionForRecord = getDispositionForRecord;
module.exports.matchConditions = matchConditions;
