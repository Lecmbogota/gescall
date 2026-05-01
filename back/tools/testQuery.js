require('dotenv').config();
const pg = require('./config/pgDatabase');

(async () => {
    try {
        const { rows } = await pg.query("SELECT log_id, call_date, call_status, dtmf_pressed, NOW() as current_time FROM gescall_call_log WHERE lead_id = 125835");
        console.log("DB Rows for lead 125835:");
        console.table(rows);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
})();
