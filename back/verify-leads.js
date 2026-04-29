require('dotenv').config();
const db = require('./services/databaseService');

async function verify() {
    const searchTerm = 'dfdfgutyh';
    console.log(`Searching for list with term: ${searchTerm}`);

    const sql = `SELECT list_id, list_name, active FROM vicidial_lists WHERE list_id = ? OR list_name LIKE ?`;
    const lists = await db.executeQuery(sql, [searchTerm, `%${searchTerm}%`]);

    if (lists.length === 0) {
        console.log('No list found.');
        process.exit(0);
    }

    for (const list of lists) {
        console.log(`\n------------------------------------------------`);
        console.log(`Found List: [${list.list_id}] ${list.list_name} (Active: ${list.active})`);
        const count = await db.getLeadsCountByListId(list.list_id);
        console.log(`Total Leads in vicidial_list: ${count}`);

        const rows = await db.executeQuery(`SELECT status, count(*) as cnt FROM vicidial_list WHERE list_id = ? GROUP BY status`, [list.list_id]);
        console.log('Status Breakdown:');
        console.table(rows);
    }
    process.exit(0);
}

verify().catch(err => {
    console.error(err);
    process.exit(1);
});
