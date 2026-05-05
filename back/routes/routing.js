const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');
const redis = require('../config/redisClient');
const routingCache = require('../services/routingCache');
const { resolveInboundDid, DESTINATION_TYPES } = require('../services/routingResolveService');

function invalidate() {
    routingCache.publishReload(redis).catch(() => {});
}

const INBOUND_DEST_TYPES = [DESTINATION_TYPES.CAMPAIGN_QUEUE, DESTINATION_TYPES.IVR_THEN_QUEUE];
const OUTBOUND_DEST_TYPES = [DESTINATION_TYPES.OVERRIDE_TRUNK];

const ALLOWED_DID_KINDS = ['EXACT', 'PREFIX', 'REGEX'];

function validateInboundBody(body) {
    const err = (msg) => ({ error: msg });
    if (!body.match_did || !String(body.match_did).trim()) {
        return err('match_did es obligatorio para rutas entrantes');
    }
    const kind = (body.match_did_kind || 'EXACT').toUpperCase();
    if (!ALLOWED_DID_KINDS.includes(kind)) {
        return err('match_did_kind debe ser EXACT, PREFIX o REGEX');
    }
    if (kind === 'REGEX') {
        try {
            new RegExp(body.match_did);
        } catch (e) {
            return err(`Regex inválido: ${e.message}`);
        }
    }
    if (body.match_campaign_id) {
        return err('match_campaign_id no aplica a rutas entrantes');
    }
    if (!INBOUND_DEST_TYPES.includes(body.destination_type)) {
        return err(`destination_type debe ser ${INBOUND_DEST_TYPES.join(' o ')}`);
    }
    if (!body.destination_campaign_id || !String(body.destination_campaign_id).trim()) {
        return err('destination_campaign_id es obligatorio');
    }
    return null;
}

function validateOutboundBody(body) {
    const err = (msg) => ({ error: msg });
    if (!body.match_campaign_id || !String(body.match_campaign_id).trim()) {
        return err('match_campaign_id es obligatorio para rutas salientes');
    }
    if (body.match_did) {
        return err('match_did no aplica a rutas salientes');
    }
    if (!OUTBOUND_DEST_TYPES.includes(body.destination_type)) {
        return err(`destination_type debe ser ${OUTBOUND_DEST_TYPES.join(' o ')}`);
    }
    if (!body.trunk_id) {
        return err('trunk_id es obligatorio para rutas salientes');
    }
    return null;
}

