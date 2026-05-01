require('dotenv').config({ path: '/opt/gescall/back/.env' });
const { Client } = require('ssh2');

const sshConfig = {
    host: process.env.VICIDIAL_SSH_HOST || '209.38.233.46',
    port: 22,
    username: process.env.VICIDIAL_SSH_USER || 'root',
    password: process.env.VICIDIAL_SSH_PASSWORD,
    readyTimeout: 20000,
    keepaliveInterval: 5000,
    tryKeyboard: true,
};

// Direct DB query to test the pool selection logic
const command = `
echo "--- Campaign Settings for PRUEBAS ---"
mysql -u cron -p1234 -D asterisk -e "SELECT * FROM gescall_campaign_callerid_settings WHERE campaign_id = 'PRUEBAS'"

echo ""
echo "--- Pool Numbers (Pool 2) ---"
mysql -u cron -p1234 -D asterisk -e "SELECT id, callerid, area_code, is_active, rr_order FROM gescall_callerid_pool_numbers WHERE pool_id = 2 ORDER BY rr_order ASC"

echo ""
echo "--- Recent Auto Calls (see uniqueids) ---"
mysql -u cron -p1234 -D asterisk -e "SELECT uniqueid, campaign_id, phone_number FROM vicidial_auto_calls LIMIT 5"
`;

console.log('Testing Pool Query...\n');

const conn = new Client();

conn.on('ready', () => {
    conn.exec(command, (err, stream) => {
        if (err) {
            console.error('Exec error:', err);
            conn.end();
            return;
        }
        let output = '';
        stream.on('close', (code) => {
            console.log(output);
            conn.end();
        }).on('data', (data) => {
            output += data;
        }).stderr.on('data', (data) => {
            output += data;
        });
    });
});

conn.on('error', (err) => {
    console.error('SSH Connection error:', err.message);
    process.exit(1);
});

conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
    finish([sshConfig.password]);
});

conn.connect(sshConfig);
