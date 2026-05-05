/**
 * Acciones de supervisor sobre agentes (OpenSpec supervisor-agent-actions, bloque 1–2).
 *
 * Rutas (todas POST, JWT requerido vía middleware global):
 *   POST /api/supervisor/agents/:username/spy
 *   POST /api/supervisor/agents/:username/whisper
 *   POST /api/supervisor/agents/:username/force-ready
 *   POST /api/supervisor/agents/:username/remote-logout
 *   POST /api/supervisor/agents/:username/logout (compatibilidad legacy)
 *
 * Nota operativa/compliance:
 * - Las acciones de spy/whisper pueden estar sujetas a normativa local de privacidad/grabación.
 * - Se recomienda habilitarlas solo para roles auditables y con consentimiento/política definida.
 * - Flag opcional: SUPERVISOR_ACTIONS_ENABLED=false para desactivar estas rutas en despliegue.
 */
const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');
const redis = require('../config/redisClient');
const { canManageSupervisorAgentActions } = require('../lib/supervisorAgentPermissions');
const {
    assertForceReadyAllowed,
    assertRemoteLogoutAllowed,
    assertOnCallForSupervision,
    REMOTE_LOGOUT_ON_CALL_POLICY,
} = require('../config/agentSupervisorActionsPolicy');
const {
    createSupervisorSnoop,
    applyForceReady,
    applyRemoteLogout,
} = require('../services/supervisorCallService');

const SUPERVISOR_ACTIONS_ENABLED = String(process.env.SUPERVISOR_ACTIONS_ENABLED || 'true').toLowerCase() !== 'false';

function actorFromReq(req) {
    return (req.user && req.user.username) ? String(req.user.username) : 'unknown';
}

function logSupervisorAction({ req, action, targetAgent, result, code, error }) {
    console.log('[SUPERVISOR_ACTION]', {
        actor: actorFromReq(req),
        action,
        targetAgent,
        result,
        code: code || null,
        error: error || null,
        timestamp: new Date().toISOString(),
    });
}

async function resolveTargetUsername(param) {
    const raw = param && decodeURIComponent(String(param));
    const { rows } = await pg.query(
        `SELECT user_id, username, active FROM gescall_users
         WHERE username = $1 OR user_id::text = $1
         LIMIT 1`,
        [raw]
    );
    if (rows.length === 0) return null;
    return rows[0];
}

async function getRedisAgentState(username) {
    try {
        const stateMap = await redis.hGetAll(`gescall:agent:${username}`);
        const state = stateMap && stateMap.state ? String(stateMap.state) : 'OFFLINE';
        return { state, stateMap };
    } catch (_) {
        return { state: 'OFFLINE', stateMap: {} };
    }
}

async function requireSupervisorAndTarget(req, res, action) {
    if (!SUPERVISOR_ACTIONS_ENABLED) {
        logSupervisorAction({
            req,
            action,
            targetAgent: req.params.username,
            result: 'disabled',
            code: 'SUPERVISOR_ACTIONS_DISABLED',
            error: 'Supervisor actions are disabled by environment flag',
        });
        res.status(404).json({
            success: false,
            error: 'Acciones de supervisor deshabilitadas por configuración',
            code: 'SUPERVISOR_ACTIONS_DISABLED',
        });
        return null;
    }
    if (!(await canManageSupervisorAgentActions(req))) {
        logSupervisorAction({
            req,
            action,
            targetAgent: req.params.username,
            result: 'forbidden',
            code: 'SUPERVISOR_FORBIDDEN',
            error: 'Sin permiso de supervisor para acciones sobre agentes',
        });
        res.status(403).json({
            success: false,
            error: 'Sin permiso de supervisor para acciones sobre agentes',
            code: 'SUPERVISOR_FORBIDDEN',
        });
        return null;
    }
    const user = await resolveTargetUsername(req.params.username);
    if (!user) {
        logSupervisorAction({
            req,
            action,
            targetAgent: req.params.username,
            result: 'not_found',
            code: 'AGENT_NOT_FOUND',
            error: 'Agente no encontrado',
        });
        res.status(404).json({ success: false, error: 'Agente no encontrado', code: 'AGENT_NOT_FOUND' });
        return null;
    }
    if (user.active === false) {
        logSupervisorAction({
            req,
            action,
            targetAgent: user.username,
            result: 'not_found',
            code: 'AGENT_INACTIVE',
            error: 'Agente no encontrado o inactivo',
        });
        res.status(404).json({ success: false, error: 'Agente no encontrado o inactivo', code: 'AGENT_INACTIVE' });
        return null;
    }
    return user;
}

