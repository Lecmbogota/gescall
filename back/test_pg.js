const pg = require('./config/pgDatabase');

async function testPrefixes() {
    try {
        const { rows } = await pg.query('SELECT id, prefix, country_name, country_code FROM gescall_campaigns_prefixes WHERE is_active = true ORDER BY country_name ASC');
        console.log("ROWS:", JSON.stringify(rows));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testPrefixes();
