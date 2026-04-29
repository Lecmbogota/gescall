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

// Insert SipAddHeader after Set(CALLERID(name)...)
// We match strictly to avoid multiple insertions
const cmd1 = "sed -i '/Set(CALLERID(name)=57\\${GESCALL_CID})/a exten => _57XXXXXXXX.,n,SipAddHeader(P-Asserted-Identity: <sip:57\\${GESCALL_CID}@209.38.233.46>)' /etc/asterisk/extensions-vicidial.conf";

const verify = 'grep "P-Asserted-Identity" /etc/asterisk/extensions-vicidial.conf';
const reload = 'asterisk -rx "dialplan reload"';
const checkTrunk = 'grep -r "sendrpid" /etc/asterisk/';

const command = [cmd1, 'echo "--- Verifying ---"', verify, 'echo "--- Checking SendRPID ---"', checkTrunk, 'echo "--- Reloading ---"', reload].join('\n');

console.log('Adding PAI Header via SSH...\n');

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
