const pg = require('../config/pgDatabase');
const redis = require('../config/redisClient');

class PgDatabaseService {
    async getDashboardStats() {
        try {
            let active_calls = 0;
            try {
                const keys = await redis.keys('gescall:call:*');
                active_calls = keys ? keys.length : 0;
            } catch (redisErr) {
                console.error('[pgDatabaseService] Redis error fetching active calls:', redisErr.message);
            }

            const sql = `
                SELECT
                    (SELECT COUNT(*) FROM gescall_users WHERE active = true) as active_agents,
                    (SELECT COUNT(*) FROM gescall_campaigns WHERE active = true) as active_campaigns,
                    (SELECT COUNT(*)
                     FROM gescall_leads l
                     INNER JOIN gescall_lists ls ON l.list_id = ls.list_id
                     WHERE ls.active = true AND (l.status = 'NEW' OR l.status = 'QUEUE')
                    ) as pending_leads,
                    (SELECT COUNT(*) FROM gescall_call_log WHERE call_date >= CURRENT_DATE) as calls_today,
                    (SELECT COUNT(*) FROM gescall_call_log WHERE call_status = 'SALE' AND call_date >= CURRENT_DATE) as sales_today,
                    (SELECT COALESCE(AVG(call_duration), 0) FROM gescall_call_log WHERE call_date >= CURRENT_DATE AND call_duration > 0) as avg_talk_time_today,
                    (SELECT COUNT(*)
                     FROM gescall_leads l
                     INNER JOIN gescall_lists ls ON l.list_id = ls.list_id
                     WHERE ls.active = true
                    ) as total_leads_active_lists
            `;

            const { rows } = await pg.query(sql);
            const stats = rows[0] || {};
            stats.active_calls = active_calls;

            stats.active_agents = parseInt(stats.active_agents) || 0;
            stats.active_campaigns = parseInt(stats.active_campaigns) || 0;
            stats.pending_leads = parseInt(stats.pending_leads) || 0;
            stats.calls_today = parseInt(stats.calls_today) || 0;
            stats.sales_today = parseInt(stats.sales_today) || 0;
            stats.avg_talk_time_today = parseFloat(stats.avg_talk_time_today) || 0;
            stats.total_leads_active_lists = parseInt(stats.total_leads_active_lists) || 0;

            stats.conversion_rate = stats.calls_today > 0
                ? ((stats.sales_today / stats.calls_today) * 100).toFixed(2)
                : 0;
            stats.calls_per_agent = stats.active_agents > 0
                ? Math.round(stats.calls_today / stats.active_agents)
                : 0;

            return stats;
        } catch (error) {
            console.error('[pgDatabaseService] Error in getDashboardStats:', error.message);
            throw error;
        }
    }

    async getActiveAgents() {
        try {
            // Read all agent keys from Redis
            const keys = await redis.keys('gescall:agent:*');
            if (!keys || keys.length === 0) return [];

            const agents = [];
            for (const key of keys) {
                try {
                    const data = await redis.hGetAll(key);
                    if (!data || !data.state) continue;
                    if (data.state === 'OFFLINE' || data.state === 'UNKNOWN') continue;
                    const username = key.replace(/^gescall:agent:/, '');
                    agents.push({
                        username,
                        state: data.state,
                        last_change: data.last_change || '0',
                        campaign_id: data.campaign_id || null
                    });
                } catch (innerErr) {
                    // Ignore single-key errors
                }
            }
            return agents;
        } catch (error) {
            console.error('[pgDatabaseService] Error in getActiveAgents:', error.message);
            return [];
        }
    }

    async getAllCampaigns() {
        try {
            const { rows } = await pg.query(`
                SELECT campaign_id, campaign_name, active, max_retries,
                CASE WHEN active THEN 'Y' ELSE 'N' END as active
                FROM gescall_campaigns
                ORDER BY campaign_name
            `);
            return rows;
        } catch (error) {
            console.error('[pgDatabaseService] Error in getAllCampaigns:', error.message);
            throw error;
        }
    }

    async getProgressForSingleCampaign(campaign) {
        const sql = `
            SELECT
                vls.campaign_id,
                COUNT(*) as total,
                CAST(SUM(CASE WHEN vl.called_count > 0 THEN 1 ELSE 0 END) AS INTEGER) as avance,
                ROUND((CAST(SUM(CASE WHEN vl.called_count > 0 THEN 1 ELSE 0 END) AS DECIMAL) / NULLIF(COUNT(*), 0)) * 100, 2) as porcentaje
            FROM gescall_leads vl
            INNER JOIN gescall_lists vls ON vl.list_id = vls.list_id
            WHERE vls.campaign_id = $1 AND vls.active = true
            GROUP BY vls.campaign_id
        `;

        try {
            const { rows } = await pg.query(sql, [campaign]);
            return rows[0] || null;
        } catch (error) {
            console.error('[pgDatabaseService] Error in getProgressForSingleCampaign:', error.message);
            throw error;
        }
    }

