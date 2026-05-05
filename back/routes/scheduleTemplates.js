/**
 * Plantillas de horarios reutilizables (`gescall_schedule_templates`).
 *
 * El formato de `windows` coincide con el `dial_schedule` JSONB de cada campaña
 * (migración 022). Al asignar un template a una campaña, los triggers PG copian
 * la configuración a `gescall_campaigns.dial_schedule`, así el dialer Go sigue
 * leyendo solo esa columna.
 */
const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');

const TIME_RE = /^\d{1,2}:\d{2}$/;

function padHHMM(value, fallback) {
    const v = String(value || '').trim();
    const m = TIME_RE.exec(v);
    if (!m) return fallback;
    const [h, min] = v.split(':').map((n) => parseInt(n, 10));
    if (Number.isNaN(h) || Number.isNaN(min)) return fallback;
    const hh = Math.min(23, Math.max(0, h));
    const mm = Math.min(59, Math.max(0, min));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function normalizeWindows(input) {
    if (!Array.isArray(input)) return [];
    return input.map((w) => {
        const days = Array.isArray(w?.days)
            ? Array.from(
                  new Set(
                      w.days
                          .map((d) => parseInt(d, 10))
                          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
                  )
              ).sort((a, b) => a - b)
            : [];
        return {
            days,
            start: padHHMM(w?.start, '09:00'),
            end: padHHMM(w?.end, '18:00'),
        };
    });
}

function validatePayload(body, { partial = false } = {}) {
    const errors = [];
    if (!partial || body.name !== undefined) {
        if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
            errors.push('name es requerido');
        } else if (body.name.length > 120) {
            errors.push('name demasiado largo (max 120)');
        }
    }
    if (!partial || body.windows !== undefined) {
        if (!Array.isArray(body.windows)) {
            errors.push('windows debe ser un arreglo');
        } else if (body.enabled !== false) {
            const bad = body.windows.find((w) => !Array.isArray(w?.days) || w.days.length === 0);
            if (bad) errors.push('cada ventana habilitada debe incluir al menos un día');
        }
    }
    if (!partial && body.timezone !== undefined && typeof body.timezone !== 'string') {
        errors.push('timezone debe ser un string IANA');
    }
    return errors;
}

// GET /api/schedule-templates
router.get('/', async (_req, res) => {
    try {
        const { rows } = await pg.query(`
            SELECT t.*, (
                SELECT COUNT(*)::int FROM gescall_campaigns c
                 WHERE c.schedule_template_id = t.id
            ) AS campaign_count
              FROM gescall_schedule_templates t
             ORDER BY t.name ASC
        `);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[schedule_templates] list error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/schedule-templates/:id
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await pg.query(
            'SELECT * FROM gescall_schedule_templates WHERE id = $1',
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'No encontrado' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('[schedule_templates] get error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/schedule-templates/:id/campaigns
router.get('/:id/campaigns', async (req, res) => {
    try {
        const { rows } = await pg.query(
            `SELECT campaign_id, campaign_name, active
               FROM gescall_campaigns
              WHERE schedule_template_id = $1
              ORDER BY campaign_name ASC`,
            [req.params.id]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[schedule_templates] campaigns error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/schedule-templates
router.post('/', async (req, res) => {
    try {
        const errors = validatePayload(req.body);
        if (errors.length) {
            return res.status(400).json({ success: false, error: errors.join('; ') });
        }
        const {
            name,
            description = null,
            timezone = 'America/Mexico_City',
            enabled = true,
            windows = [],
        } = req.body;

        const tz = typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'America/Mexico_City';
        const wins = normalizeWindows(windows);

        const created_by = req.user?.username || req.user?.user || null;

        const { rows } = await pg.query(
            `INSERT INTO gescall_schedule_templates (name, description, timezone, windows, enabled, created_by)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6)
             RETURNING *`,
            [name.trim(), description, tz, JSON.stringify(wins), !!enabled, created_by]
        );
        res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('[schedule_templates] create error:', error);
        if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'Ya existe un horario con ese nombre' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/schedule-templates/:id
router.put('/:id', async (req, res) => {
    try {
        const errors = validatePayload(req.body, { partial: true });
        if (errors.length) {
            return res.status(400).json({ success: false, error: errors.join('; ') });
        }

        const { rows: existingRows } = await pg.query(
            'SELECT * FROM gescall_schedule_templates WHERE id = $1',
            [req.params.id]
        );
        if (!existingRows.length) return res.status(404).json({ success: false, error: 'No encontrado' });

        const cur = existingRows[0];
        const next = {
            name: req.body.name !== undefined ? String(req.body.name).trim() : cur.name,
            description: req.body.description !== undefined ? req.body.description : cur.description,
            timezone:
                req.body.timezone !== undefined && String(req.body.timezone).trim()
                    ? String(req.body.timezone).trim()
                    : cur.timezone,
            enabled: req.body.enabled !== undefined ? !!req.body.enabled : cur.enabled,
            windows:
                req.body.windows !== undefined
                    ? normalizeWindows(req.body.windows)
                    : cur.windows,
        };

        const { rows } = await pg.query(
            `UPDATE gescall_schedule_templates
                SET name = $1, description = $2, timezone = $3, windows = $4::jsonb, enabled = $5
              WHERE id = $6
              RETURNING *`,
            [
                next.name,
                next.description,
                next.timezone,
                JSON.stringify(next.windows),
                next.enabled,
                req.params.id,
            ]
        );
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('[schedule_templates] update error:', error);
        if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'Ya existe un horario con ese nombre' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/schedule-templates/:id
router.delete('/:id', async (req, res) => {
    try {
        const { rowCount } = await pg.query(
            'DELETE FROM gescall_schedule_templates WHERE id = $1',
            [req.params.id]
        );
        if (!rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });
        res.json({ success: true });
    } catch (error) {
        console.error('[schedule_templates] delete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
