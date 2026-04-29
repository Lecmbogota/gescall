require('dotenv').config({ path: '../.env' });
const pg = require('../config/pgDatabase');
const redis = require('../config/redisClient');

async function recycleList(listId) {
    if (!listId) {
        console.error("Usage: node recycle_list.js <list_id>");
        process.exit(1);
    }

    try {
        console.log(`[Recycling] Checking list ID: ${listId}...`);
        
        // Ensure list exists
        const listCheck = await pg.query("SELECT * FROM gescall_lists WHERE list_id = $1", [listId]);
        if (listCheck.rowCount === 0) {
            console.error(`[Recycling] Error: List ${listId} does not exist.`);
            process.exit(1);
        }
        
        const campaignId = listCheck.rows[0].campaign_id;

        // Count leads in different statuses
        const statusCheck = await pg.query(`
            SELECT status, COUNT(*) as count 
            FROM gescall_leads 
            WHERE list_id = $1 
            GROUP BY status
        `, [listId]);
        
        console.log(`[Recycling] Current lead statuses for list ${listId}:`);
        statusCheck.rows.forEach(r => console.log(`  - ${r.status}: ${r.count}`));

        // Update QUEUE, COMPLET, FAIL, ANSWER, etc. to NEW
        const updateResult = await pg.query(`
            UPDATE gescall_leads 
            SET status = 'NEW' 
            WHERE list_id = $1 AND status != 'NEW'
        `, [listId]);

        console.log(`[Recycling] Successfully reset ${updateResult.rowCount} leads to NEW inside list ${listId} for Campaign: ${campaignId}.`);
        
        // Clear the cache hopper for this campaign so the new leads get loaded cleanly
        await redis.del(`gescall:hopper:${campaignId}`);
        console.log(`[Recycling] Cleared redis hopper for campaign ${campaignId}.`);
        console.log(`[Recycling] The dialer will pick these leads up automatically if the campaign is active.`);
        
    } catch (e) {
        console.error(`[Recycling] Error:`, e.message);
    } finally {
        process.exit(0);
    }
}

// Check if run directly
if (require.main === module) {
    const args = process.argv.slice(2);
    const listId = args[0];
    recycleList(listId);
}

module.exports = recycleList;
