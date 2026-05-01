require('dotenv').config({ path: '/opt/gescall/back/.env' });
const { Client } = require('ssh2');
const fs = require('fs');

const sshConfig = {
    host: process.env.VICIDIAL_SSH_HOST || '209.38.233.46',
    port: 22,
    username: process.env.VICIDIAL_SSH_USER || 'root',
    password: process.env.VICIDIAL_SSH_PASSWORD,
    readyTimeout: 20000,
    keepaliveInterval: 5000,
    tryKeyboard: true,
};

// Try 'full' first, then 'messages' if full doesn't exist
const command = 'tail -n 5000 /var/log/asterisk/full 2>/dev/null || tail -n 5000 /var/log/asterisk/messages';

console.log('Fetching logs via SSH...');

const conn = new Client();
let logData = '';

conn.on('ready', () => {
    conn.exec(command, (err, stream) => {
        if (err) {
            console.error('Exec error:', err);
            conn.end();
            return;
        }

        stream.on('close', (code) => {
            console.log(`Download complete. Bytes: ${logData.length}`);
            fs.writeFileSync('asterisk_logs.txt', logData);

            // Analyze for errors
            analyzeLogs(logData);

            conn.end();
        }).on('data', (data) => {
            logData += data;
        }).stderr.on('data', (data) => {
            // Ignore stderr noise
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

function analyzeLogs(data) {
    const lines = data.split('\n');
    console.log(`\n--- Log Analysis (Last 5000 lines) ---`);

    // Check for recent dialing attempts
    const dialing = lines.filter(l => l.includes('Called SIP/sbc233') || l.includes('Dial('));
    console.log(`Dial attempts found: ${dialing.length}`);
    if (dialing.length > 0) console.log('Last attempt:', dialing[dialing.length - 1]);

    // Check for SIP errors
    const sipErrors = lines.filter(l =>
        l.includes('SIP/2.0 4') ||
        l.includes('SIP/2.0 5') ||
        l.includes('Got SIP response') ||
        l.includes('Cause: ')
    );

    console.log(`Potential SIP Errors/Responses: ${sipErrors.length}`);
    // Show last 10 errors
    sipErrors.slice(-10).forEach(l => console.log(l));

    // Check for AGI errors
    const agiErrors = lines.filter(l => l.includes('AGI') && (l.includes('Error') || l.includes('Script failed')));
    console.log(`AGI Errors: ${agiErrors.length}`);
    agiErrors.slice(-5).forEach(l => console.log(l));

    // Check for our specific fix
    const fixCheck = lines.filter(l => l.includes('GESCALL_CID'));
    console.log(`GESCALL_CID references: ${fixCheck.length}`);
    fixCheck.slice(-5).forEach(l => console.log(l));
}
