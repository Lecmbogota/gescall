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

console.log('Connecting to remote server for log analysis:', sshConfig.host);

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Ready. Fetching logs...');

    // Commands to gather diagnostic info:
    // 1. journalctl for systemd logs around the service failure
    // 2. Locate and tail the mariadb error log
    // 3. Check for OOM kills in dmesg/syslog
    const command = `
        echo "=== JOURNALCTL (Last 50 lines for mariadb) ==="
        journalctl -u mariadb --no-pager -n 50
        
        echo -e "\n=== DMESG (OOM Killer checks) ==="
        dmesg | grep -i "kill" | tail -n 20
        
        echo -e "\n=== MariaDB Error Log Locations ==="
        ls -l /var/log/mysql/error.log 2>/dev/null || echo "No /var/log/mysql/error.log"
        ls -l /var/lib/mysql/*.err 2>/dev/null || echo "No .err files in /var/lib/mysql"
        
        echo -e "\n=== Tailing Discovered Error Log ==="
        # Try standard location first, then datadir
        if [ -f /var/log/mysql/error.log ]; then
            tail -n 50 /var/log/mysql/error.log
        elif compgen -G "/var/lib/mysql/*.err" > /dev/null; then
            tail -n 50 /var/lib/mysql/*.err
        else
            echo "Could not find specific MariaDB error log."
        fi
    `;

    conn.exec(command, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('\nLog fetch completed.');
            conn.end();
        }).on('data', (data) => {
            process.stdout.write(data);
        }).stderr.on('data', (data) => {
            process.stderr.write(data);
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
