#!/bin/bash
# Script para desplegar el playback switch en el servidor Vicidial

set -e

SSH_HOST="${VICIDIAL_SSH_HOST:-209.38.233.46}"
SSH_USER="${VICIDIAL_SSH_USER:-root}"
SSH_PASS="${VICIDIAL_SSH_PASSWORD}"

echo "=== Desplegando Playback Switch AGIs ==="

# Copiar AGIs al servidor
echo "Copiando AGIs..."
sshpass -p "$SSH_PASS" scp /opt/gescall/back/agi-playback-switch.php ${SSH_USER}@${SSH_HOST}:/var/lib/asterisk/agi-bin/
sshpass -p "$SSH_PASS" scp /opt/gescall/back/agi-static-audio.php ${SSH_USER}@${SSH_HOST}:/var/lib/asterisk/agi-bin/

# Dar permisos de ejecución
sshpass -p "$SSH_PASS" ssh ${SSH_USER}@${SSH_HOST} "chmod +x /var/lib/asterisk/agi-bin/agi-playback-switch.php /var/lib/asterisk/agi-bin/agi-static-audio.php"

echo "=== AGIs copiados y configurados ==="
echo "Ejecuta node /opt/gescall/back/update-dialplan-playback-switch.js para actualizar el dialplan"
