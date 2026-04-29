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
    debug: (msg) => console.log('[SSH DEBUG]', msg),
};

console.log('Testing SSH connection to:', sshConfig.host);
console.log('User:', sshConfig.username);
// Don't log password

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Client :: ready');
    conn.exec('uptime', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
            conn.end();
        }).on('data', (data) => {
            console.log('STDOUT: ' + data);
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
});

conn.on('error', (err) => {
    console.error('SSH Client :: error ::', err);
});

conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
    console.log('Connection :: keyboard-interactive');
    finish([sshConfig.password]);
});


conn.connect(sshConfig);
