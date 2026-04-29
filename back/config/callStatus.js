/**
 * callStatus.js — Centralized Call Status Constants
 * 
 * SINGLE SOURCE OF TRUTH for all call statuses in the GesCall system.
 * Used by: ariService.js, redisDialerEngine.js, and frontend getDisplayStatus()
 * 
 * Status Table:
 * ┌──────────────┬──────────────────────────────────────┬───────────┐
 * │ Display      │ call_status values                   │ Color     │
 * ├──────────────┼──────────────────────────────────────┼───────────┤
 * │ Transferido  │ XFER, DTMF=2                         │ 🟢 Verde  │
 * │ Completado   │ COMPLET                              │ 🔵 Azul   │
 * │ Contestada   │ ANSWER, UP (sin DTMF o TIMEOUT)      │ 🔵 Azul   │
 * │ Rechazada    │ HANGUP, ANSWER+DTMF válido (colgó)   │ 🟠 Naranja│
 * │ Fallida      │ FAILED                               │ 🔴 Rojo   │
 * │ No Contesta  │ DIALING, IVR_START, NA, RINGING, AA, N│ 🟡 Amarillo│
 * │ Ocupado      │ B, BUSY, CONGESTION, AB              │ 🟣 Púrpura│
 * │ Cortada      │ DROP, PDROP, XDROP                   │ 🔴 Rojo   │
 * │ No Llamar    │ DNC, DNCC                            │ ⚫ Gris   │
 * │ Buzón        │ AM, AL                               │ 🟤 Índigo │
 * │ Venta        │ SALE                                 │ 🟢 Esmeralda│
 * └──────────────┴──────────────────────────────────────┴───────────┘
 */

// ─── Standard Call Statuses ───────────────────────────────────────
const STATUS = {
    DIALING: 'DIALING',    // Initial state when call is originated
    IVR_START: 'IVR_START',  // IVR flow started
    ANSWER: 'ANSWER',     // Call answered (no IVR completion)
    COMPLET: 'COMPLET',    // IVR flow completed normally (hangup node)
    HANGUP: 'HANGUP',     // User hung up during IVR
    XFER: 'XFER',       // Call transferred to agent
    FAILED: 'FAILED',     // Originate failed (trunk/network error)
    NA: 'NA',         // No answer (rang but nobody picked up)
    B: 'B',          // Busy / Congestion
    DROP: 'DROP',       // Call dropped by system
    SALE: 'SALE',       // Sale completed
};

// ─── Asterisk Raw State → GesCall Status ──────────────────────────
// Maps raw Asterisk channel states to standard statuses.
// Used by: ChannelDestroyed handler (for non-IVR calls)
//          ariService.logToGescall (legacy normalization)
const ASTERISK_STATE_MAP = {
    'Up': STATUS.ANSWER,
    'Ringing': STATUS.NA,
    'Busy': STATUS.B,
    'Congestion': STATUS.B,
};

/**
 * Map a raw Asterisk channel state to a GesCall standard status.
 * @param {string} astState - Asterisk channel state (e.g., 'Up', 'Ringing')
 * @returns {string} GesCall standard status
 */
function fromAsteriskState(astState) {
    return ASTERISK_STATE_MAP[astState] || STATUS.DROP;
}

// ─── DTMF Constants ───────────────────────────────────────────────
// Values that indicate NO DTMF was pressed (backend default: dtmf || '0')
const NO_DTMF_VALUES = ['0', 'NONE', '', null, undefined];

/**
 * Check whether a DTMF value represents a real user keypress.
 * @param {string|null|undefined} dtmf
 * @returns {boolean}
 */
function hasDtmfInput(dtmf) {
    return dtmf && !NO_DTMF_VALUES.includes(dtmf);
}

// ─── IVR Outcome → Call Log Status ────────────────────────────────
// These are set by ariService during IVR execution.
const IVR_OUTCOME = {
    COMPLETED: STATUS.COMPLET,  // Flow ran to hangup node
    USER_HANGUP: STATUS.HANGUP,   // User hung up during flow
    TRANSFERRED: STATUS.XFER,     // User transferred to agent
};

module.exports = {
    STATUS,
    ASTERISK_STATE_MAP,
    NO_DTMF_VALUES,
    IVR_OUTCOME,
    fromAsteriskState,
    hasDtmfInput,
};