// Helper: ejecuta una query envolviéndola en una transacción que setea
// la variable de sesión `gescall.current_user` para que el trigger de auditoría
// la registre como el actor.
async function withActor(req, fn) {
    const username = req.user?.username || 'system';
    const client = await pg.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('gescall.current_user', $1, true)`, [username]);
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// GET /api/routing/rules?direction=INBOUND|OUTBOUND
router.get('/rules', async (req, res) => {
    try {
        const { direction } = req.query;
        const params = [];
        let where = '';
        if (direction === 'INBOUND' || direction === 'OUTBOUND') {
            where = 'WHERE r.direction = $1';
            params.push(direction);
        }
        const { rows } = await pg.query(
            `SELECT r.*, t.trunk_name,
                    dc.campaign_name AS destination_campaign_name,
                    mc.campaign_name AS match_campaign_name
             FROM gescall_route_rules r
             LEFT JOIN gescall_trunks t ON r.trunk_id = t.trunk_id
             LEFT JOIN gescall_campaigns dc ON r.destination_campaign_id = dc.campaign_id
             LEFT JOIN gescall_campaigns mc ON r.match_campaign_id = mc.campaign_id
             ${where}
             ORDER BY r.direction ASC, r.priority ASC, r.id ASC`,
            params
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        console.error('[routing] GET /rules', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/routing/rules/:id/audit?limit=50
router.get('/rules/:id/audit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ success: false, error: 'id inválido' });
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const { rows } = await pg.query(
            `SELECT audit_id, rule_id, action, changed_by, changed_at, old_data, new_data
             FROM gescall_route_rules_audit
             WHERE rule_id = $1
             ORDER BY changed_at DESC
             LIMIT $2`,
            [id, limit]
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        console.error('[routing] GET /rules/:id/audit', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// PUT /api/routing/rules/:id/move?direction=up|down
router.put('/rules/:id/move', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const dir = req.query.direction === 'down' ? 'down' : 'up';
        if (!id) return res.status(400).json({ success: false, error: 'id inválido' });

        await withActor(req, async (client) => {
            const cur = await client.query(
                `SELECT id, direction, priority FROM gescall_route_rules WHERE id = $1 FOR UPDATE`,
                [id]
            );
            if (cur.rows.length === 0) {
                throw Object.assign(new Error('Regla no encontrada'), { status: 404 });
            }
            const me = cur.rows[0];

            const neighborSql = dir === 'up'
                ? `SELECT id, priority FROM gescall_route_rules
                   WHERE direction = $1 AND priority <= $2 AND id <> $3
                   ORDER BY priority DESC, id DESC LIMIT 1 FOR UPDATE`
                : `SELECT id, priority FROM gescall_route_rules
                   WHERE direction = $1 AND priority >= $2 AND id <> $3
                   ORDER BY priority ASC, id ASC LIMIT 1 FOR UPDATE`;
            const nb = await client.query(neighborSql, [me.direction, me.priority, me.id]);
            if (nb.rows.length === 0) return;

            const neighbor = nb.rows[0];
            if (neighbor.priority === me.priority) {
                const newPriority = dir === 'up' ? me.priority - 1 : me.priority + 1;
                await client.query(
                    `UPDATE gescall_route_rules SET priority = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
                    [Math.max(0, newPriority), req.user?.username || 'system', me.id]
                );
            } else {
                await client.query(
                    `UPDATE gescall_route_rules SET priority = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
                    [neighbor.priority, req.user?.username || 'system', me.id]
                );
                await client.query(
                    `UPDATE gescall_route_rules SET priority = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
                    [me.priority, req.user?.username || 'system', neighbor.id]
                );
            }
        });

        invalidate();
        res.json({ success: true });
    } catch (e) {
        if (e?.status === 404) return res.status(404).json({ success: false, error: e.message });
        console.error('[routing] PUT /rules/:id/move', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/routing/effective-outbound/:campaignId — troncal que usará el dialer
router.get('/effective-outbound/:campaignId', async (req, res) => {
    try {
        const campaignId = String(req.params.campaignId || '').trim();
        if (!campaignId) {
            return res.status(400).json({ success: false, error: 'campaignId requerido' });
        }

        const campRes = await pg.query(
            `SELECT campaign_id FROM gescall_campaigns WHERE campaign_id = $1 LIMIT 1`,
            [campaignId]
        );
        if (campRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
        }

        const ruleRes = await pg.query(
            `SELECT r.id, r.destination_type, r.trunk_id, t.trunk_name
             FROM gescall_route_rules r
             LEFT JOIN gescall_trunks t ON r.trunk_id = t.trunk_id
             WHERE r.direction = 'OUTBOUND' AND r.active = true AND r.match_campaign_id = $1
             ORDER BY r.priority ASC, r.id ASC
             LIMIT 1`,
            [campaignId]
        );

        const rule = ruleRes.rows[0];
        const effectiveTrunkId = rule?.trunk_id || null;

        res.json({
            success: true,
            data: {
                campaign_id: campaignId,
                effective_trunk_id: effectiveTrunkId,
                effective_trunk_name: rule?.trunk_name || effectiveTrunkId,
                source: rule ? 'routing_rule' : 'none',
                rule_id: rule?.id ?? null,
                rule_destination_type: rule?.destination_type ?? null,
            },
        });
    } catch (e) {
        console.error('[routing] GET /effective-outbound/:campaignId', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/routing/rules/preview  { did_number, trunk_id? }
router.post('/rules/preview', async (req, res) => {
    try {
        const { did_number, trunk_id } = req.body || {};
        const row = await resolveInboundDid(did_number, trunk_id || null);
        res.json({ success: true, data: row });
    } catch (e) {
        console.error('[routing] POST /rules/preview', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/routing/rules/check-collision { direction, match_did?, trunk_id?,
//   match_campaign_id?, exclude_id? }
//  Devuelve las reglas activas existentes que entrarían en conflicto con la nueva.
router.post('/rules/check-collision', async (req, res) => {
    try {
        const b = req.body || {};
        const direction = b.direction === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND';
        const excludeId = Number.isFinite(Number(b.exclude_id)) ? Number(b.exclude_id) : 0;

        let sql;
        let params;
        if (direction === 'INBOUND') {
            const did = String(b.match_did || '').trim();
            if (!did) return res.json({ success: true, data: [] });
            const trunk = b.trunk_id ? String(b.trunk_id).trim() : null;
            sql = `
                SELECT r.id, r.priority, r.trunk_id, r.match_did,
                       r.destination_type, r.destination_campaign_id,
                       t.trunk_name,
                       dc.campaign_name AS destination_campaign_name
                FROM gescall_route_rules r
                LEFT JOIN gescall_trunks t ON r.trunk_id = t.trunk_id
                LEFT JOIN gescall_campaigns dc ON r.destination_campaign_id = dc.campaign_id
                WHERE r.direction = 'INBOUND'
                  AND r.active = true
                  AND r.match_did = $1
                  AND r.id <> $2
                  AND (
                    r.trunk_id IS NULL
                    OR $3::varchar IS NULL
                    OR r.trunk_id = $3::varchar
                  )
                ORDER BY r.priority ASC, r.id ASC
            `;
            params = [did, excludeId, trunk];
        } else {
            const campaignId = String(b.match_campaign_id || '').trim();
            if (!campaignId) return res.json({ success: true, data: [] });
            sql = `
                SELECT r.id, r.priority, r.trunk_id, r.match_campaign_id,
                       r.destination_type,
                       t.trunk_name,
                       mc.campaign_name AS match_campaign_name
                FROM gescall_route_rules r
                LEFT JOIN gescall_trunks t ON r.trunk_id = t.trunk_id
                LEFT JOIN gescall_campaigns mc ON r.match_campaign_id = mc.campaign_id
                WHERE r.direction = 'OUTBOUND'
                  AND r.active = true
                  AND r.match_campaign_id = $1
                  AND r.id <> $2
                ORDER BY r.priority ASC, r.id ASC
            `;
            params = [campaignId, excludeId];
        }

        const { rows } = await pg.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (e) {
        console.error('[routing] POST /rules/check-collision', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/routing/cache/stats — para observabilidad
router.get('/cache/stats', (_req, res) => {
    res.json({ success: true, data: routingCache.stats() });
});

// POST /api/routing/rules
router.post('/rules', async (req, res) => {
    try {
        const body = req.body || {};
        const direction = body.direction === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND';

        const v = direction === 'INBOUND' ? validateInboundBody(body) : validateOutboundBody(body);
        if (v) return res.status(400).json({ success: false, error: v.error });

        const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 100;
        const active = body.active !== false;
        const trunkId = body.trunk_id ? String(body.trunk_id).trim() : null;

        const matchDidKind = direction === 'INBOUND'
            ? (body.match_did_kind || 'EXACT').toUpperCase()
            : 'EXACT';
        const username = req.user?.username || 'system';

        const result = await withActor(req, async (client) => {
            return client.query(
                `INSERT INTO gescall_route_rules (
                    direction, priority, active, trunk_id, match_did, match_did_kind, match_campaign_id,
                    destination_type, destination_campaign_id, destination_external_number, description,
                    created_by, updated_by
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
                RETURNING *`,
                [
                    direction,
                    priority,
                    active,
                    trunkId,
                    direction === 'INBOUND' ? String(body.match_did).trim() : null,
                    matchDidKind,
                    direction === 'OUTBOUND' ? String(body.match_campaign_id).trim() : null,
                    body.destination_type,
                    body.destination_campaign_id ? String(body.destination_campaign_id).trim() : null,
                    body.destination_external_number ? String(body.destination_external_number).trim() : null,
                    body.description ? String(body.description) : null,
                    username,
                ]
            );
        });
        invalidate();
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (e) {
        console.error('[routing] POST /rules', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// PUT /api/routing/rules/:id
router.put('/rules/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ success: false, error: 'id inválido' });

        const existing = await pg.query('SELECT * FROM gescall_route_rules WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Regla no encontrada' });
        }
        const cur = existing.rows[0];
        const body = req.body || {};

        const direction = body.direction === 'OUTBOUND' ? 'OUTBOUND' : cur.direction;
        const merged = {
            direction,
            priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : cur.priority,
            active: body.active !== undefined ? !!body.active : cur.active,
            trunk_id: body.trunk_id !== undefined ? (body.trunk_id ? String(body.trunk_id).trim() : null) : cur.trunk_id,
            match_did: body.match_did !== undefined ? (body.match_did ? String(body.match_did).trim() : null) : cur.match_did,
            match_did_kind: body.match_did_kind !== undefined
                ? (body.match_did_kind || 'EXACT').toUpperCase()
                : (cur.match_did_kind || 'EXACT'),
            match_campaign_id:
                body.match_campaign_id !== undefined
                    ? body.match_campaign_id
                        ? String(body.match_campaign_id).trim()
                        : null
                    : cur.match_campaign_id,
            destination_type: body.destination_type || cur.destination_type,
            destination_campaign_id:
                body.destination_campaign_id !== undefined
                    ? body.destination_campaign_id
                        ? String(body.destination_campaign_id).trim()
                        : null
                    : cur.destination_campaign_id,
            destination_external_number:
                body.destination_external_number !== undefined
                    ? body.destination_external_number
                        ? String(body.destination_external_number).trim()
                        : null
                    : cur.destination_external_number,
            description: body.description !== undefined ? body.description : cur.description,
        };

        const v = direction === 'INBOUND' ? validateInboundBody(merged) : validateOutboundBody(merged);
        if (v) return res.status(400).json({ success: false, error: v.error });

        const username = req.user?.username || 'system';
        const result = await withActor(req, async (client) => {
            return client.query(
                `UPDATE gescall_route_rules SET
                    direction = $1, priority = $2, active = $3, trunk_id = $4,
                    match_did = $5, match_did_kind = $6, match_campaign_id = $7,
                    destination_type = $8, destination_campaign_id = $9,
                    destination_external_number = $10, description = $11,
                    updated_by = $12,
                    updated_at = NOW()
                 WHERE id = $13
                 RETURNING *`,
                [
                    merged.direction,
                    merged.priority,
                    merged.active,
                    merged.trunk_id,
                    direction === 'INBOUND' ? merged.match_did : null,
                    direction === 'INBOUND' ? merged.match_did_kind : 'EXACT',
                    direction === 'OUTBOUND' ? merged.match_campaign_id : null,
                    merged.destination_type,
                    merged.destination_campaign_id,
                    merged.destination_external_number,
                    merged.description,
                    username,
                    id,
                ]
            );
        });
        invalidate();
        res.json({ success: true, data: result.rows[0] });
    } catch (e) {
        console.error('[routing] PUT /rules/:id', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /api/routing/rules/:id
router.delete('/rules/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ success: false, error: 'id inválido' });

        const result = await withActor(req, async (client) => {
            return client.query('DELETE FROM gescall_route_rules WHERE id = $1 RETURNING id', [id]);
        });
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Regla no encontrada' });
        }
        invalidate();
        res.json({ success: true, message: 'Eliminada' });
    } catch (e) {
        console.error('[routing] DELETE /rules/:id', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
