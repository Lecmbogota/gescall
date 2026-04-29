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

// Escaping for JS Template Literal: \${VAR} becomes ${VAR} in the string
const newBlock = `
exten => _57XXXXXXXX.,1,AGI(callerid_local_presence.agi)
exten => _57XXXXXXXX.,n,GotoIf($["\${GESCALL_CID}" != ""]?gotcid)
exten => _57XXXXXXXX.,n,NoOp(AGI returned empty CID - Using Fallback)
exten => _57XXXXXXXX.,n,Set(GESCALL_CID=3196233749)
exten => _57XXXXXXXX.,n(gotcid),NoOp(Using CID: \${GESCALL_CID})
exten => _57XXXXXXXX.,n,Set(CALLERID(num)=57\${GESCALL_CID})
exten => _57XXXXXXXX.,n,Set(CALLERID(name)=57\${GESCALL_CID})
exten => _57XXXXXXXX.,n,SipAddHeader(P-Asserted-Identity: <sip:57\${GESCALL_CID}@209.38.233.46>)
exten => _57XXXXXXXX.,n,Dial(SIP/sbc233/1122\${EXTEN})
exten => _57XXXXXXXX.,n,Hangup()
`;

// Using quoted 'EOF' prevents Bash expansion
const command = `
# Backup
cp /etc/asterisk/extensions-vicidial.conf /etc/asterisk/extensions-vicidial.conf.bak.final

# Delete existing 57 lines
sed -i '/exten => _57XXXXXXXX./d' /etc/asterisk/extensions-vicidial.conf

# Append new block
cat << 'EOF' >> /etc/asterisk/extensions-vicidial.conf
${newBlock}
EOF

# Verify
echo "--- Verifying structure ---"
grep "_57XXXXXXXX" /etc/asterisk/extensions-vicidial.conf

echo "--- Reloading ---"
asterisk -rx "dialplan reload"
`;

console.log('Rewriting Colombia Dialplan Block (Corrected)...\n');

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
