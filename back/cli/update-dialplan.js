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
echo "=== Backup original file ==="
cp /etc/asterisk/extensions-vicidial.conf /etc/asterisk/extensions-vicidial.conf.bak.$(date +%Y%m%d%H%M%S)
ls -la /etc/asterisk/extensions-vicidial.conf.bak.* | tail -3

echo -e "\n=== Replacing aleatorio_callerid.agi with callerid_local_presence.agi ==="
sed -i 's/aleatorio_callerid.agi/callerid_local_presence.agi/g' /etc/asterisk/extensions-vicidial.conf

echo -e "\n=== Verify replacement ==="
grep -n "callerid_local_presence.agi" /etc/asterisk/extensions-vicidial.conf

echo -e "\n=== Reload Asterisk dialplan ==="
asterisk -rx "dialplan reload" 2>&1

echo -e "\n=== Done ==="
`;

console.log('Updating dialplan...\n');

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
