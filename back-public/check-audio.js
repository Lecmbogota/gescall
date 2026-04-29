require('dotenv').config({ path: '/opt/gescall/back-public/.env' });
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

function checkRemoteFile() {
    const conn = new Client();
    conn.on('ready', () => {
        console.log('SSH Ready');
        // Check for gc_pruebas.wav and also list all gc_ files to be sure
        const cmd = 'ls -l /var/lib/asterisk/sounds/gc_pruebas.wav; echo "---"; ls -l /var/lib/asterisk/sounds/gc_* | head -n 5';
        conn.exec(cmd, (err, stream) => {
            if (err) throw err;
            stream.on('close', (code, signal) => {
                conn.end();
            }).on('data', (data) => {
                console.log(data.toString());
            }).stderr.on('data', (data) => {
                console.log('STDERR: ' + data);
            });
        });
    });
    conn.on('error', (err) => console.error(err));
    conn.connect(sshConfig);
}

checkRemoteFile();
