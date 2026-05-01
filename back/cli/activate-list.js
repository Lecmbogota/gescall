require('dotenv').config();
const db = require('./services/databaseService');

async function fix() {
    const listId = '544553223542';
    console.log(`Activating List: ${listId}`);
    await db.executeQuery(`UPDATE vicidial_lists SET active = 'Y' WHERE list_id = ?`, [listId]);
    console.log(`List ${listId} is now ACTIVE.`);
    process.exit(0);
}

fix().catch(err => {
    console.error(err);
    process.exit(1);
});
