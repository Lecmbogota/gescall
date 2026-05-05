/**
 * GesCall — Reports module
 *
 * Endpoints:
 *   GET    /api/reports/columns                       Catálogo de columnas (whitelist)
 *   GET    /api/reports/templates                     Listar plantillas accesibles
 *   GET    /api/reports/templates/:id                 Obtener una plantilla
 *   POST   /api/reports/templates                     Crear plantilla (perm: create_custom_reports)
 *   PUT    /api/reports/templates/:id                 Editar plantilla (perm: edit_custom_reports + propietario o admin)
 *   DELETE /api/reports/templates/:id                 Eliminar (perm: delete_custom_reports + propietario o admin)
 *   POST   /api/reports/run                           Ejecutar definición ad-hoc (perm: view_reports)
 *   POST   /api/reports/templates/:id/run             Ejecutar plantilla guardada (perm: view_reports)
 *
 * Reportes de sistema (agregaciones predefinidas, perm: view_reports):
 *   POST   /api/reports/system/disposition-summary    Conteo y duración por estado
 *   POST   /api/reports/system/temporal-distribution  Distribución por hora / día
 *   POST   /api/reports/system/agent-pause-summary    Tiempo en pausa por agente y tipo
 */
const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');

// ─────────────────────────────────────────────────────────────────────────────
// Whitelist: catálogo de columnas disponibles para reportes personalizados.
// Cualquier columna que no aparezca aquí NO se puede solicitar desde el front.
// ─────────────────────────────────────────────────────────────────────────────
const COLUMN_CATALOG = [
    // ── Identificación ───────────────────────────────────────────────
    { id: 'log_id', label: 'ID Log', sql: 'cl.log_id', group: 'Identificación', type: 'integer' },
    { id: 'lead_id', label: 'ID Lead', sql: 'cl.lead_id', group: 'Identificación', type: 'integer' },
    { id: 'campaign_id', label: 'Campaña (ID)', sql: 'cl.campaign_id', group: 'Identificación', type: 'string' },
    { id: 'campaign_name', label: 'Campaña (Nombre)', sql: 'c.campaign_name', group: 'Identificación', type: 'string', join: 'campaigns' },
    { id: 'list_id', label: 'Lista (ID)', sql: 'cl.list_id', group: 'Identificación', type: 'integer' },
    { id: 'list_name', label: 'Lista (Nombre)', sql: 'ls.list_name', group: 'Identificación', type: 'string', join: 'lists' },
    { id: 'vendor_lead_code', label: 'Identificador Lead', sql: 'l.vendor_lead_code', group: 'Identificación', type: 'string', join: 'leads' },
    { id: 'uniqueid', label: 'UniqueID Asterisk', sql: 'cl.uniqueid', group: 'Identificación', type: 'string' },

    // ── Llamada ──────────────────────────────────────────────────────
    { id: 'call_date', label: 'Fecha y hora', sql: 'cl.call_date', group: 'Llamada', type: 'datetime' },
    { id: 'phone_number', label: 'Teléfono', sql: 'cl.phone_number', group: 'Llamada', type: 'string' },
    { id: 'call_status', label: 'Estado de llamada', sql: 'cl.call_status', group: 'Llamada', type: 'string' },
    { id: 'lead_status', label: 'Estado del Lead', sql: 'l.status', group: 'Llamada', type: 'string', join: 'leads' },
    { id: 'call_duration', label: 'Duración (s)', sql: 'cl.call_duration', group: 'Llamada', type: 'integer' },
    { id: 'dtmf_pressed', label: 'DTMF', sql: 'cl.dtmf_pressed', group: 'Llamada', type: 'string' },
    { id: 'call_direction', label: 'Dirección', sql: 'cl.call_direction', group: 'Llamada', type: 'string' },
    { id: 'hangup_cause', label: 'Causa de colgado', sql: 'cl.hangup_cause', group: 'Llamada', type: 'string' },
    { id: 'transferred_to', label: 'Transferido a', sql: 'cl.transferred_to', group: 'Llamada', type: 'string' },
    { id: 'trunk_id', label: 'Troncal', sql: 'cl.trunk_id', group: 'Llamada', type: 'string' },

    // ── Lead ─────────────────────────────────────────────────────────
    { id: 'first_name', label: 'Nombre', sql: 'l.first_name', group: 'Lead', type: 'string', join: 'leads' },
    { id: 'last_name', label: 'Apellido', sql: 'l.last_name', group: 'Lead', type: 'string', join: 'leads' },
    { id: 'state', label: 'Estado/Región', sql: 'l.state', group: 'Lead', type: 'string', join: 'leads' },
    { id: 'alt_phone', label: 'Teléfono alternativo', sql: 'l.alt_phone', group: 'Lead', type: 'string', join: 'leads' },
    { id: 'comments', label: 'Comentarios', sql: 'l.comments', group: 'Lead', type: 'string', join: 'leads' },
    { id: 'called_count', label: 'Intentos', sql: 'l.called_count', group: 'Lead', type: 'integer', join: 'leads' },
    { id: 'last_call_time', label: 'Última llamada', sql: 'l.last_call_time', group: 'Lead', type: 'datetime', join: 'leads' },
];

