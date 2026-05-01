require('dotenv').config();
const db = require('./services/databaseService');

async function debugCampaign() {
    const campaignNameTerm = 'Pruebas';
    console.log(`Searching for campaign with term: ${campaignNameTerm}`);

    const campaigns = await db.executeQuery(`SELECT campaign_id, campaign_name, active, dial_method, dial_status_a, lead_filter_id, local_call_time FROM vicidial_campaigns WHERE campaign_name LIKE ?`, [`%${campaignNameTerm}%`]);

    if (campaigns.length === 0) {
        console.log('No campaign found.');
        process.exit(0);
    }

    for (const camp of campaigns) {
        console.log(`\n------------------------------------------------`);
        console.log(`Campaign: [${camp.campaign_id}] ${camp.campaign_name}`);
        console.log(`Status: ${camp.active}`);
        console.log(`Dial Method: ${camp.dial_method}`);
        console.log(`Dial Status A: ${camp.dial_status_a}`); // Usually NEW
        console.log(`Local Call Time: ${camp.local_call_time}`);

        // Check Hopper
        const hopperCount = await db.executeQuery(`SELECT count(*) as cnt FROM vicidial_hopper WHERE campaign_id = ?`, [camp.campaign_id]);
        console.log(`Leads in Hopper: ${hopperCount[0].cnt}`);

        // Check Lists active for this campaign
        const lists = await db.executeQuery(`SELECT list_id, active, list_name FROM vicidial_lists WHERE campaign_id = ?`, [camp.campaign_id]);
        console.log(`Active Lists: ${lists.filter(l => l.active === 'Y').length} / ${lists.length}`);
        lists.forEach(l => {
            console.log(` - List [${l.list_id}] ${l.list_name}: Active=${l.active}`);
        });

        // Check Leads status summary
        const leads = await db.executeQuery(`
        SELECT vl.status, count(*) as cnt 
        FROM vicidial_list vl 
        JOIN vicidial_lists vls ON vl.list_id = vls.list_id 
        WHERE vls.campaign_id = ? 
        GROUP BY vl.status
    `, [camp.campaign_id]);

        console.log('Leads Status Summary:');
        console.table(leads);

        // Check recent call logs (last 10)
        const logs = await db.executeQuery(`
        SELECT call_date, phone_number, status, length_in_sec, term_reason 
        FROM vicidial_log 
        WHERE campaign_id = ? 
        ORDER BY call_date DESC 
        LIMIT 10
    `, [camp.campaign_id]);

        console.log('Last 10 Calls:');
        if (logs.length > 0) {
            console.table(logs);
        } else {
            console.log('No calls recorded yet.');
        }
    }
    process.exit(0);
}

debugCampaign().catch(err => {
    console.error(err);
    process.exit(1);
});
