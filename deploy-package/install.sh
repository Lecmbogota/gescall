#!/bin/bash
#
# GesCall — instalación Asterisk (dialplan + TTS cache)
# El IVR y la lógica de llamada van por ARI/Stasis (Node: ariService.js, app gescall-ivr).
# No se instalan AGIs: no son necesarios para el flujo nativo.
#

echo "=========================================="
echo "  GesCall - Script de Instalación"
echo "=========================================="

if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Este script debe ejecutarse como root"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "[1/4] Copiando dialplan a /etc/asterisk/..."
cp "$SCRIPT_DIR/asterisk/extensions-gescall.conf" /etc/asterisk/
echo "      ✓ Dialplan instalado"

echo ""
echo "[2/4] Agregando include en extensions.conf..."
if ! grep -q "extensions-gescall.conf" /etc/asterisk/extensions.conf; then
    echo "#include extensions-gescall.conf" >> /etc/asterisk/extensions.conf
    echo "      ✓ Include agregado"
else
    echo "      ⚠ Include ya existe, saltando"
fi

echo ""
echo "[3/4] Creando directorio para TTS cache (usado por ARI/Piper)..."
mkdir -p /var/lib/asterisk/sounds/tts/piper
chown asterisk:asterisk /var/lib/asterisk/sounds/tts/piper 2>/dev/null || true
echo "      ✓ Directorio TTS creado"

echo ""
echo "[4/4] Base de datos (PostgreSQL solamente)"
echo "      GesCall no usa MySQL. El esquema se crea con las migraciones del backend:"
echo "        cd /opt/gescall/back && node migrations/<script>.js   (según docs del proyecto)"
echo "      SQL auxiliar PG de ejemplo: back/scripts/migrate_aux_tables_pg.sql"
echo "      ✓ Paso informativo completado"

echo ""
echo "=========================================="
echo "  Instalación completada"
echo "=========================================="
echo ""
echo "Pasos siguientes:"
echo "  1. Recargar dialplan: asterisk -rx 'dialplan reload'"
echo "  2. Asegurar backend Node con ARI_URL/ARI_USER/ARI_PASS y app Stasis gescall-ivr"
echo "  3. Dialer Go / originate deben enviar canales a esa app (sin AGI en dialplan GesCall)"
echo ""
echo "Ver GESCALL_REPLICATION_GUIDE.md para más detalles."