const COLUMN_INDEX = Object.fromEntries(COLUMN_CATALOG.map(c => [c.id, c]));

// Estados conocidos de llamada (whitelist para filtros)
const KNOWN_CALL_STATUS = ['ANSWER', 'SALE', 'DROP', 'NA', 'B', 'AB', 'AM', 'CONGESTION', 'CANCEL', 'NOANSWER', 'BUSY', 'DNC', 'TIMEOUT', 'FAIL'];
const KNOWN_DIRECTIONS = ['OUTBOUND', 'INBOUND'];
const SCOPES = ['multi_campaign', 'single_campaign'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de permisos (mismo patrón que routes/users.js y routes/tickets.js)
// ─────────────────────────────────────────────────────────────────────────────
async function checkPermission(role_id, permissionId) {
    try {
        const roleRes = await pg.query('SELECT is_system FROM gescall_roles WHERE role_id = $1', [role_id]);
        if (roleRes.rows.length > 0 && roleRes.rows[0].is_system) return true;

        const result = await pg.query(
            'SELECT 1 FROM gescall_role_permissions WHERE role_id = $1 AND permission = $2',
            [role_id, permissionId]
        );
        return result.rows.length > 0;
    } catch (error) {
        console.error(`[reports] Error checking permission ${permissionId}:`, error.message);
        return false;
    }
}

function requirePermission(permissionId) {
    return async (req, res, next) => {
        if (req.user?.is_system) return next();
        const role_id = req.user?.role_id;
        if (!role_id) {
            return res.status(403).json({ success: false, error: 'Acceso denegado: sin rol válido' });
        }
        const allowed = await checkPermission(role_id, permissionId);
        if (!allowed) {
            return res.status(403).json({ success: false, error: `Acceso denegado: falta el permiso "${permissionId}"` });
        }
        next();
    };
}

// Devuelve los campaign_id permitidos para el usuario; null = todas (admin)
async function getAccessibleCampaignIds(req) {
    if (req.user?.is_system) return null;
    const userId = req.user?.user_id;
    if (!userId) return [];
    const { rows } = await pg.query(
        'SELECT campaign_id FROM gescall_user_campaigns WHERE user_id = $1',
        [userId]
    );
    return rows.map(r => r.campaign_id);
}

function intersectCampaigns(requested, accessible) {
    if (!Array.isArray(requested) || requested.length === 0) {
        return accessible == null ? null : accessible;
    }
    if (accessible == null) return requested;
    return requested.filter(c => accessible.includes(c));
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación y construcción de SQL para reportes personalizados
// ─────────────────────────────────────────────────────────────────────────────
function validateColumns(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('Debe seleccionar al menos una columna');
    }
    const invalid = ids.filter(id => !COLUMN_INDEX[id]);
    if (invalid.length > 0) {
        throw new Error(`Columnas no permitidas: ${invalid.join(', ')}`);
    }
    return ids.map(id => COLUMN_INDEX[id]);
}

function buildJoins(columns) {
    const joins = new Set();
    for (const col of columns) {
        if (col.join) joins.add(col.join);
    }
    return Array.from(joins);
}

function buildSelectQuery(columns, filters, campaigns, startDatetime, endDatetime, sort, limit) {
    const selects = columns.map(c => `${c.sql} AS "${c.id}"`).join(', ');
    const joins = buildJoins(columns);

    let sql = `SELECT ${selects} FROM gescall_call_log cl`;
    if (joins.includes('leads')) sql += ' LEFT JOIN gescall_leads l ON cl.lead_id = l.lead_id';
    if (joins.includes('lists')) sql += ' LEFT JOIN gescall_lists ls ON cl.list_id = ls.list_id';
    if (joins.includes('campaigns')) sql += ' LEFT JOIN gescall_campaigns c ON cl.campaign_id = c.campaign_id';

    const where = ['cl.campaign_id = ANY($1)', 'cl.call_date BETWEEN $2 AND $3'];
    const params = [campaigns, startDatetime, endDatetime];

    // Filtros opcionales
    if (filters && typeof filters === 'object') {
        if (Array.isArray(filters.status) && filters.status.length > 0) {
            const valid = filters.status.filter(s => KNOWN_CALL_STATUS.includes(s));
            if (valid.length > 0) {
                params.push(valid);
                where.push(`cl.call_status = ANY($${params.length})`);
            }
        }
        if (filters.direction && KNOWN_DIRECTIONS.includes(filters.direction)) {
            params.push(filters.direction);
            where.push(`cl.call_direction = $${params.length}`);
        }
        if (filters.min_duration != null && Number.isFinite(Number(filters.min_duration))) {
            params.push(Number(filters.min_duration));
            where.push(`cl.call_duration >= $${params.length}`);
        }
        if (filters.has_dtmf === true) {
            where.push(`COALESCE(cl.dtmf_pressed, '') <> ''`);
        }
        if (Array.isArray(filters.list_ids) && filters.list_ids.length > 0) {
            const ids = filters.list_ids.map(Number).filter(Number.isFinite);
            if (ids.length > 0) {
                params.push(ids);
                where.push(`cl.list_id = ANY($${params.length})`);
            }
        }
    }

    sql += ' WHERE ' + where.join(' AND ');

    // Orden (whitelist)
    const sortColId = sort?.by && COLUMN_INDEX[sort.by] ? COLUMN_INDEX[sort.by].sql : 'cl.call_date';
    const sortDir = sort?.dir === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortColId} ${sortDir}`;

    const safeLimit = Math.min(Math.max(Number(limit) || 100000, 1), 500000);
    sql += ` LIMIT ${safeLimit}`;

    return { sql, params };
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// Catálogo de columnas (sólo metadatos: id, label, group, type) — sin SQL
router.get('/columns', requirePermission('view_reports'), (_req, res) => {
    const data = COLUMN_CATALOG.map(({ id, label, group, type }) => ({ id, label, group, type }));
    res.json({ success: true, data });
});

// Listar plantillas (compartidas + propias)
router.get('/templates', requirePermission('view_reports'), async (req, res) => {
    try {
        const userId = req.user?.user_id || null;
        const isAdmin = req.user?.is_system === true;

        let sql, params;
        if (isAdmin) {
            sql = 'SELECT * FROM gescall_report_templates ORDER BY updated_at DESC';
            params = [];
        } else {
            sql = `SELECT * FROM gescall_report_templates
                   WHERE is_shared = true OR owner_user_id = $1
                   ORDER BY updated_at DESC`;
            params = [userId];
        }
        const { rows } = await pg.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[reports] Error listing templates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener una plantilla
router.get('/templates/:id', requirePermission('view_reports'), async (req, res) => {
    try {
        const { rows } = await pg.query('SELECT * FROM gescall_report_templates WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });
        const tpl = rows[0];
        if (!req.user?.is_system && !tpl.is_shared && tpl.owner_user_id !== req.user?.user_id) {
            return res.status(403).json({ success: false, error: 'No tiene acceso a esta plantilla' });
        }
        res.json({ success: true, data: tpl });
    } catch (error) {
        console.error('[reports] Error fetching template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Crear plantilla
router.post('/templates', requirePermission('create_custom_reports'), async (req, res) => {
    try {
        const { name, description = '', scope = 'multi_campaign', definition = {}, is_shared = true } = req.body || {};
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });
        }
        if (!SCOPES.includes(scope)) {
            return res.status(400).json({ success: false, error: 'Scope inválido' });
        }
        // Validar columnas (si vienen) sin ejecutar consulta
        if (Array.isArray(definition.columns) && definition.columns.length > 0) {
            try { validateColumns(definition.columns); }
            catch (e) { return res.status(400).json({ success: false, error: e.message }); }
        }

        const { rows } = await pg.query(
            `INSERT INTO gescall_report_templates
             (name, description, scope, definition, owner_user_id, owner_username, is_shared)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                name.trim().substring(0, 150),
                description.toString().substring(0, 2000),
                scope,
                JSON.stringify(definition),
                req.user?.user_id || null,
                req.user?.username || null,
                Boolean(is_shared),
            ]
        );
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('[reports] Error creating template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Editar plantilla
router.put('/templates/:id', requirePermission('edit_custom_reports'), async (req, res) => {
    try {
        const id = req.params.id;
        const existing = await pg.query('SELECT * FROM gescall_report_templates WHERE id = $1', [id]);
        if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });
        const tpl = existing.rows[0];

        const isAdmin = req.user?.is_system === true;
        if (!isAdmin && tpl.owner_user_id !== req.user?.user_id) {
            return res.status(403).json({ success: false, error: 'Solo el propietario puede editar esta plantilla' });
        }

        const { name, description, scope, definition, is_shared } = req.body || {};
        if (scope && !SCOPES.includes(scope)) {
            return res.status(400).json({ success: false, error: 'Scope inválido' });
        }
        if (definition && Array.isArray(definition.columns) && definition.columns.length > 0) {
            try { validateColumns(definition.columns); }
            catch (e) { return res.status(400).json({ success: false, error: e.message }); }
        }

        const { rows } = await pg.query(
            `UPDATE gescall_report_templates SET
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                scope = COALESCE($4, scope),
                definition = COALESCE($5::jsonb, definition),
                is_shared = COALESCE($6, is_shared),
                updated_at = NOW()
             WHERE id = $1 RETURNING *`,
            [
                id,
                name ? String(name).trim().substring(0, 150) : null,
                description != null ? String(description).substring(0, 2000) : null,
                scope || null,
                definition ? JSON.stringify(definition) : null,
                typeof is_shared === 'boolean' ? is_shared : null,
            ]
        );
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('[reports] Error updating template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Eliminar plantilla
router.delete('/templates/:id', requirePermission('delete_custom_reports'), async (req, res) => {
    try {
        const id = req.params.id;
        const existing = await pg.query('SELECT owner_user_id FROM gescall_report_templates WHERE id = $1', [id]);
        if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });

        const isAdmin = req.user?.is_system === true;
        if (!isAdmin && existing.rows[0].owner_user_id !== req.user?.user_id) {
            return res.status(403).json({ success: false, error: 'Solo el propietario puede eliminar esta plantilla' });
        }

        await pg.query('DELETE FROM gescall_report_templates WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('[reports] Error deleting template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Ejecutar definición ad-hoc
router.post('/run', requirePermission('view_reports'), async (req, res) => {
    try {
        const { columns, filters = {}, campaigns = [], startDatetime, endDatetime, sort, limit } = req.body || {};
        if (!startDatetime || !endDatetime) {
            return res.status(400).json({ success: false, error: 'startDatetime y endDatetime son requeridos' });
        }

        let parsedColumns;
        try { parsedColumns = validateColumns(columns); }
        catch (e) { return res.status(400).json({ success: false, error: e.message }); }

        const accessible = await getAccessibleCampaignIds(req);
        const finalCampaigns = intersectCampaigns(campaigns, accessible);
        if (!finalCampaigns || finalCampaigns.length === 0) {
            return res.status(400).json({ success: false, error: 'No hay campañas accesibles para este reporte' });
        }

        const { sql, params } = buildSelectQuery(parsedColumns, filters, finalCampaigns, startDatetime, endDatetime, sort, limit);
        const { rows } = await pg.query(sql, params);
        res.json({
            success: true,
            data: rows,
            meta: {
                campaigns: finalCampaigns.length,
                records: rows.length,
                columns: parsedColumns.map(c => ({ id: c.id, label: c.label })),
                startDatetime,
                endDatetime,
            }
        });
    } catch (error) {
        console.error('[reports] Error running custom report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Ejecutar plantilla (combina definition + dates del request)
router.post('/templates/:id/run', requirePermission('view_reports'), async (req, res) => {
    try {
        const id = req.params.id;
        const tplRes = await pg.query('SELECT * FROM gescall_report_templates WHERE id = $1', [id]);
        if (tplRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });
        const tpl = tplRes.rows[0];

        if (!req.user?.is_system && !tpl.is_shared && tpl.owner_user_id !== req.user?.user_id) {
            return res.status(403).json({ success: false, error: 'No tiene acceso a esta plantilla' });
        }

        const def = tpl.definition || {};
        const { startDatetime, endDatetime, campaigns: overrideCampaigns, limit } = req.body || {};
        if (!startDatetime || !endDatetime) {
            return res.status(400).json({ success: false, error: 'startDatetime y endDatetime son requeridos' });
        }

        let parsedColumns;
        try { parsedColumns = validateColumns(def.columns); }
        catch (e) { return res.status(400).json({ success: false, error: e.message }); }

        // En single_campaign, exigir exactamente una campaña (override o de la definición)
        const definedCampaigns = Array.isArray(def.campaigns) ? def.campaigns : [];
        let requestedCampaigns;
        if (Array.isArray(overrideCampaigns) && overrideCampaigns.length > 0) {
            requestedCampaigns = overrideCampaigns;
        } else {
            requestedCampaigns = definedCampaigns;
        }
        if (tpl.scope === 'single_campaign' && requestedCampaigns.length !== 1) {
            return res.status(400).json({ success: false, error: 'Esta plantilla requiere exactamente una campaña' });
        }

        const accessible = await getAccessibleCampaignIds(req);
        const finalCampaigns = intersectCampaigns(requestedCampaigns, accessible);
        if (!finalCampaigns || finalCampaigns.length === 0) {
            return res.status(400).json({ success: false, error: 'No hay campañas accesibles para esta plantilla' });
        }

        const { sql, params } = buildSelectQuery(parsedColumns, def.filters || {}, finalCampaigns, startDatetime, endDatetime, def.sort, limit);
        const { rows } = await pg.query(sql, params);
        res.json({
            success: true,
            data: rows,
            meta: {
                template: { id: tpl.id, name: tpl.name, scope: tpl.scope },
                campaigns: finalCampaigns.length,
                records: rows.length,
                columns: parsedColumns.map(c => ({ id: c.id, label: c.label })),
                startDatetime,
                endDatetime,
            }
        });
    } catch (error) {
        console.error('[reports] Error running template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Reportes de sistema (agregaciones predefinidas)
// ─────────────────────────────────────────────────────────────────────────────

// Resumen por disposición / estado de llamada
router.post('/system/disposition-summary', requirePermission('view_reports'), async (req, res) => {
    try {
        const { campaigns = [], startDatetime, endDatetime } = req.body || {};
        if (!startDatetime || !endDatetime) {
            return res.status(400).json({ success: false, error: 'startDatetime y endDatetime son requeridos' });
        }
        const accessible = await getAccessibleCampaignIds(req);
        const finalCampaigns = intersectCampaigns(campaigns, accessible);
        if (!finalCampaigns || finalCampaigns.length === 0) {
            return res.status(400).json({ success: false, error: 'No hay campañas accesibles' });
        }

        const sql = `
            SELECT
                COALESCE(NULLIF(call_status, ''), 'UNKNOWN') AS status,
                COUNT(*) AS total_calls,
                SUM(COALESCE(call_duration, 0)) AS total_duration_sec,
                ROUND(AVG(COALESCE(call_duration, 0))::numeric, 2) AS avg_duration_sec
            FROM gescall_call_log
            WHERE campaign_id = ANY($1)
              AND call_date BETWEEN $2 AND $3
            GROUP BY COALESCE(NULLIF(call_status, ''), 'UNKNOWN')
            ORDER BY total_calls DESC
        `;
        const { rows } = await pg.query(sql, [finalCampaigns, startDatetime, endDatetime]);
        const totalCalls = rows.reduce((acc, r) => acc + Number(r.total_calls || 0), 0);
        const formatted = rows.map(r => ({
            status: r.status,
            total_calls: Number(r.total_calls) || 0,
            total_duration_sec: Number(r.total_duration_sec) || 0,
            avg_duration_sec: Number(r.avg_duration_sec) || 0,
            percentage: totalCalls > 0 ? Number(((Number(r.total_calls) / totalCalls) * 100).toFixed(2)) : 0,
        }));
        res.json({
            success: true,
            data: formatted,
            meta: { campaigns: finalCampaigns.length, total_calls: totalCalls, startDatetime, endDatetime },
        });
    } catch (error) {
        console.error('[reports] Error in disposition-summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Distribución temporal (por hora del día o por día)
router.post('/system/temporal-distribution', requirePermission('view_reports'), async (req, res) => {
    try {
        const { campaigns = [], startDatetime, endDatetime, granularity = 'hour' } = req.body || {};
        if (!startDatetime || !endDatetime) {
            return res.status(400).json({ success: false, error: 'startDatetime y endDatetime son requeridos' });
        }
        const accessible = await getAccessibleCampaignIds(req);
        const finalCampaigns = intersectCampaigns(campaigns, accessible);
        if (!finalCampaigns || finalCampaigns.length === 0) {
            return res.status(400).json({ success: false, error: 'No hay campañas accesibles' });
        }

        let bucketExpr;
        if (granularity === 'hour_of_day') {
            bucketExpr = `LPAD(EXTRACT(HOUR FROM call_date)::text, 2, '0')`;
        } else if (granularity === 'day') {
            bucketExpr = `to_char(call_date, 'YYYY-MM-DD')`;
        } else if (granularity === 'day_of_week') {
            bucketExpr = `to_char(call_date, 'ID')`; // 1=Mon..7=Sun
        } else {
            bucketExpr = `to_char(date_trunc('hour', call_date), 'YYYY-MM-DD HH24:00')`;
        }

        const sql = `
            SELECT
                ${bucketExpr} AS bucket,
                COUNT(*) AS total_calls,
                SUM(CASE WHEN call_status IN ('ANSWER','SALE') THEN 1 ELSE 0 END) AS answered,
                SUM(COALESCE(call_duration, 0)) AS total_duration_sec
            FROM gescall_call_log
            WHERE campaign_id = ANY($1)
              AND call_date BETWEEN $2 AND $3
            GROUP BY bucket
            ORDER BY bucket ASC
        `;
        const { rows } = await pg.query(sql, [finalCampaigns, startDatetime, endDatetime]);
        const formatted = rows.map(r => ({
            bucket: r.bucket,
            total_calls: Number(r.total_calls) || 0,
            answered: Number(r.answered) || 0,
            total_duration_sec: Number(r.total_duration_sec) || 0,
        }));
        res.json({
            success: true,
            data: formatted,
            meta: { campaigns: finalCampaigns.length, granularity, startDatetime, endDatetime },
        });
    } catch (error) {
        console.error('[reports] Error in temporal-distribution:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Tiempo total en pausa (workspace: NOT_READY / NOT_READY_*) por agente.
 * Incluye pausas abiertas (ended_at NULL) hasta endDatetime.
 * La duración siempre se recorta al rango solicitado (solape).
 */
router.post('/system/agent-pause-summary', requirePermission('view_reports'), async (req, res) => {
    try {
        const { campaigns = [], startDatetime, endDatetime } = req.body || {};
        if (!startDatetime || !endDatetime) {
            return res.status(400).json({ success: false, error: 'startDatetime y endDatetime son requeridos' });
        }
        const accessible = await getAccessibleCampaignIds(req);
        const finalCampaigns = intersectCampaigns(campaigns, accessible);
        if (!finalCampaigns || finalCampaigns.length === 0) {
            return res.status(400).json({ success: false, error: 'No hay campañas accesibles' });
        }

        const sql = `
            SELECT
                s.agent_username,
                s.pause_code,
                COUNT(*)::int AS pause_sessions,
                COALESCE(SUM(GREATEST(0,
                    FLOOR(EXTRACT(EPOCH FROM (
                        LEAST(COALESCE(s.ended_at, $3::timestamptz), $3::timestamptz) - GREATEST(s.started_at, $2::timestamptz)
                    ))::bigint)
                )), 0)::bigint AS total_pause_sec
            FROM gescall_agent_pause_segments s
            WHERE s.started_at < $3::timestamptz
              AND COALESCE(s.ended_at, $3::timestamptz) > $2::timestamptz
              AND (s.campaign_id IS NULL OR s.campaign_id = ANY($1))
            GROUP BY s.agent_username, s.pause_code
            ORDER BY s.agent_username ASC, total_pause_sec DESC
        `;
        const { rows } = await pg.query(sql, [finalCampaigns, startDatetime, endDatetime]);
        const formatted = rows.map((r) => ({
            agent_username: r.agent_username,
            pause_code: r.pause_code,
            pause_sessions: Number(r.pause_sessions) || 0,
            total_pause_sec: Number(r.total_pause_sec) || 0,
        }));
        res.json({
            success: true,
            data: formatted,
            meta: {
                campaigns: finalCampaigns.length,
                startDatetime,
                endDatetime,
                note: 'Incluye sesiones cerradas y pausas abiertas (hasta el fin del rango).',
            },
        });
    } catch (error) {
        console.error('[reports] Error in agent-pause-summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
