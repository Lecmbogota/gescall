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

// Read AGI file
const agiContent = fs.readFileSync('/opt/gescall/back/agi/callerid_local_presence.agi', 'utf8');
const agiPath = '/var/lib/asterisk/agi-bin/callerid_local_presence.agi';

console.log('========================================');
console.log('Deploying AGI to Vicidial server:', sshConfig.host);
console.log('========================================');

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Connected!');

    // Create AGI file via cat
    const escapedContent = agiContent.replace(/'/g, "'\\''");
    const command = `cat > ${agiPath} << 'EOAGI'
${agiContent}
EOAGI
chmod +x ${agiPath}
chown asterisk:asterisk ${agiPath}
ls -la ${agiPath}`;

    conn.exec(command, (err, stream) => {
        if (err) {
            console.error('Exec error:', err);
            conn.end();
            return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code, signal) => {
            console.log('========================================');
            if (code === 0) {
                console.log('✅ AGI deployed successfully!');
                console.log('Location:', agiPath);
            } else {
                console.log('❌ Deployment failed with code:', code);
            }
            if (stdout) console.log('Output:', stdout);
            if (stderr) console.log('Errors:', stderr);
            console.log('========================================');
            conn.end();
        }).on('data', (data) => {
            stdout += data;
        }).stderr.on('data', (data) => {
            stderr += data;
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
