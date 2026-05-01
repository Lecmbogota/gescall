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

// Read SQL files
const calleridPoolsSql = fs.readFileSync('/opt/gescall/back/migrations/create_callerid_pools.sql', 'utf8');
const whitelistSql = fs.readFileSync('/opt/gescall/back/migrations/create_whitelist_prefixes.sql', 'utf8');

// Combine SQL
const allSql = `${calleridPoolsSql}\n\n${whitelistSql}`;

console.log('========================================');
console.log('Connecting to Vicidial server:', sshConfig.host);
console.log('User:', sshConfig.username);
console.log('========================================');

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Connected!');

    // Execute SQL via mysql command with password
    const dbPassword = process.env.DB_PASSWORD || 'test';
    const command = `mysql -u cron -p'${dbPassword}' asterisk << 'EOSQL'
${allSql}
EOSQL`;

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
                console.log('✅ Migration completed successfully!');
            } else {
                console.log('❌ Migration failed with code:', code);
            }
            if (stdout) console.log('STDOUT:', stdout);
            if (stderr) console.log('STDERR:', stderr);
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
    console.log('Keyboard-interactive auth...');
    finish([sshConfig.password]);
});

conn.connect(sshConfig);
