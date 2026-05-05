/**
 * Workspace del agente — Fase 2: avisos, callbacks agendados, metas (tipificaciones vs meta diaria), ranking
 */
const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');
const { canManageSupervisorAgentActions: canManageAgentWorkspace } = require('../lib/supervisorAgentPermissions');

function emitWorkspaceRefresh(req, payload = {}) {
    try {
        const io = req.app.get('io');
        if (io && typeof io.emit === 'function') {
            io.emit('agent:workspace:refresh', { ...payload, at: new Date().toISOString() });
        }
    } catch (_) {
        /* ignore */
    }
}

function chatRoomName(campaignId, agentUsername) {
    return `agent-workspace-chat:${campaignId}:${agentUsername}`;
}

function emitChatMessage(req, message) {
    try {
        const io = req.app.get('io');
        if (!io || typeof io.to !== 'function') return;
        io.to(chatRoomName(message.campaign_id, message.agent_username)).emit('agent:workspace:chat:message', message);
    } catch (_) {
        /* ignore */
    }
}

async function getCampaignScopeForUser(req) {
    if (req.user.is_system) {
        const { rows } = await pg.query(
            `SELECT campaign_id FROM gescall_campaigns WHERE active = true ORDER BY campaign_name`
        );
        return rows.map((r) => r.campaign_id);
    }
    const { rows } = await pg.query(
        `SELECT c.campaign_id
         FROM gescall_user_campaigns uc
         JOIN gescall_campaigns c ON c.campaign_id = uc.campaign_id
         WHERE uc.user_id = $1 AND c.active = true
         ORDER BY c.campaign_name`,
        [req.user.user_id]
    );
    return rows.map((r) => r.campaign_id);
}

async function getUserCampaignScopeSet(req) {
    const ids = await getCampaignScopeForUser(req);
    return new Set(ids.map((v) => String(v)));
}

async function canUserAccessCampaignForChat(req, campaignId, isSupervisor) {
    const cid = String(campaignId || '').trim();
    if (!cid) return false;

    // Supervisores con permiso: alcance por existencia de campaña (no requiere asignación directa)
    if (isSupervisor) {
        const { rows } = await pg.query(
            `SELECT 1 FROM gescall_campaigns WHERE campaign_id = $1 LIMIT 1`,
            [cid]
        );
        return rows.length > 0;
    }

    // Agentes/usuarios normales: debe estar asignada la campaña
    if (req.user.is_system) return true;
    const { rows } = await pg.query(
        `SELECT 1
         FROM gescall_user_campaigns uc
         WHERE uc.user_id = $1 AND uc.campaign_id = $2
         LIMIT 1`,
        [req.user.user_id, cid]
    );
    return rows.length > 0;
}

const GOAL_PALETTE = [
    { color: 'amber', icon: 'trophy' },
    { color: 'emerald', icon: 'target' },
    { color: 'blue', icon: 'star' },
    { color: 'purple', icon: 'trophy' },
];

/**
 * GET /api/agent-workspace/dashboard
 */
