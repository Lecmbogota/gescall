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

// Escape ALL $ signs with backslash to prevent JS interpretation
const command = `
# Backup
cp /etc/asterisk/extensions-vicidial.conf /etc/asterisk/extensions-vicidial.conf.bak.colombia

# Create the new Colombia dialplan section using cat with quoted heredoc
cat > /tmp/colombia_dialplan.txt << 'ENDOFCONFIG'
exten => _57XXXXXXXX.,1,AGI(callerid_local_presence.agi)
exten => _57XXXXXXXX.,n,NoOp(CallerID Local Presence)
exten => _57XXXXXXXX.,n,GotoIf(\$["\${GESCALL_CID}" = ""]?dial)
exten => _57XXXXXXXX.,n,Set(CALLERID(num)=\${GESCALL_CID})
exten => _57XXXXXXXX.,n,Set(CALLERID(name)=\${GESCALL_CID})
exten => _57XXXXXXXX.,n(dial),Dial(SIP/sbc233/1122\${EXTEN})
exten => _57XXXXXXXX.,n,Hangup()
ENDOFCONFIG

# Find line number of Colombia pattern and replace
LINE_NUM=\$(grep -n "exten => _57XXXXXXXX.,1,Dial" /etc/asterisk/extensions-vicidial.conf | head -1 | cut -d: -f1)
echo "Found Colombia pattern at line: \$LINE_NUM"

if [ -n "\$LINE_NUM" ]; then
    # Delete the old Colombia lines (usually 2 lines: Dial and Hangup)
    sed -i "\${LINE_NUM},+1d" /etc/asterisk/extensions-vicidial.conf
    
    # Insert new content at that line
    sed -i "\$((\$LINE_NUM-1))r /tmp/colombia_dialplan.txt" /etc/asterisk/extensions-vicidial.conf
    
    echo "Colombia dialplan updated!"
else
    echo "Colombia pattern not found!"
fi

echo ""
echo "=== Verify Colombia pattern ==="
grep -n "57XXXXXXXX" /etc/asterisk/extensions-vicidial.conf

echo ""
echo "=== Reload Asterisk dialplan ==="
asterisk -rx "dialplan reload"

rm -f /tmp/colombia_dialplan.txt
`;

console.log('Adding CallerID AGI for Colombia...\n');

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
