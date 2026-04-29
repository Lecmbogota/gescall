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

console.log('Connecting to remote server:', sshConfig.host);

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Connection ready. Attempting to start MariaDB service...');

    // Command to restart the service and check existing MySQL processes if needed, 
    // but primarily just start the service.
    // Using 'systemctl restart mariadb' to be safe, or 'start' if preferred. 
    // Given it's in a failed state, 'restart' or 'start' should both work. 
    // 'restart' helps if it's in a weird half-state.
    const command = 'systemctl restart mariadb && echo "Service restart command completed"';

    conn.exec(command, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Command exited with code: ' + code);
            if (code === 0) {
                console.log('SUCCESS: MariaDB service restart attempted successfully.');
            } else {
                console.log('FAILURE: Command failed.');
            }
            conn.end();
        }).on('data', (data) => {
            console.log('STDOUT: ' + data);
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
});

conn.on('error', (err) => {
    console.error('SSH Connection Error:', err);
});

conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
    finish([sshConfig.password]);
});

conn.connect(sshConfig);
