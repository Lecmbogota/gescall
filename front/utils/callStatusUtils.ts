/**
 * callStatusUtils.ts — Centralized Call Status Display Mapping
 *
 * SINGLE SOURCE OF TRUTH for how call statuses are displayed in the UI.
 * Used by: CampaignDetailPage.tsx, ConsolidatedReports.tsx
 *
 * Status Table:
 * ┌──────────────┬──────────────────────────────────────┬────────────┐
 * │ Display      │ call_status values                   │ Color      │
 * ├──────────────┼──────────────────────────────────────┼────────────┤
 * │ Transferido  │ XFER, DTMF=2                         │ 🟢 Verde   │
 * │ Completado   │ COMPLET                              │ 🔵 Azul    │
 * │ Contestada   │ ANSWER, UP (sin DTMF o TIMEOUT)      │ 🔵 Azul    │
 * │ Rechazada    │ HANGUP, ANSWER+DTMF válido (colgó)   │ 🟠 Naranja │
 * │ Fallida      │ FAILED                               │ 🔴 Rojo    │
 * │ No Contesta  │ DIALING, IVR_START, NA, RINGING, AA  │ 🟡 Amarillo│
 * │ Ocupado      │ B, BUSY, CONGESTION, AB              │ 🟣 Púrpura │
 * │ Cortada      │ DROP, PDROP, XDROP                   │ 🔴 Rojo    │
 * │ No Llamar    │ DNC, DNCC                            │ ⚫ Gris    │
 * │ Buzón        │ AM, AL                               │ 🟤 Índigo  │
 * │ Venta        │ SALE                                 │ 🟢 Esmeralda│
 * └──────────────┴──────────────────────────────────────┴────────────┘
 */

// Values that indicate NO DTMF was pressed
const NO_DTMF_VALUES = ['0', 'NONE', '', null, undefined];

function hasDtmfInput(dtmf: string | null | undefined): boolean {
    return !!dtmf && !NO_DTMF_VALUES.includes(dtmf);
}

// ─── Detail Page Style (solid background badges) ──────────────────

interface DetailStatus {
    label: string;
    color: string;
    description: string;
}

export function getDetailDisplayStatus(
    callStatus: string | null | undefined,
    dtmf: string | null | undefined,
    leadStatus: string | null | undefined,
    typificationName?: string | null | undefined
): DetailStatus {
    const cs = (callStatus || '').toUpperCase();
    const ls = (leadStatus || '').toUpperCase();

    // 1. Transferido: DTMF=2 or XFER status
    if (dtmf === '2' || cs === 'XFER')
        return { label: 'Transferido', color: 'bg-green-500', description: 'Llamada transferida a asesor' };

    // 2. Completado: IVR completed normally
    if (cs === 'COMPLET')
        return { label: 'Completado', color: 'bg-blue-500', description: 'El cliente escuchó el audio completo y el sistema finalizó la llamada exitosamente' };

    // 3. Rechazada: User hung up during IVR (colgó la llamada)
    if (cs === 'HANGUP')
        return { label: 'Rechazada', color: 'bg-orange-500', description: 'Colgó la llamada durante el IVR' };

    // 4. Contestada: Call answered
    if (cs === 'ANSWER' || cs === 'UP') {
        if (dtmf === 'TIMEOUT')
            return { label: 'Contestada', color: 'bg-blue-500', description: 'Escuchó el mensaje completo sin presionar opciones' };
        if (hasDtmfInput(dtmf))
            return { label: 'Rechazada', color: 'bg-orange-500', description: `Contestó y seleccionó la opción ${dtmf}` };
        return { label: 'Contestada', color: 'bg-blue-500', description: 'El cliente contestó pero colgó antes de que terminara el mensaje' };
    }

    // 5. Fallida
    if (cs === 'FAILED')
        return { label: 'Fallida', color: 'bg-red-500', description: 'Error al originar la llamada' };

    // 6. No Contesta
    if (cs === 'DIALING' || cs === 'IVR_START' || cs === 'NA' || cs === 'RINGING' || cs === 'AA' || cs === 'N')
        return { label: 'No Contesta', color: 'bg-yellow-500', description: 'No contestó la llamada' };

    // 7. Ocupado
    if (cs === 'B' || cs === 'BUSY' || cs === 'CONGESTION' || cs === 'AB')
        return { label: 'Ocupado', color: 'bg-purple-500', description: 'Línea ocupada' };

    // 8. Cortada
    if (cs === 'DROP' || cs === 'PDROP' || cs === 'XDROP')
        return { label: 'Cortada', color: 'bg-red-400', description: 'Conexión interrumpida antes de enlazar' };

    // 9. No Llamar
    if (cs === 'DNC' || cs === 'DNCC')
        return { label: 'No Llamar', color: 'bg-slate-500', description: 'Número en lista de no llamar' };

    // 10. Buzón
    if (cs === 'AM' || cs === 'AL')
        return { label: 'Buzón', color: 'bg-indigo-400', description: 'Contestadora automática' };

    // 11. Venta
    if (cs === 'SALE')
        return { label: 'Venta', color: 'bg-emerald-600', description: 'Venta realizada' };

    // 12. Fallback: lead_status
    if (['SALE', 'PU', 'PM', 'XFER', 'A', 'COMPLET', 'ANSWER'].includes(ls))
        return { label: 'Contestada', color: 'bg-blue-500', description: 'Llamada contestada' };
    if (['NEW', 'NA', 'AA', 'B', 'N', 'DROP', 'PDROP', 'QUEUE'].includes(ls))
        return { label: 'No Contesta', color: 'bg-yellow-500', description: 'No contestó la llamada' };

    // 13. Desconocido
    return { label: cs || 'Desconocido', color: 'bg-slate-400', description: `Estado: ${cs || 'sin estado'}` };
}

