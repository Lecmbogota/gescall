const database = require('./config/database');

async function checkCampaigns() {
    try {
        const campaigns = await database.query('SELECT campaign_id, auto_dial_level FROM vicidial_campaigns');
        console.log('Campaigns:', JSON.stringify(campaigns, null, 2));
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkCampaigns();
