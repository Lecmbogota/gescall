/**
 * Resolución de reglas de enrutamiento (PostgreSQL).
 * MVP: entrantes por DID exacto + filtro opcional de troncal.
 */

const routingCache = require('./routingCache');

const DESTINATION_TYPES = Object.freeze({
    CAMPAIGN_QUEUE: 'CAMPAIGN_QUEUE',
    IVR_THEN_QUEUE: 'IVR_THEN_QUEUE',
    EXTERNAL_NUMBER: 'EXTERNAL_NUMBER',
    OVERRIDE_TRUNK: 'OVERRIDE_TRUNK',
});

/**
 * Resuelve una llamada entrante usando el cache en memoria
 * (poblado por routingCache, invalidado por Redis pub/sub).
 *
 * @param {string} didNumber
 * @param {string|null|undefined} trunkIdHint
 * @returns {Promise<object|null>}
 */
async function resolveInboundDid(didNumber, trunkIdHint = null) {
    return routingCache.resolveInbound(didNumber, trunkIdHint);
}

module.exports = {
    DESTINATION_TYPES,
    resolveInboundDid,
};
