/**
 * routingCache.js
 *
 * Cache en memoria de reglas de enrutamiento entrantes (gescall_route_rules).
 * Se invalida por Redis pub/sub (canal "routing:reload") cuando cualquier
 * proceso modifica reglas. Apto para múltiples nodos backend.
 *
 * API:
 *   - init(redisClient): suscribe al canal y precarga reglas.
 *   - resolveInbound(didNumber, trunkIdHint): igual semántica que el SQL original.
 *   - reload(): fuerza recarga desde PostgreSQL.
 *   - publishReload(redisClient): publica evento de invalidación a otros nodos.
 */

const pg = require('../config/pgDatabase');

const CHANNEL = 'routing:reload';

let inboundByDid = new Map(); // did EXACT -> rule[]
let inboundPrefixes = []; // [{prefixLen, prefix, rule}] ordenadas desc por longitud, asc por prioridad
let inboundRegexes = []; // [{re, rule}] orden por prioridad
let lastLoadAt = 0;
let loading = null;

function compileRule(r) {
    return r;
}

async function load() {
    if (loading) return loading;
    loading = (async () => {
        try {
            const { rows } = await pg.query(
                `SELECT *
                 FROM gescall_route_rules
                 WHERE direction = 'INBOUND' AND active = true
                 ORDER BY
                    CASE WHEN trunk_id IS NOT NULL THEN 0 ELSE 1 END,
                    priority ASC,
                    id ASC`
            );
            const exactMap = new Map();
            const prefixes = [];
            const regexes = [];

            for (const r of rows) {
                if (!r.match_did) continue;
                const kind = (r.match_did_kind || 'EXACT').toUpperCase();
                if (kind === 'PREFIX') {
                    prefixes.push({ prefix: r.match_did, prefixLen: r.match_did.length, rule: compileRule(r) });
                } else if (kind === 'REGEX') {
                    try {
                        regexes.push({ re: new RegExp(r.match_did), rule: compileRule(r) });
                    } catch (e) {
                        console.warn(`[routingCache] regex inválido en regla #${r.id}: ${e.message}`);
                    }
                } else {
                    if (!exactMap.has(r.match_did)) exactMap.set(r.match_did, []);
                    exactMap.get(r.match_did).push(compileRule(r));
                }
            }
            // Más largo = más específico
            prefixes.sort((a, b) => b.prefixLen - a.prefixLen || a.rule.priority - b.rule.priority || a.rule.id - b.rule.id);

            inboundByDid = exactMap;
            inboundPrefixes = prefixes;
            inboundRegexes = regexes;
            lastLoadAt = Date.now();
            console.log(`[routingCache] Inbound rules loaded: ${rows.length} (exact=${exactMap.size}, prefix=${prefixes.length}, regex=${regexes.length})`);
        } catch (err) {
            console.error('[routingCache] Load failed:', err.message);
        } finally {
            loading = null;
        }
    })();
    return loading;
}

async function init(redisClient) {
    await load();
    if (!redisClient) return;
    try {
        const subscriber = redisClient.duplicate();
        subscriber.on('error', (err) => console.error('[routingCache] subscriber error:', err.message));
        await subscriber.connect();
        await subscriber.subscribe(CHANNEL, () => {
            console.log('[routingCache] reload event received');
            load().catch(() => {});
        });
        console.log(`[routingCache] subscribed to "${CHANNEL}"`);
    } catch (err) {
        console.error('[routingCache] failed to subscribe:', err.message);
    }
}

function pickByTrunk(candidates, trunkHint) {
    if (!candidates || candidates.length === 0) return null;
    if (trunkHint) {
        for (const r of candidates) {
            if (r.trunk_id === trunkHint) return r;
        }
    }
    for (const r of candidates) {
        if (!r.trunk_id) return r;
    }
    return null;
}

function resolveInbound(didNumber, trunkIdHint = null) {
    const did = String(didNumber || '').trim();
    if (!did) return null;
    const trunkHint = trunkIdHint ? String(trunkIdHint).trim() : null;

    // 1) EXACT — máxima precedencia
    const exact = pickByTrunk(inboundByDid.get(did), trunkHint);
    if (exact) return exact;

    // 2) PREFIX — más largo gana
    for (const { prefix, rule } of inboundPrefixes) {
        if (did.startsWith(prefix)) {
            if (rule.trunk_id) {
                if (trunkHint && rule.trunk_id === trunkHint) return rule;
                continue;
            }
            return rule;
        }
    }

    // 3) REGEX — primera por prioridad
    for (const { re, rule } of inboundRegexes) {
        if (re.test(did)) {
            if (rule.trunk_id) {
                if (trunkHint && rule.trunk_id === trunkHint) return rule;
                continue;
            }
            return rule;
        }
    }
    return null;
}

async function publishReload(redisClient) {
    if (!redisClient) return;
    try {
        await redisClient.publish(CHANNEL, JSON.stringify({ ts: Date.now() }));
    } catch (err) {
        console.error('[routingCache] publish failed:', err.message);
    }
    // Recarga local inmediata además de notificar a otros nodos.
    load().catch(() => {});
}

function stats() {
    let exactRules = 0;
    for (const v of inboundByDid.values()) exactRules += v.length;
    return {
        exactDids: inboundByDid.size,
        exactRules,
        prefixRules: inboundPrefixes.length,
        regexRules: inboundRegexes.length,
        lastLoadAt,
    };
}

module.exports = {
    init,
    resolveInbound,
    reload: load,
    publishReload,
    stats,
    CHANNEL,
};