router.get('/dashboard', async (req, res) => {
    try {
        const userId = req.user.user_id;
        const username = req.user.username;
        const campaigns = await getCampaignScopeForUser(req);
        const campFilter = campaigns.length > 0 ? campaigns : [];

        const { rows: noticeRows } = await pg.query(
            `SELECT n.id, n.body, n.campaign_id, n.created_at
             FROM gescall_supervisor_notices n
             WHERE n.active = true
               AND n.starts_at <= NOW()
               AND (n.ends_at IS NULL OR n.ends_at >= NOW())
               AND (
                 n.campaign_id IS NULL
                 OR n.campaign_id = ANY($1::varchar[])
               )
               AND NOT EXISTS (
                 SELECT 1 FROM gescall_supervisor_notice_dismissals d
                 WHERE d.notice_id = n.id AND d.user_id = $2
               )
             ORDER BY n.created_at DESC
             LIMIT 20`,
            [campFilter, userId]
        );

        const { rows: cbRows } = await pg.query(
            `SELECT id, contact_name, phone, scheduled_at, notes, campaign_id, status
             FROM gescall_agent_callbacks
             WHERE assignee_user_id = $1 AND status = 'PENDING'
             ORDER BY scheduled_at ASC
             LIMIT 50`,
            [userId]
        );

        let goalRows = [];
        if (campaigns.length > 0) {
            const { rows: g } = await pg.query(
                `SELECT c.campaign_id,
                        c.campaign_name,
                        COALESCE(c.workspace_daily_target, 20) AS workspace_daily_target,
                        COALESCE(t.cnt, 0)::int AS current_count
                 FROM gescall_campaigns c
                 LEFT JOIN (
                     SELECT campaign_id, COUNT(*)::int AS cnt
                     FROM gescall_typification_results
                     WHERE agent_username = $1
                       AND created_at >= CURRENT_DATE
                       AND campaign_id = ANY($2::varchar[])
                     GROUP BY campaign_id
                 ) t ON t.campaign_id = c.campaign_id
                 WHERE c.active = true AND c.campaign_id = ANY($2::varchar[])
                 ORDER BY c.campaign_name`,
                [username, campaigns]
            );
            goalRows = g;
        }

        const goals = goalRows.map((row, idx) => {
            const pal = GOAL_PALETTE[idx % GOAL_PALETTE.length];
            const target = Math.max(1, parseInt(row.workspace_daily_target, 10) || 20);
            const current = Math.max(0, parseInt(row.current_count, 10) || 0);
            return {
                id: row.campaign_id,
                campaignName: row.campaign_name || row.campaign_id,
                target,
                current,
                color: pal.color,
                icon: pal.icon,
            };
        });

        let leaderboard = [];
        if (campaigns.length > 0) {
            const { rows: lb } = await pg.query(
                `SELECT tr.agent_username AS username, COUNT(*)::int AS score
                 FROM gescall_typification_results tr
                 WHERE tr.created_at >= CURRENT_DATE
                   AND tr.campaign_id = ANY($1::varchar[])
                   AND tr.agent_username IS NOT NULL
                   AND TRIM(tr.agent_username) <> ''
                 GROUP BY tr.agent_username
                 ORDER BY score DESC
                 LIMIT 10`,
                [campaigns]
            );
            leaderboard = lb.map((r, i) => ({
                rank: i + 1,
                username: r.username,
                score: r.score,
                is_self: r.username === username,
            }));
        }

        res.json({
            success: true,
            data: {
                notices: noticeRows,
                callbacks: cbRows,
                goals,
                leaderboard,
            },
        });
    } catch (e) {
        console.error('[agent-workspace] dashboard:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/agent-workspace/verify-pause-pin
 * body: { pin: string }
 */
router.post('/verify-pause-pin', async (req, res) => {
    try {
        const pin = req.body && req.body.pin ? String(req.body.pin).trim() : '';
        if (!pin) return res.status(400).json({ success: false, error: 'PIN requerido' });

        const { rows } = await pg.query(
            `SELECT sip_password
             FROM gescall_users
             WHERE user_id = $1
             LIMIT 1`,
            [req.user.user_id]
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        const expectedPin = rows[0] && rows[0].sip_password ? String(rows[0].sip_password).trim() : '';
        if (!expectedPin) {
            return res.status(400).json({ success: false, error: 'Tu usuario no tiene PIN configurado' });
        }

        if (pin !== expectedPin) {
            return res.status(401).json({ success: false, error: 'PIN inválido' });
        }

        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/agent-workspace/lead/:lead_id
 * Lead de la BD solo si pertenece a una campaña asignada al usuario autenticado.
 */
router.get('/lead/:lead_id', async (req, res) => {
    try {
        const leadId = parseInt(req.params.lead_id, 10);
        if (!Number.isFinite(leadId) || leadId <= 0) {
            return res.status(400).json({ success: false, error: 'lead_id inválido' });
        }
        const campaigns = await getCampaignScopeForUser(req);
        if (!campaigns.length) {
            return res.status(403).json({ success: false, error: 'Sin campañas asignadas' });
        }
        const { rows } = await pg.query(
            `SELECT l.*, ls.list_name, ls.campaign_id
             FROM gescall_leads l
             JOIN gescall_lists ls ON l.list_id = ls.list_id
             WHERE l.lead_id = $1 AND ls.campaign_id = ANY($2::varchar[])`,
            [leadId, campaigns]
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, error: 'Lead no encontrado o sin acceso' });
        }
        return res.json({ success: true, data: rows[0] });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/agent-workspace/notices/:id/dismiss
 */
router.post('/notices/:id/dismiss', async (req, res) => {
    try {
        const noticeId = parseInt(req.params.id, 10);
        if (!noticeId) return res.status(400).json({ success: false, error: 'invalid notice id' });
        await pg.query(
            `INSERT INTO gescall_supervisor_notice_dismissals (notice_id, user_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [noticeId, req.user.user_id]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * PATCH /api/agent-workspace/callbacks/:id/complete
 */
router.patch('/callbacks/:id/complete', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ success: false, error: 'invalid id' });
        const { rows } = await pg.query(
            `UPDATE gescall_agent_callbacks
             SET status = 'DONE', updated_at = NOW()
             WHERE id = $1 AND assignee_user_id = $2 AND status = 'PENDING'
             RETURNING id`,
            [id, req.user.user_id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Callback no encontrado o ya cerrado' });
        }
        emitWorkspaceRefresh(req, { type: 'callback_completed' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/agent-workspace/supervisor/notices — listado supervisores
 */
router.get('/supervisor/notices', async (req, res) => {
    try {
        if (!(await canManageAgentWorkspace(req))) {
            return res.status(403).json({ success: false, error: 'Sin permiso para gestionar el workspace de agentes' });
        }
        const { rows } = await pg.query(
            `SELECT n.id, n.body, n.campaign_id, n.starts_at, n.ends_at, n.active, n.created_at,
                    u.username AS created_by_username,
                    c.campaign_name
             FROM gescall_supervisor_notices n
             LEFT JOIN gescall_users u ON u.user_id = n.created_by_user_id
             LEFT JOIN gescall_campaigns c ON c.campaign_id = n.campaign_id
             ORDER BY n.created_at DESC
             LIMIT 150`
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * PATCH /api/agent-workspace/supervisor/notices/:id/deactivate
 */
router.patch('/supervisor/notices/:id/deactivate', async (req, res) => {
    try {
        if (!(await canManageAgentWorkspace(req))) {
            return res.status(403).json({ success: false, error: 'Sin permiso para gestionar el workspace de agentes' });
        }
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ success: false, error: 'invalid id' });
        const { rowCount } = await pg.query(
            `UPDATE gescall_supervisor_notices SET active = false WHERE id = $1`,
            [id]
        );
        if (rowCount === 0) return res.status(404).json({ success: false, error: 'No encontrado' });
        emitWorkspaceRefresh(req, { type: 'notice_deactivated' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/agent-workspace/supervisor/callbacks
 * query: status=PENDING | DONE | CANCELLED | ALL
 */
router.get('/supervisor/callbacks', async (req, res) => {
    try {
        if (!(await canManageAgentWorkspace(req))) {
            return res.status(403).json({ success: false, error: 'Sin permiso para gestionar el workspace de agentes' });
        }
        const st = (req.query.status && String(req.query.status).toUpperCase()) || 'ALL';
        let where = '';
        const params = [];
        if (['PENDING', 'DONE', 'CANCELLED'].includes(st)) {
            where = 'WHERE cb.status = $1';
            params.push(st);
        }
        const { rows } = await pg.query(
            `SELECT cb.*,
                    ua.username AS assignee_username,
                    uc.username AS created_by_username,
                    c.campaign_name
             FROM gescall_agent_callbacks cb
             LEFT JOIN gescall_users ua ON ua.user_id = cb.assignee_user_id
             LEFT JOIN gescall_users uc ON uc.user_id = cb.created_by_user_id
             LEFT JOIN gescall_campaigns c ON c.campaign_id = cb.campaign_id
             ${where}
             ORDER BY cb.scheduled_at DESC
             LIMIT 200`,
            params
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * PATCH /api/agent-workspace/supervisor/callbacks/:id/cancel
 */
router.patch('/supervisor/callbacks/:id/cancel', async (req, res) => {
    try {
        if (!(await canManageAgentWorkspace(req))) {
            return res.status(403).json({ success: false, error: 'Sin permiso para gestionar el workspace de agentes' });
        }
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ success: false, error: 'invalid id' });
        const { rows } = await pg.query(
            `UPDATE gescall_agent_callbacks SET status = 'CANCELLED', updated_at = NOW()
             WHERE id = $1 AND status = 'PENDING'
             RETURNING id`,
            [id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'No encontrado o ya cerrado' });
        emitWorkspaceRefresh(req, { type: 'callback_cancelled' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/agent-workspace/supervisor/notices
 * body: { body, campaign_id?, starts_at?, ends_at? }
 */
router.post('/supervisor/notices', async (req, res) => {
    try {
        if (!(await canManageAgentWorkspace(req))) {
            return res.status(403).json({ success: false, error: 'Sin permiso para gestionar el workspace de agentes' });
        }
        const { body, campaign_id, starts_at, ends_at } = req.body;
        if (!body || typeof body !== 'string' || !body.trim()) {
            return res.status(400).json({ success: false, error: 'body es requerido' });
        }
        const { rows } = await pg.query(
            `INSERT INTO gescall_supervisor_notices
             (body, campaign_id, starts_at, ends_at, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                body.trim(),
                campaign_id || null,
                starts_at || new Date().toISOString(),
                ends_at || null,
                req.user.user_id,
            ]
        );
        emitWorkspaceRefresh(req, { type: 'notice_created' });
        res.json({ success: true, data: rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/agent-workspace/supervisor/callbacks
 * body: { assignee_user_id, contact_name, scheduled_at, notes?, campaign_id?, phone? }
 */
router.post('/supervisor/callbacks', async (req, res) => {
    try {
        if (!(await canManageAgentWorkspace(req))) {
            return res.status(403).json({ success: false, error: 'Sin permiso para gestionar el workspace de agentes' });
        }
        const {
            assignee_user_id,
            contact_name,
            scheduled_at,
            notes,
            campaign_id,
            phone,
        } = req.body;
        const aid = parseInt(assignee_user_id, 10);
        if (!aid) return res.status(400).json({ success: false, error: 'assignee_user_id requerido' });
        if (!contact_name || !String(contact_name).trim()) {
            return res.status(400).json({ success: false, error: 'contact_name requerido' });
        }
        if (!scheduled_at) return res.status(400).json({ success: false, error: 'scheduled_at requerido' });
        const { rows } = await pg.query(
            `INSERT INTO gescall_agent_callbacks
             (assignee_user_id, campaign_id, contact_name, phone, scheduled_at, notes, status, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)
             RETURNING *`,
            [
                aid,
                campaign_id || null,
                String(contact_name).trim(),
                phone || null,
                scheduled_at,
                notes || null,
                req.user.user_id,
            ]
        );
        emitWorkspaceRefresh(req, { type: 'callback_created' });
        res.json({ success: true, data: rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/agent-workspace/chat/messages
 * - Agente: query opcional campaign_id
 * - Supervisor: query requeridos campaign_id y agent_username
 */
router.get('/chat/messages', async (req, res) => {
    try {
        const campaignId = req.query.campaign_id ? String(req.query.campaign_id) : '';
        const agentUsernameParam = req.query.agent_username ? String(req.query.agent_username).trim() : '';
        const isSupervisor = await canManageAgentWorkspace(req);

        if (isSupervisor) {
            if (!campaignId || !agentUsernameParam) {
                return res.status(400).json({ success: false, error: 'campaign_id y agent_username son requeridos' });
            }
            if (!(await canUserAccessCampaignForChat(req, campaignId, true))) {
                return res.status(403).json({ success: false, error: 'Sin acceso a esa campaña' });
            }
            const { rows } = await pg.query(
                `SELECT id, campaign_id, agent_username, sender_user_id, sender_username, sender_role, body, created_at
                 FROM gescall_agent_supervisor_chat_messages
                 WHERE campaign_id = $1 AND agent_username = $2
                 ORDER BY created_at DESC
                 LIMIT 120`,
                [campaignId, agentUsernameParam]
            );
            return res.json({ success: true, data: rows.reverse() });
        }

        const username = req.user.username;
        let effectiveCampaignId = campaignId;
        if (!effectiveCampaignId) {
            const { rows: firstAssigned } = await pg.query(
                `SELECT campaign_id
                 FROM gescall_user_campaigns
                 WHERE user_id = $1
                 ORDER BY campaign_id ASC
                 LIMIT 1`,
                [req.user.user_id]
            );
            effectiveCampaignId = firstAssigned[0]?.campaign_id || '';
        }
        if (!effectiveCampaignId) {
            return res.json({ success: true, data: [] });
        }
        if (!(await canUserAccessCampaignForChat(req, effectiveCampaignId, false))) {
            return res.status(403).json({ success: false, error: 'Sin acceso a esa campaña' });
        }

        const { rows } = await pg.query(
            `SELECT id, campaign_id, agent_username, sender_user_id, sender_username, sender_role, body, created_at
             FROM gescall_agent_supervisor_chat_messages
             WHERE campaign_id = $1 AND agent_username = $2
             ORDER BY created_at DESC
             LIMIT 120`,
            [effectiveCampaignId, username]
        );
        return res.json({ success: true, data: rows.reverse() });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/agent-workspace/chat/messages
 * body:
 * - Agente: { body, campaign_id? }
 * - Supervisor: { body, campaign_id, agent_username }
 */
router.post('/chat/messages', async (req, res) => {
    try {
        const body = req.body && typeof req.body.body === 'string' ? req.body.body.trim() : '';
        if (!body) return res.status(400).json({ success: false, error: 'body es requerido' });
        if (body.length > 2000) return res.status(400).json({ success: false, error: 'body excede 2000 caracteres' });

        const campaignIdRaw = req.body && req.body.campaign_id ? String(req.body.campaign_id) : '';
        const isSupervisor = await canManageAgentWorkspace(req);

        let campaignId = campaignIdRaw;
        let agentUsername = '';
        let senderRole = 'AGENT';

        if (isSupervisor) {
            agentUsername = req.body && req.body.agent_username ? String(req.body.agent_username).trim() : '';
            if (!campaignId || !agentUsername) {
                return res.status(400).json({ success: false, error: 'campaign_id y agent_username son requeridos' });
            }
            if (!(await canUserAccessCampaignForChat(req, campaignId, true))) {
                return res.status(403).json({ success: false, error: 'Sin acceso a esa campaña' });
            }
            senderRole = 'SUPERVISOR';
        } else {
            agentUsername = String(req.user.username || '').trim();
            if (!campaignId) {
                const { rows: firstAssigned } = await pg.query(
                    `SELECT campaign_id
                     FROM gescall_user_campaigns
                     WHERE user_id = $1
                     ORDER BY campaign_id ASC
                     LIMIT 1`,
                    [req.user.user_id]
                );
                campaignId = firstAssigned[0]?.campaign_id || '';
            }
            if (!campaignId) {
                return res.status(400).json({ success: false, error: 'No se pudo resolver campaign_id para el agente' });
            }
            if (!(await canUserAccessCampaignForChat(req, campaignId, false))) {
                return res.status(403).json({ success: false, error: 'Sin acceso a esa campaña' });
            }
        }

        const { rows } = await pg.query(
            `INSERT INTO gescall_agent_supervisor_chat_messages
             (campaign_id, agent_username, sender_user_id, sender_username, sender_role, body)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, campaign_id, agent_username, sender_user_id, sender_username, sender_role, body, created_at`,
            [
                campaignId,
                agentUsername,
                req.user.user_id || null,
                String(req.user.username || 'unknown'),
                senderRole,
                body,
            ]
        );
        const message = rows[0];
        emitChatMessage(req, message);
        return res.json({ success: true, data: message });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