function httpStatusForSupervisionError(code) {
    if (code === 'ARI_UNAVAILABLE') return 503;
    if (code === 'AGENT_CHANNEL_NOT_FOUND' || code === 'SIP_EXTENSION_MISSING') return 409;
    if (code === 'SUPERVISOR_ENDPOINT_MISSING') return 412;
    if (code === 'SNOOP_FAILED' || code === 'SNOOP_EMPTY') return 502;
    if (code === 'SUPERVISOR_ATTACH_FAILED' || code === 'SUPERVISOR_MONITOR_ORIGINATE_FAILED') return 502;
    return 500;
}

router.post('/:username/spy', async (req, res) => {
    const action = 'spy';
    try {
        const target = await requireSupervisorAndTarget(req, res, action);
        if (!target) return;
        const { state } = await getRedisAgentState(target.username);
        const sup = assertOnCallForSupervision(state);
        if (!sup.ok) {
            logSupervisorAction({
                req,
                action,
                targetAgent: target.username,
                result: 'rejected',
                code: sup.code,
                error: sup.message,
            });
            return res.status(409).json({ success: false, error: sup.message, code: sup.code });
        }
        const r = await createSupervisorSnoop('spy', target.username, actorFromReq(req));
        if (r.success) {
            logSupervisorAction({ req, action, targetAgent: target.username, result: 'success' });
            return res.json({ success: true, data: r.data });
        }
        logSupervisorAction({
            req,
            action,
            targetAgent: target.username,
            result: 'failed',
            code: r.code,
            error: r.error,
        });
        return res.status(httpStatusForSupervisionError(r.code)).json({
            success: false,
            error: r.error,
            code: r.code,
        });
    } catch (e) {
        console.error('[supervisor spy]', e);
        logSupervisorAction({
            req,
            action,
            targetAgent: req.params.username,
            result: 'error',
            code: 'UNHANDLED_EXCEPTION',
            error: e.message,
        });
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/:username/whisper', async (req, res) => {
    const action = 'whisper';
    try {
        const target = await requireSupervisorAndTarget(req, res, action);
        if (!target) return;
        const { state } = await getRedisAgentState(target.username);
        const sup = assertOnCallForSupervision(state);
        if (!sup.ok) {
            logSupervisorAction({
                req,
                action,
                targetAgent: target.username,
                result: 'rejected',
                code: sup.code,
                error: sup.message,
            });
            return res.status(409).json({ success: false, error: sup.message, code: sup.code });
        }
        const r = await createSupervisorSnoop('whisper', target.username, actorFromReq(req));
        if (r.success) {
            logSupervisorAction({ req, action, targetAgent: target.username, result: 'success' });
            return res.json({ success: true, data: r.data });
        }
        logSupervisorAction({
            req,
            action,
            targetAgent: target.username,
            result: 'failed',
            code: r.code,
            error: r.error,
        });
        return res.status(httpStatusForSupervisionError(r.code)).json({
            success: false,
            error: r.error,
            code: r.code,
        });
    } catch (e) {
        console.error('[supervisor whisper]', e);
        logSupervisorAction({
            req,
            action,
            targetAgent: req.params.username,
            result: 'error',
            code: 'UNHANDLED_EXCEPTION',
            error: e.message,
        });
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/:username/force-ready', async (req, res) => {
    const action = 'force-ready';
    try {
        const target = await requireSupervisorAndTarget(req, res, action);
        if (!target) return;
        const { state } = await getRedisAgentState(target.username);
        const fr = assertForceReadyAllowed(state);
        if (!fr.ok) {
            logSupervisorAction({
                req,
                action,
                targetAgent: target.username,
                result: 'rejected',
                code: fr.code,
                error: fr.message,
            });
            return res.status(409).json({ success: false, error: fr.message, code: fr.code });
        }
        if (fr.code === 'ALREADY_READY') {
            logSupervisorAction({ req, action, targetAgent: target.username, result: 'idempotent', code: fr.code });
            return res.json({ success: true, data: { username: target.username, state: 'READY', idempotent: true } });
        }

        const io = req.app.get('io');
        if (!io) {
            logSupervisorAction({
                req,
                action,
                targetAgent: target.username,
                result: 'failed',
                code: 'IO_UNAVAILABLE',
                error: 'Socket.IO no inicializado.',
            });
            return res.status(500).json({
                success: false,
                error: 'Socket.IO no inicializado.',
                code: 'IO_UNAVAILABLE',
            });
        }

        await applyForceReady(io, target.username);
        logSupervisorAction({ req, action, targetAgent: target.username, result: 'success' });
        return res.json({
            success: true,
            data: { username: target.username, state: 'READY' },
        });
    } catch (e) {
        console.error('[supervisor force-ready]', e);
        logSupervisorAction({
            req,
            action,
            targetAgent: req.params.username,
            result: 'error',
            code: 'UNHANDLED_EXCEPTION',
            error: e.message,
        });
        res.status(500).json({ success: false, error: e.message });
    }
});

async function remoteLogoutHandler(req, res) {
    const action = 'remote-logout';
    try {
        const target = await requireSupervisorAndTarget(req, res, action);
        if (!target) return;
        const { state } = await getRedisAgentState(target.username);
        const lo = assertRemoteLogoutAllowed(state);
        if (!lo.ok) {
            logSupervisorAction({
                req,
                action,
                targetAgent: target.username,
                result: 'rejected',
                code: lo.code,
                error: lo.message,
            });
            return res.status(409).json({ success: false, error: lo.message, code: lo.code });
        }
        if (lo.code === 'ALREADY_OFFLINE') {
            logSupervisorAction({ req, action, targetAgent: target.username, result: 'idempotent', code: lo.code });
            return res.json({
                success: true,
                data: { username: target.username, state: 'OFFLINE', idempotent: true },
            });
        }

        const io = req.app.get('io');
        if (!io) {
            logSupervisorAction({
                req,
                action,
                targetAgent: target.username,
                result: 'failed',
                code: 'IO_UNAVAILABLE',
                error: 'Socket.IO no inicializado.',
            });
            return res.status(500).json({
                success: false,
                error: 'Socket.IO no inicializado.',
                code: 'IO_UNAVAILABLE',
            });
        }

        const hangFirst = lo.code === 'ON_CALL_HANGUP_POLICY';
        const out = await applyRemoteLogout(io, target.username, { hangupFirst: hangFirst });
        if (!out.ok) {
            logSupervisorAction({
                req,
                action,
                targetAgent: target.username,
                result: 'failed',
                code: out.code,
                error: out.error,
            });
            return res.status(httpStatusForSupervisionError(out.code)).json({
                success: false,
                error: out.error,
                code: out.code,
            });
        }
        logSupervisorAction({ req, action, targetAgent: target.username, result: 'success' });
        return res.json({
            success: true,
            data: {
                username: target.username,
                state: 'OFFLINE',
                disconnectedSockets: out.data.disconnectedSockets,
                policy: REMOTE_LOGOUT_ON_CALL_POLICY,
            },
        });
    } catch (e) {
        console.error('[supervisor logout]', e);
        logSupervisorAction({
            req,
            action,
            targetAgent: req.params.username,
            result: 'error',
            code: 'UNHANDLED_EXCEPTION',
            error: e.message,
        });
        res.status(500).json({ success: false, error: e.message });
    }
}

router.post('/:username/remote-logout', remoteLogoutHandler);
// Compatibilidad con clientes legacy.
router.post('/:username/logout', remoteLogoutHandler);

module.exports = router;
