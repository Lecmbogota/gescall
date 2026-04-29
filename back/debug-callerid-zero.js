require('dotenv').config({ path: '/opt/gescall/back/.env' });
const { Client } = require('ssh2');
const db = require('./services/databaseService');

const sshConfig = {
    host: process.env.VICIDIAL_SSH_HOST || '209.38.233.46',
    port: 22,
    username: process.env.VICIDIAL_SSH_USER || 'root',
    password: process.env.VICIDIAL_SSH_PASSWORD,
    readyTimeout: 20000,
    keepaliveInterval: 5000,
    tryKeyboard: true,
};

async function check() {
    console.log('--- Checking DB Usage Log ---');
    const logs = await db.executeQuery(`SELECT * FROM gescall_callerid_usage_log ORDER BY created_at DESC LIMIT 5`);
    if (logs.length > 0) {
        console.table(logs);
    } else {
        console.log('No recent usage logs found in DB.');
    }

    console.log('\n--- Fetching Asterisk Logs via SSH ---');
    const command = 'tail -n 1000 /var/log/asterisk/messages | grep "GesCall CID" || echo "No GesCall logs found"';

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
                process.exit(0);
            }).on('data', (data) => {
                output += data;
            });
        });
    });

    conn.connect(sshConfig);
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
