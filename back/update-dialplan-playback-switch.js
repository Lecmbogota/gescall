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

// Script para actualizar dialplan con playback switch
// Modifica las extensiones para que después del Dial (cuando la llamada se conecta)
// se ejecute el AGI switch que decide entre TTS y audio estático

const command = `
# Backup
cp /etc/asterisk/extensions-vicidial.conf /etc/asterisk/extensions-vicidial.conf.bak.$(date +%Y%m%d_%H%M%S)

echo "=== Verificando dialplan actual ==="
grep -n "_52XXXXXXXX\|_57XXXXXXXX" /etc/asterisk/extensions-vicidial.conf | head -10

# Para cada patrón (52 y 57), necesitamos modificar el Dial para que llame al AGI después de conectarse
# Opción: Usar 'b' (before) o agregar después del Dial con 'B' (busy) o 'M' (macro)
# O mejor: Modificar para que use GoSub o ejecute el AGI después del Dial exitoso

# Crear dialplan actualizado para 52XXXXXXXX
cat > /tmp/dialplan_52.txt << 'EOF52'
exten => _52XXXXXXXX.,1,AGI(callerid_local_presence.agi)
exten => _52XXXXXXXX.,n,GotoIf(\$["\${GESCALL_CID}" != ""]?gotcid)
exten => _52XXXXXXXX.,n,NoOp(AGI returned empty - Using default)
exten => _52XXXXXXXX.,n,Goto(dial)
exten => _52XXXXXXXX.,n(gotcid),NoOp(Using Pool CID: \${GESCALL_CID})
exten => _52XXXXXXXX.,n,Set(CALLERID(num)=52\${GESCALL_CID})
exten => _52XXXXXXXX.,n,Set(CALLERID(name)=52\${GESCALL_CID})
exten => _52XXXXXXXX.,n,SipAddHeader(P-Asserted-Identity: <sip:52\${GESCALL_CID}@209.38.233.46>)
exten => _52XXXXXXXX.,n(dial),Dial(SIP/sbc233/1122\${EXTEN},45,Tt)
exten => _52XXXXXXXX.,n,NoOp(Call answered - executing playback switch)
exten => _52XXXXXXXX.,n,AGI(agi-playback-switch.php)
exten => _52XXXXXXXX.,n,Hangup()
EOF52

# Crear dialplan actualizado para 57XXXXXXXX
cat > /tmp/dialplan_57.txt << 'EOF57'
exten => _57XXXXXXXX.,1,AGI(callerid_local_presence.agi)
exten => _57XXXXXXXX.,n,GotoIf(\$["\${GESCALL_CID}" != ""]?gotcid)
exten => _57XXXXXXXX.,n,NoOp(AGI returned empty - Using Campaign Default)
exten => _57XXXXXXXX.,n,Goto(dial)
exten => _57XXXXXXXX.,n(gotcid),NoOp(Using Pool CID: \${GESCALL_CID})
exten => _57XXXXXXXX.,n,Set(CALLERID(num)=57\${GESCALL_CID})
exten => _57XXXXXXXX.,n,Set(CALLERID(name)=57\${GESCALL_CID})
exten => _57XXXXXXXX.,n,SipAddHeader(P-Asserted-Identity: <sip:57\${GESCALL_CID}@209.38.233.46>)
exten => _57XXXXXXXX.,n(dial),Dial(SIP/sbc233/1122\${EXTEN},45,Tt)
exten => _57XXXXXXXX.,n,NoOp(Call answered - executing playback switch)
exten => _57XXXXXXXX.,n,AGI(agi-playback-switch.php)
exten => _57XXXXXXXX.,n,Hangup()
EOF57

# Buscar y reemplazar bloques 52XXXXXXXX
echo ""
echo "=== Actualizando patrón 52XXXXXXXX ==="
LINE_START_52=\$(grep -n "exten => _52XXXXXXXX.,1," /etc/asterisk/extensions-vicidial.conf | head -1 | cut -d: -f1)
if [ -n "\$LINE_START_52" ]; then
    # Encontrar dónde termina el bloque (Hangup o siguiente extensión)
    LINE_END_52=\$(awk "NR>\$LINE_START_52 && /^exten => _52XXXXXXXX.,n,Hangup/ {print NR; exit}" /etc/asterisk/extensions-vicidial.conf)
    if [ -z "\$LINE_END_52" ]; then
        # Si no encuentra Hangup, buscar la siguiente extensión o EOF
        LINE_END_52=\$(awk "NR>\$LINE_START_52 && (/^exten =>|^\[/ || NR==\$(wc -l < /etc/asterisk/extensions-vicidial.conf)) {print NR-1; exit}" /etc/asterisk/extensions-vicidial.conf)
    fi
    
    if [ -n "\$LINE_END_52" ]; then
        echo "Eliminando líneas \$LINE_START_52 a \$LINE_END_52"
        sed -i "\${LINE_START_52},\${LINE_END_52}d" /etc/asterisk/extensions-vicidial.conf
        sed -i "\$((\$LINE_START_52-1))r /tmp/dialplan_52.txt" /etc/asterisk/extensions-vicidial.conf
        echo "Bloque 52XXXXXXXX actualizado"
    fi
fi

# Buscar y reemplazar bloques 57XXXXXXXX
echo ""
echo "=== Actualizando patrón 57XXXXXXXX ==="
LINE_START_57=\$(grep -n "exten => _57XXXXXXXX.,1," /etc/asterisk/extensions-vicidial.conf | head -1 | cut -d: -f1)
if [ -n "\$LINE_START_57" ]; then
    LINE_END_57=\$(awk "NR>\$LINE_START_57 && /^exten => _57XXXXXXXX.,n,Hangup/ {print NR; exit}" /etc/asterisk/extensions-vicidial.conf)
    if [ -z "\$LINE_END_57" ]; then
        LINE_END_57=\$(awk "NR>\$LINE_START_57 && (/^exten =>|^\[/ || NR==\$(wc -l < /etc/asterisk/extensions-vicidial.conf)) {print NR-1; exit}" /etc/asterisk/extensions-vicidial.conf)
    fi
    
    if [ -n "\$LINE_END_57" ]; then
        echo "Eliminando líneas \$LINE_START_57 a \$LINE_END_57"
        sed -i "\${LINE_START_57},\${LINE_END_57}d" /etc/asterisk/extensions-vicidial.conf
        sed -i "\$((\$LINE_START_57-1))r /tmp/dialplan_57.txt" /etc/asterisk/extensions-vicidial.conf
        echo "Bloque 57XXXXXXXX actualizado"
    fi
fi

echo ""
echo "=== Verificando dialplan actualizado ==="
grep -A 5 "_52XXXXXXXX\|_57XXXXXXXX" /etc/asterisk/extensions-vicidial.conf | head -20

echo ""
echo "=== Reloading Asterisk dialplan ==="
asterisk -rx "dialplan reload"

# Limpiar
rm -f /tmp/dialplan_52.txt /tmp/dialplan_57.txt

echo ""
echo "=== Dialplan actualizado con playback switch ==="
`;

console.log('Actualizando dialplan con playback switch (TTS/Static Audio)...\n');

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
            process.stdout.write(data);
        }).stderr.on('data', (data) => {
            output += data;
            process.stderr.write(data);
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
