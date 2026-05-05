/**
 * dispositionUtils.js — Cálculo único de "Disposición" para gescall_call_log.
 *
 * Fuente única de verdad para la columna Disposición que ven los reportes y exports.
 * Evita las tres copias divergentes que había en routes/campaigns.js.
 *
 * Reglas:
 *   1. Recorre las dispositions personalizadas de la campaña (gescall_dispositions).
 *      La PRIMERA que coincida con `matchDispositionConditions` se usa.
 *   2. Si NINGUNA personalizada coincide, se aplica SIEMPRE el fallback estándar
 *      (Contestada / Rechazada / Cortada / Buzón / …). Nunca devuelve "Desconocido"
 *      salvo que ni call_status ni lead_status existan.
 *
 * Mantener alineado con front/utils/callStatusUtils.ts (getReportDisplayStatus).
 */

const NO_DTMF_VALUES = new Set(['0', 'NONE', '', null, undefined]);

function hasDtmfInput(dtmf) {
    return !!dtmf && !NO_DTMF_VALUES.has(dtmf);
}

function matchDispositionConditions(record, conditions) {
    if (!conditions || Object.keys(conditions).length === 0) return true;
    const cs = (record.call_status || '').toUpperCase();
    const ls = (record.lead_status || record.status || '').toUpperCase();
    const dtmf = record.dtmf_pressed || '';
    const duration = parseInt(record.length_in_sec || record.call_duration || '0', 10);

    let hasStatusCondition = false;
    let statusMatched = false;

    if (Array.isArray(conditions.call_status) && conditions.call_status.length > 0) {
        hasStatusCondition = true;
        if (conditions.call_status.includes(cs)) statusMatched = true;
    }
    if (Array.isArray(conditions.lead_status) && conditions.lead_status.length > 0) {
        hasStatusCondition = true;
        if (conditions.lead_status.includes(ls)) statusMatched = true;
    }
    if (hasStatusCondition && !statusMatched) return false;

    if (Array.isArray(conditions.dtmf) && conditions.dtmf.length > 0) {
        if (!conditions.dtmf.includes(dtmf)) return false;
    }
    if (conditions.exclude_typification === true && record.typification_name) return false;
    if (conditions.require_typification === true && !record.typification_name) return false;
    if (typeof conditions.min_duration === 'number' && duration < conditions.min_duration) return false;

    return true;
}

function fallbackDisposition(record) {
    const cs = (record.call_status || '').toUpperCase();
    const ls = (record.lead_status || record.status || '').toUpperCase();
    const dtmf = record.dtmf_pressed || '';

    if (record.typification_name) return record.typification_name;
    if (dtmf === '2' || cs === 'XFER' || ls === 'XFER') return 'Transferido';
    if (cs === 'COMPLET') return 'Completado';
    if (cs === 'HANGUP') return 'Rechazada';
    if (cs === 'ANSWER' || cs === 'UP') {
        if (dtmf === 'TIMEOUT') return 'Contestada';
        if (hasDtmfInput(dtmf)) return 'Rechazada';
        return 'Contestada';
    }
    if (cs === 'FAILED') return 'Fallida';
    if (['DIALING', 'IVR_START', 'NA', 'RINGING', 'AA', 'N'].includes(cs)) return 'No Contesta';
    if (['B', 'BUSY', 'CONGESTION', 'AB'].includes(cs)) return 'Ocupado';
    if (['DROP', 'PDROP', 'XDROP'].includes(cs)) return 'Cortada';
    if (['DNC', 'DNCC'].includes(cs)) return 'No Llamar';
    if (['AM', 'AL'].includes(cs)) return 'Buzón';
    if (cs === 'SALE') return 'Venta';
    if (['SALE', 'PU', 'PM', 'XFER', 'A', 'COMPLET', 'ANSWER'].includes(ls)) return 'Contestada';
    if (['NEW', 'NA', 'AA', 'B', 'N', 'DROP', 'PDROP', 'QUEUE'].includes(ls)) return 'No Contesta';

    // Última red: lo que haya, no "Desconocido".
    return cs || ls || '—';
}

function resolveDisposition(record, dispositions) {
    if (Array.isArray(dispositions)) {
        for (const dispo of dispositions) {
            const conds = typeof dispo.conditions === 'string'
                ? safeParse(dispo.conditions)
                : dispo.conditions;
            if (matchDispositionConditions(record, conds)) return dispo.label;
        }
    }
    return fallbackDisposition(record);
}

function safeParse(s) {
    try { return JSON.parse(s); } catch (_) { return {}; }
}

module.exports = {
    matchDispositionConditions,
    fallbackDisposition,
    resolveDisposition,
};
