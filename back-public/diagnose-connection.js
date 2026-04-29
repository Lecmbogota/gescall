require('dotenv').config();
const db = require('./services/databaseService');

async function diagnose() {
    const listId = '544553223542';
    console.log(`Checking List: ${listId}`);

    // 1. Check List Campaign
    const lists = await db.executeQuery(`SELECT list_id, list_name, active, campaign_id FROM vicidial_lists WHERE list_id = ?`, [listId]);

    if (lists.length === 0) {
        console.log('List not found!');
    } else {
        const list = lists[0];
        console.log(`List belongs to campaign: ${list.campaign_id}`);
        console.log(`List Active: ${list.active}`);

        // 2. Check Campaign Status
        const campaigns = await db.executeQuery(`SELECT campaign_id, campaign_name, active, hopper_level FROM vicidial_campaigns WHERE campaign_id = ?`, [list.campaign_id]);
        if (campaigns.length > 0) {
            const camp = campaigns[0];
            console.log(`Campaign [${camp.campaign_id}] Active: ${camp.active}`);
            console.log(`Hopper Level: ${camp.hopper_level}`);

            if (camp.active === 'N') {
                console.log('Campaign is INACTIVE. Activating...');
                await db.executeQuery(`UPDATE vicidial_campaigns SET active = 'Y' WHERE campaign_id = ?`, [camp.campaign_id]);
                console.log('Campaign ACTIVATED.');
            }

            if (camp.hopper_level < 10) {
                console.log('Hopper level too low. Increasing to 50...');
                await db.executeQuery(`UPDATE vicidial_campaigns SET hopper_level = 50 WHERE campaign_id = ?`, [camp.campaign_id]);
            }
        } else {
            console.log('Parent campaign not found!');
        }
    }

    process.exit(0);
}

diagnose().catch(err => {
    console.error(err);
    process.exit(1);
});
