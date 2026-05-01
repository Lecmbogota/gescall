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
echo "Checking count before deletion..."
mysql -u root -p1234 -D asterisk -e "SELECT COUNT(*) as ListsCount FROM vicidial_lists WHERE campaign_id='PRUEBAS';"

echo "Deleting lists..."
mysql -u root -p1234 -D asterisk -e "DELETE FROM vicidial_lists WHERE campaign_id='PRUEBAS';"

echo "Checking count after deletion..."
mysql -u root -p1234 -D asterisk -e "SELECT COUNT(*) as ListsCount FROM vicidial_lists WHERE campaign_id='PRUEBAS';"
`;

console.log('Connecting to Remote DB to delete lists for PRUEBAS...\n');

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
