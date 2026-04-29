const pg = require('./config/pgDatabase');
const redis = require('./config/redisClient');

async function main() {
    try {
        console.log("Finding lists for PRUEBAS campaign...");
        const listsResult = await pg.query("SELECT list_id FROM gescall_lists WHERE campaign_id ILIKE 'pruebas'");
        const listIds = listsResult.rows.map(r => r.list_id);
        
        if (listIds.length === 0) {
            console.log("No lists found for PRUEBAS campaign.");
        } else {
            console.log(`Found lists: ${listIds.join(', ')}. Deleting leads...`);
            const deleteResult = await pg.query("DELETE FROM gescall_leads WHERE list_id = ANY($1)", [listIds]);
            console.log(`Deleted ${deleteResult.rowCount} leads from Postgres.`);
        }
        
        console.log("Clearing Redis hopper for PRUEBAS...");
        await redis.del("gescall:hopper:PRUEBAS");
        await redis.del("gescall:hopper:pruebas");
        
        console.log("Done.");
    } catch(e) {
        console.error("Error:", e);
    } finally {
        process.exit();
    }
}
main();
