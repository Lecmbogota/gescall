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

const command = `
echo "=== Test 1: Simulating call to 523101234567 (LADA 310) ==="
cd /var/lib/asterisk/agi-bin
echo "" | perl callerid_local_presence.agi 523101234567 2>&1

echo -e "\n=== Test 2: Simulating call to 523151234567 (LADA 315) ==="
echo "" | perl callerid_local_presence.agi 523151234567 2>&1

echo -e "\n=== Test 3: Simulating call to 523191234567 (LADA 319) ==="
echo "" | perl callerid_local_presence.agi 523191234567 2>&1

echo -e "\n=== Test 4: Simulating call to 529991234567 (LADA 999 - no match) ==="
echo "" | perl callerid_local_presence.agi 529991234567 2>&1

echo -e "\n=== Check logs in database ==="
mysql -u cron -p1234 asterisk -e "SELECT campaign_id, callerid_used, area_code_target, selection_result, created_at FROM gescall_callerid_usage_log ORDER BY id DESC LIMIT 6;"

echo -e "\n=== Check CallerID use counts ==="
mysql -u cron -p1234 asterisk -e "SELECT callerid, area_code, use_count, last_used_at FROM gescall_callerid_pool_numbers WHERE pool_id=1 ORDER BY area_code, use_count DESC;"
`;

console.log('Testing CallerID Local Presence AGI...\n');

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