// ─── Report Style (bordered pastel badges) ────────────────────────

interface ReportStatus {
    label: string;
    color: string;
}

export function getReportDisplayStatus(
    callStatus: string | null | undefined,
    dtmf: string | null | undefined,
    leadStatus: string | null | undefined,
    typificationName?: string | null | undefined
): ReportStatus {
    const cs = (callStatus || '').toUpperCase();
    const ls = (leadStatus || '').toUpperCase();

    // 1. Transferido
    if (dtmf === '2' || cs === 'XFER')
        return { label: 'Transferido', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };

    // 2. Completado
    if (cs === 'COMPLET')
        return { label: 'Completado', color: 'bg-sky-100 text-sky-700 border-sky-200' };

    // 3. Rechazada: Colgó la llamada
    if (cs === 'HANGUP')
        return { label: 'Rechazada', color: 'bg-amber-100 text-amber-700 border-amber-200' };

    // 4. Contestada
    if (cs === 'ANSWER' || cs === 'UP') {
        if (dtmf === 'TIMEOUT')
            return { label: 'Contestada', color: 'bg-sky-100 text-sky-700 border-sky-200' };
        if (hasDtmfInput(dtmf))
            return { label: 'Rechazada', color: 'bg-amber-100 text-amber-700 border-amber-200' };
        return { label: 'Contestada', color: 'bg-sky-100 text-sky-700 border-sky-200' };
    }

    // 5. Fallida
    if (cs === 'FAILED')
        return { label: 'Fallida', color: 'bg-red-100 text-red-700 border-red-200' };

    // 6. No Contesta
    if (cs === 'DIALING' || cs === 'IVR_START' || cs === 'NA' || cs === 'RINGING' || cs === 'AA' || cs === 'N')
        return { label: 'No Contesta', color: 'bg-slate-100 text-slate-600 border-slate-200' };

    // 7. Ocupado
    if (cs === 'B' || cs === 'BUSY' || cs === 'CONGESTION' || cs === 'AB')
        return { label: 'Ocupado', color: 'bg-purple-100 text-purple-700 border-purple-200' };

    // 8. Cortada
    if (cs === 'DROP' || cs === 'PDROP' || cs === 'XDROP')
        return { label: 'Cortada', color: 'bg-red-50 text-red-600 border-red-200' };

    // 9. No Llamar
    if (cs === 'DNC' || cs === 'DNCC')
        return { label: 'No Llamar', color: 'bg-slate-200 text-slate-700 border-slate-300' };

    // 10. Buzón
    if (cs === 'AM' || cs === 'AL')
        return { label: 'Buzón', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' };

    // 11. Venta
    if (cs === 'SALE')
        return { label: 'Venta', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };

    // 12. Fallback: lead_status
    if (['SALE', 'PU', 'PM', 'XFER', 'A', 'COMPLET', 'ANSWER'].includes(ls))
        return { label: 'Contestada', color: 'bg-sky-100 text-sky-700 border-sky-200' };
    if (['NEW', 'NA', 'AA', 'B', 'N', 'DROP', 'PDROP', 'QUEUE'].includes(ls))
        return { label: 'No Contesta', color: 'bg-slate-100 text-slate-600 border-slate-200' };

    // 13. Desconocido
    return { label: cs || 'Desconocido', color: 'bg-slate-100 text-slate-600 border-slate-200' };
}

// ─── Shared Lead Status Translation ──────────────────────────────

export function translateLeadStatus(status: string): { label: string; description: string } {
    const statusMap: Record<string, { label: string; description: string }> = {
        'NEW': { label: 'Nuevo', description: 'Sin intentar' },
        'QUEUE': { label: 'En Cola', description: 'Esperando en cola' },
        'NI': { label: 'No Interesado', description: 'No mostró interés' },
        'SALE': { label: 'Venta', description: 'Venta realizada' },
        'PU': { label: 'Pickup', description: 'Llamada contestada' },
        'PM': { label: 'PM', description: 'Pickup con mensaje' },
        'XFER': { label: 'Transferido', description: 'Llamada transferida' },
        'CB': { label: 'Callback', description: 'Programado para rellamar' },
        'CALLBK': { label: 'Callback', description: 'Callback pendiente' },
        'CBHOLD': { label: 'CB Hold', description: 'Callback en espera' },
        'NA': { label: 'No Contesta', description: 'No contestó la llamada' },
        'AA': { label: 'Auto No Contesta', description: 'Timeout automático' },
        'N': { label: 'No Answer', description: 'Sin respuesta' },
        'NP': { label: 'No Party', description: 'No hay persona disponible' },
        'B': { label: 'Ocupado', description: 'Línea ocupada' },
        'AB': { label: 'Auto Ocupado', description: 'Ocupado automático' },
        'DROP': { label: 'Cortada', description: 'Conexión interrumpida' },
        'XDROP': { label: 'Cortada', description: 'Conexión interrumpida' },
        'PDROP': { label: 'Perdida', description: 'Perdida por marcador predictivo (sin agente disponible)' },
        'AM': { label: 'Buzón', description: 'Contestadora automática' },
        'AL': { label: 'Buzón Largo', description: 'Mensaje largo detectado' },
        'AFAX': { label: 'Fax', description: 'Línea de fax detectada' },
        'DNC': { label: 'No Llamar', description: 'Solicitó no ser llamado' },
        'DC': { label: 'Desconectado', description: 'Número desconectado' },
        'ADC': { label: 'Auto Desc.', description: 'Desconectado automático' },
        'DNCC': { label: 'Blacklist', description: 'En lista negra' },
        'WLFLTR': { label: 'Filtrado', description: 'Filtrado por lista blanca' },
        'ERI': { label: 'Error', description: 'Error en número inválido' },
        'A': { label: 'Contestado', description: 'Llamada contestada' },
        'INCALL': { label: 'En Llamada', description: 'Llamada en progreso' },
        'DEAD': { label: 'Inválido', description: 'Número de teléfono inválido o desconectado' },
        'DISPO': { label: 'Disposition', description: 'Pendiente de tabulación' },
        'COMPLET': { label: 'Completado', description: 'El cliente escuchó el audio completo' },
    };

    const upperStatus = (status || 'NEW').toUpperCase();
    return statusMap[upperStatus] || { label: status || 'Nuevo', description: 'Estado desconocido' };
}
