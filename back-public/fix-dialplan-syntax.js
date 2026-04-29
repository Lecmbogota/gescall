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

// Replace lines wrapping with EXTEN} that strictly end there (missing parenthesis)
// sed rule: If line contains Dial(SIP and ends with {EXTEN}, replace {EXTEN} with {EXTEN})
// We use simple quote ' for JS string, so we escape \ properly
const cmd1 = "sed -i '/Dial(SIP/s/\\${EXTEN}$/\\${EXTEN})/' /etc/asterisk/extensions-vicidial.conf";
const verify = 'grep "Dial(SIP" /etc/asterisk/extensions-vicidial.conf | grep "EXTEN}"';
const reload = 'asterisk -rx "dialplan reload"';

const command = [cmd1, 'echo "--- Verifying ---"', verify, 'echo "--- Reloading ---"', reload].join('\n');

console.log('Fixing Dialplan Syntax via SSH...\n');

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
