/**
 * CallerID Rotation Service
 * Replaces the Perl AGI `aleatorio_callerid.agi` with a Node.js in-memory cached rotation.
 * Supports: ROUND_ROBIN, RANDOM strategies, area code matching, and per-campaign pools.
 */
const pg = require('../config/pgDatabase');

class CallerIdRotationService {
    constructor() {
        // Cache: { campaignId: { settings, numbers, index } }
        this._cache = {};
        this._cacheTTL = 30000; // 30 seconds
        this._cacheTime = {};
    }

    /**
     * Get the next CallerID for a campaign + phone number.
     * Returns the CallerID string or null if no rotation configured.
     */
    async getCallerId(campaignId, phoneNumber) {
        try {
            const config = await this._getConfig(campaignId);
            if (!config || config.rotationMode === 'OFF' || config.numbers.length === 0) {
                return null; // No rotation — use default campaign CID
            }

            let selectedCid;

            if (config.matchAreaCode && phoneNumber) {
                // Try to match area code (first 3 digits after country code)
                const areaCode = this._extractAreaCode(phoneNumber, config.dialPrefix);
                const matchingNumbers = config.numbers.filter(n => n.area_code === areaCode);

                if (matchingNumbers.length > 0) {
                    selectedCid = this._selectFromPool(matchingNumbers, config, `${campaignId}_${areaCode}`);
                } else {
                    // Fallback to any number in the pool
                    selectedCid = this._selectFromPool(config.numbers, config, campaignId);
                }
            } else {
                selectedCid = this._selectFromPool(config.numbers, config, campaignId);
            }

            return selectedCid ? selectedCid.callerid : null;
        } catch (err) {
            console.error(`[CallerIdRotation] Error for ${campaignId}:`, err.message);
            return null;
        }
    }

    /**
     * Select a number from a pool based on strategy
     */
    _selectFromPool(numbers, config, indexKey) {
        if (numbers.length === 0) return null;

        if (config.strategy === 'RANDOM') {
            return numbers[Math.floor(Math.random() * numbers.length)];
        }

        // ROUND_ROBIN (default)
        if (!this._cache[indexKey]) this._cache[indexKey] = {};
        const idx = (this._cache[indexKey]._rrIndex || 0) % numbers.length;
        this._cache[indexKey]._rrIndex = idx + 1;
        return numbers[idx];
    }

    /**
     * Extract area code from phone number
     * Colombian numbers: 57 + 3XX XXXXXXX → area = 3XX
     * Mexican numbers: 52 + XXX XXXXXXX → area = first 3 digits after country code
     */
    _extractAreaCode(phoneNumber, dialPrefix) {
        let digits = phoneNumber.replace(/\D/g, '');
        // Remove dial prefix if present
        if (dialPrefix && digits.startsWith(dialPrefix)) {
            digits = digits.slice(dialPrefix.length);
        }

        // To ignore country codes (like 57 for Colombia), assume a 10-digit national number.
        if (digits.length >= 10) {
            digits = digits.slice(-10);
        }

        return digits.substring(0, 3);
    }

    /**
     * Get cached campaign CallerID configuration
     */
    async _getConfig(campaignId) {
        const now = Date.now();
        if (this._cache[campaignId]?.settings && (now - (this._cacheTime[campaignId] || 0)) < this._cacheTTL) {
            return this._cache[campaignId].settings;
        }

        // Fetch settings
        const { rows: settings } = await pg.query(`
            SELECT s.rotation_mode, s.pool_id, s.selection_strategy, s.match_area_code,
                   s.fallback_callerid, c.dial_prefix
            FROM gescall_campaign_callerid_settings s
            JOIN gescall_campaigns c ON c.campaign_id = s.campaign_id
            WHERE s.campaign_id = $1
        `, [campaignId]);

        if (settings.length === 0) {
            this._cache[campaignId] = { settings: null };
            this._cacheTime[campaignId] = now;
            return null;
        }

        const s = settings[0];
        if (!s.pool_id || s.rotation_mode === 'OFF') {
            this._cache[campaignId] = { settings: null };
            this._cacheTime[campaignId] = now;
            return null;
        }

        // Fetch pool numbers
        const { rows: numbers } = await pg.query(`
            SELECT callerid, area_code
            FROM gescall_callerid_pool_numbers
            WHERE pool_id = $1 AND is_active = true
            ORDER BY id
        `, [s.pool_id]);

        const config = {
            rotationMode: s.rotation_mode,
            strategy: s.selection_strategy || 'ROUND_ROBIN',
            matchAreaCode: s.match_area_code || false,
            fallbackCid: s.fallback_callerid || null,
            dialPrefix: s.dial_prefix || '',
            numbers
        };

        this._cache[campaignId] = { settings: config };
        this._cacheTime[campaignId] = now;

        console.log(`[CallerIdRotation] Loaded ${numbers.length} CIDs for ${campaignId} (${config.strategy}, areaMatch=${config.matchAreaCode})`);
        return config;
    }

    /**
     * Invalidate cache for a campaign (call after pool changes)
     */
    invalidate(campaignId) {
        delete this._cache[campaignId];
        delete this._cacheTime[campaignId];
    }

    invalidateAll() {
        this._cache = {};
        this._cacheTime = {};
    }
}

module.exports = new CallerIdRotationService();
