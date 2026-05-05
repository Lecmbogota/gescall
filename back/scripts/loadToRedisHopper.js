require('dotenv').config();
const pg = require('../config/pgDatabase');
const redis = require('../config/redisClient');

async function loadHopper() {
    try {
        // 1. Get active campaigns
        const { rows: campaigns } = await pg.query(`
            SELECT campaign_id, lead_structure_schema, alt_phone_enabled FROM gescall_campaigns WHERE active = true
        `);

        if (campaigns.length === 0) return { success: true, count: 0, message: "No active campaigns." };

        let totalQueued = 0;

        for (const camp of campaigns) {
            const hopperKey = `gescall:hopper:${camp.campaign_id}`;

            // 2. Check current hopper size — skip if already has enough leads
            const hopperSize = await redis.lLen(hopperKey);
            if (hopperSize >= 6000) continue;

            const toLoad = 15000 - hopperSize; // Fill up to 15000

            // Lead IDs already serialized in Redis (avoid duplicates when reloading orphan QUEUE)
            const inHopper = new Set();
            if (hopperSize > 0) {
                const existingRaw = await redis.lRange(hopperKey, 0, -1);
                for (const raw of existingRaw) {
                    try {
                        const o = JSON.parse(raw);
                        if (o.lead_id != null && o.lead_id !== '') {
                            inHopper.add(Number(o.lead_id));
                        }
                    } catch (_) { /* skip bad hopper line */ }
                }
            }
            const excludeLeadIds = Array.from(inHopper);

            // 3. Load leads with DNC + smart rules pre-filtering in a single query
            const { rows } = await pg.query(`
                WITH active_rules AS (
                    SELECT max_calls, period_hours 
                    FROM gescall_dnc_rules 
                    WHERE is_active = true AND (applies_to = 'ALL' OR applies_to = $1)
                    ORDER BY max_calls ASC LIMIT 1
                ),
                base_leads AS (
                    SELECT led.lead_id, led.phone_number, led.first_name, led.last_name, led.vendor_lead_code, led.phone_index, led.tts_vars, ls.campaign_id, ls.list_id
                    FROM gescall_leads led
                    JOIN gescall_lists ls ON led.list_id = ls.list_id
                    WHERE (led.status = 'NEW' OR (led.status = 'QUEUE' AND led.last_call_time IS NULL))
                      AND ls.campaign_id = $1
                      AND ls.active = true
                      AND (cardinality($3::bigint[]) = 0 OR NOT (led.lead_id = ANY($3::bigint[])))
                    ORDER BY led.lead_id ASC
                    LIMIT 50000
                ),
                eligible_leads AS (
                    SELECT DISTINCT ON (el_base.phone_number)
                        el_base.lead_id, el_base.phone_number, el_base.first_name, el_base.last_name,
                        el_base.vendor_lead_code, el_base.phone_index, el_base.tts_vars, el_base.campaign_id, el_base.list_id
                    FROM base_leads el_base
                    -- Exclude DNC blacklisted numbers
                    WHERE NOT EXISTS (
                          SELECT 1 FROM gescall_dnc d
                          WHERE d.phone_number = el_base.phone_number
                            AND (d.campaign_id IS NULL OR d.campaign_id = $1)
                      )
                    ORDER BY el_base.phone_number, el_base.lead_id ASC
                )
                SELECT el.* FROM eligible_leads el
                -- Exclude leads that exceed smart rule limits
                WHERE (NOT EXISTS (SELECT 1 FROM active_rules))
                   OR (
                       (SELECT COUNT(*) FROM gescall_call_log cl
                        WHERE cl.phone_number = el.phone_number
                          AND cl.call_date >= NOW() - ((SELECT period_hours FROM active_rules) || ' hours')::INTERVAL
                       ) < (SELECT max_calls FROM active_rules)
                   )
                LIMIT $2
            `, [camp.campaign_id, toLoad, excludeLeadIds]);

            if (rows.length > 0) {
                console.log(`[Hopper] ${camp.campaign_id}: +${rows.length} (hopper was ${hopperSize}, exclude ${excludeLeadIds.length} in-redis)`);
            }

            if (rows.length === 0) continue;

            // 4. Push to Redis in one batch
            const schema = typeof camp.lead_structure_schema === 'string' ? JSON.parse(camp.lead_structure_schema) : (camp.lead_structure_schema || []);
            const isAltPhoneEnabled = camp.alt_phone_enabled || false;
            
            // Extract phone columns from schema (excluding standard phone)
            const altPhoneCols = schema.filter(col => col.is_phone && col.name !== 'telefono').map(c => c.name);

            const leadIds = [];
            const stringified = rows.map(l => {
                leadIds.push(l.lead_id);
                
                let altPhones = [];
                if (isAltPhoneEnabled && l.tts_vars) {
                    try {
                        const parsedVars = typeof l.tts_vars === 'string' ? JSON.parse(l.tts_vars) : l.tts_vars;
                        for (const col of altPhoneCols) {
                            if (parsedVars[col] && String(parsedVars[col]).replace(/[^0-9]/g, '').length >= 7) {
                                altPhones.push(String(parsedVars[col]).replace(/[^0-9]/g, ''));
                            }
                        }
                    } catch (e) {
                         // parse error
                    }
                }

                return JSON.stringify({
                    lead_id: l.lead_id,
                    list_id: l.list_id,
                    phone_number: l.phone_number,
                    campaign_id: l.campaign_id,
                    first_name: l.first_name,
                    last_name: l.last_name,
                    vendor_lead_code: l.vendor_lead_code,
                    phone_index: l.phone_index || 0,
                    alt_phones: altPhones
                });
            });

            await redis.rPush(hopperKey, stringified);
            totalQueued += rows.length;

            // 5. Mark as QUEUE in bulk
            await pg.query("UPDATE gescall_leads SET status = 'QUEUE' WHERE lead_id = ANY($1)", [leadIds]);
        }

        return { success: true, count: totalQueued, message: `Loaded ${totalQueued} leads into hopper.` };
    } catch (err) {
        console.error("❌ Hopper loader failed:", err);
        return { success: false, error: err.message };
    }
}

// Allow direct execution from CLI
if (require.main === module) {
    setTimeout(async () => {
        const result = await loadHopper();
        console.log(result.message);
        process.exit(result.success ? 0 : 1);
    }, 1000);
}

module.exports = loadHopper;
