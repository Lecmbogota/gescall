/**
 * Política de estados para acciones de supervisor sobre agentes (OpenSpec supervisor-agent-actions, bloque 1).
 *
 * Valores típicos de `gescall:agent:<username>` en Redis (`state`): OFFLINE, UNKNOWN, READY, ON_CALL,
 * PAUSED, BREAK, NOT_READY, NOT_READY_<código>.
 *
 * Matriz acordada con diseño OpenSpec / stakeholders:
 *
 * | Acción          | Estado agente ON_CALL | Comportamiento                                      |
 * |-----------------|----------------------|-----------------------------------------------------|
 * | spy             | Sí (requerido)       | Elegible en PBX (bloque 2); sin llamada → error     |
 * | whisper         | Sí (requerido)       | Idem spy                                            |
 * | force-ready     | No                   | Rechazo: no se puede forzar READY en llamada activa |
 * | remote logout   | Ver REMOTE_LOGOUT_*  | Por defecto rechazo; alternativa futura: colgar+log |
 *
 * force-ready — estados desde los que el supervisor PUEDE pasar a READY (cuando se implemente mutación):
 * - Pausas / no listo: NOT_READY, NOT_READY_*, PAUSED, BREAK (alineado con isLoggedPauseState en sockets).
 * - READY: idempotente (sin cambio).
 * - OFFLINE / UNKNOWN: no permitido (agente no en workspace activo gestionable por esta acción).
 * - ON_CALL: no permitido.
 *
 * remote-logout — con agente ON_CALL:
 * - Política por defecto: rechazar explícitamente (evita inconsistencia PBX hasta bloque 2.5).
 * - Si en el futuro `REMOTE_LOGOUT_ON_CALL_POLICY=hangup_then_logout`, delegar en servicio PBX + sockets.
 */

/** @readonly */
const REMOTE_LOGOUT_ON_CALL_POLICY = process.env.REMOTE_LOGOUT_ON_CALL_POLICY || 'reject';

function isLoggedPauseState(state) {
    const u = String(state || '').toUpperCase();
    return u === 'NOT_READY' || u.startsWith('NOT_READY_') || u === 'PAUSED' || u === 'BREAK';
}

/**
 * @param {string} state
 * @returns {{ ok: boolean, code?: string, message?: string }}
 */
function assertForceReadyAllowed(state) {
    const u = String(state || '').toUpperCase();
    if (u === 'READY') {
        return { ok: true, code: 'ALREADY_READY' };
    }
    if (u === 'ON_CALL') {
        return {
            ok: false,
            code: 'FORCE_READY_ON_CALL',
            message: 'No se puede forzar READY mientras el agente está en llamada (ON_CALL).',
        };
    }
    if (u === 'OFFLINE' || u === 'UNKNOWN' || !u) {
        return {
            ok: false,
            code: 'FORCE_READY_NOT_IN_WORKSPACE',
            message: 'El agente no está en un estado de workspace elegible para force-ready.',
        };
    }
    if (isLoggedPauseState(state)) {
        return { ok: true, code: 'FROM_PAUSE' };
    }
    return {
        ok: false,
        code: 'FORCE_READY_INELIGIBLE',
        message: 'Estado actual no permite force-ready supervisado.',
    };
}

/**
 * @param {string} state
 * @returns {{ ok: boolean, code?: string, message?: string }}
 */
function assertRemoteLogoutAllowed(state) {
    const u = String(state || '').toUpperCase();
    if (u === 'OFFLINE') {
        return { ok: true, code: 'ALREADY_OFFLINE' };
    }
    if (u === 'ON_CALL') {
        if (REMOTE_LOGOUT_ON_CALL_POLICY === 'hangup_then_logout') {
            return { ok: true, code: 'ON_CALL_HANGUP_POLICY' };
        }
        return {
            ok: false,
            code: 'LOGOUT_REJECTED_ON_CALL',
            message:
                'Logout remoto rechazado: el agente está en llamada. Configurar REMOTE_LOGOUT_ON_CALL_POLICY o aplicar política PBX en bloque 2.',
        };
    }
    return { ok: true, code: 'ALLOW' };
}

/**
 * spy/whisper requieren llamada activa según modelo GesCall (estado ON_CALL en Redis).
 * @param {string} state
 * @returns {{ ok: boolean, code?: string, message?: string }}
 */
function assertOnCallForSupervision(state) {
    const u = String(state || '').toUpperCase();
    if (u === 'ON_CALL') {
        return { ok: true };
    }
    return {
        ok: false,
        code: 'SUPERVISION_NEEDS_ON_CALL',
        message: 'Esta acción requiere que el agente esté en llamada (ON_CALL).',
    };
}

module.exports = {
    REMOTE_LOGOUT_ON_CALL_POLICY,
    isLoggedPauseState,
    assertForceReadyAllowed,
    assertRemoteLogoutAllowed,
    assertOnCallForSupervision,
};