    async getCampaignRealtimeStats(campaignId) {
        const sql = `
            SELECT 
                cl.call_status,
                cl.dtmf_pressed,
                l.status as lead_status
            FROM gescall_call_log cl
            LEFT JOIN gescall_leads l ON cl.lead_id = l.lead_id
            WHERE cl.campaign_id = $1 AND cl.call_date >= CURRENT_DATE
        `;

        try {
            const { rows } = await pg.query(sql, [campaignId]);
            const totalCalls = rows.length;

            if (totalCalls === 0) return [];

            // Helper to map statuses similarly to frontend getDetailDisplayStatus
            const getStatusMapped = (record) => {
                const cs = (record.call_status || '').toUpperCase();
                const dtmf = record.dtmf_pressed;
                const ls = (record.lead_status || '').toUpperCase();

                const NO_DTMF_VALUES = ['0', 'NONE', '', null, undefined];
                const hasDtmf = dtmf && !NO_DTMF_VALUES.includes(dtmf);

                if (dtmf === '2' || cs === 'XFER') return { label: 'Transferido', color: 'bg-green-500', description: 'Llamada transferida a asesor' };
                if (cs === 'COMPLET') return { label: 'Completado', color: 'bg-blue-500', description: 'El cliente escuchó el audio completo y el sistema finalizó la llamada exitosamente' };
                if (cs === 'HANGUP') return { label: 'Rechazada', color: 'bg-orange-500', description: 'Colgó la llamada durante el IVR' };

                if (cs === 'ANSWER' || cs === 'UP') {
                    if (dtmf === 'TIMEOUT') return { label: 'Contestada', color: 'bg-blue-500', description: 'Escuchó el mensaje completo sin presionar opciones' };
                    if (hasDtmf) return { label: 'Rechazada', color: 'bg-orange-500', description: `Contestó y seleccionó la opción ${dtmf}` };
                    return { label: 'Contestada', color: 'bg-blue-500', description: 'El cliente contestó pero colgó antes de que terminara el mensaje' };
                }

                if (cs === 'FAILED') return { label: 'Fallida', color: 'bg-red-500', description: 'Error al originar la llamada' };
                if (["DIALING", "IVR_START", "NA", "RINGING", "AA", "N"].includes(cs)) return { label: 'No Contesta', color: 'bg-yellow-500', description: 'No contestó la llamada' };
                if (["B", "BUSY", "CONGESTION", "AB"].includes(cs)) return { label: 'Ocupado', color: 'bg-purple-500', description: 'Línea ocupada' };
                if (["DROP", "PDROP", "XDROP"].includes(cs)) return { label: 'Cortada', color: 'bg-red-400', description: 'Llamada abortada por la red telefónica, el proveedor SIP o límite de canales' };
                if (["DNC", "DNCC"].includes(cs)) return { label: 'No Llamar', color: 'bg-slate-500', description: 'Número en lista de no llamar' };
                if (["AM", "AL"].includes(cs)) return { label: 'Buzón', color: 'bg-indigo-400', description: 'Contestadora automática' };
                if (cs === 'SALE') return { label: 'Venta', color: 'bg-emerald-600', description: 'Venta realizada' };

                if (['SALE', 'PU', 'PM', 'XFER', 'A', 'COMPLET', 'ANSWER'].includes(ls)) return { label: 'Contestada', color: 'bg-blue-500', description: 'Llamada contestada' };
                if (['NEW', 'NA', 'AA', 'B', 'N', 'DROP', 'PDROP', 'QUEUE'].includes(ls)) return { label: 'No Contesta', color: 'bg-yellow-500', description: 'No contestó la llamada' };

                return { label: cs || 'Desconocido', color: 'bg-slate-400', description: `Estado: ${cs || 'sin estado'}` };
            };

            const summaryMap = {};
            rows.forEach(row => {
                const mapped = getStatusMapped(row);
                if (!summaryMap[mapped.label]) {
                    summaryMap[mapped.label] = { count: 0, color: mapped.color, description: mapped.description, total_calls: totalCalls };
                }
                summaryMap[mapped.label].count += 1;
            });

            return Object.entries(summaryMap)
                .map(([label, data]) => ({ label, ...data }))
                .sort((a, b) => b.count - a.count);

        } catch (error) {
            console.error('[pgDatabaseService] Error in getCampaignRealtimeStats:', error.message);
            throw error;
        }
    }
}

module.exports = new PgDatabaseService();
