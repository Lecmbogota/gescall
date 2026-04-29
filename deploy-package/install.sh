#!/bin/bash
#
# GesCall Deploy Script
# Ejecutar como root en el servidor destino
#

echo "=========================================="
echo "  GesCall - Script de Instalación"
echo "=========================================="

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Este script debe ejecutarse como root"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "[1/5] Copiando AGIs a /var/lib/asterisk/agi-bin/..."
cp "$SCRIPT_DIR/agi-bin/"* /var/lib/asterisk/agi-bin/
chmod +x /var/lib/asterisk/agi-bin/*.agi /var/lib/asterisk/agi-bin/*.php
echo "      ✓ AGIs instalados"

echo ""
echo "[2/5] Copiando dialplan a /etc/asterisk/..."
cp "$SCRIPT_DIR/asterisk/extensions-gescall.conf" /etc/asterisk/
echo "      ✓ Dialplan instalado"

echo ""
echo "[3/5] Agregando include en extensions.conf..."
if ! grep -q "extensions-gescall.conf" /etc/asterisk/extensions.conf; then
    echo "#include extensions-gescall.conf" >> /etc/asterisk/extensions.conf
    echo "      ✓ Include agregado"
else
    echo "      ⚠ Include ya existe, saltando"
fi

echo ""
echo "[4/5] Creando directorio para TTS cache..."
mkdir -p /var/lib/asterisk/sounds/tts/piper
chown asterisk:asterisk /var/lib/asterisk/sounds/tts/piper 2>/dev/null || true
echo "      ✓ Directorio TTS creado"

echo ""
echo "[5/5] Ejecutando migraciones SQL..."
echo "      Ingresa la contraseña de MySQL root:"
for sql_file in "$SCRIPT_DIR/migrations/"*.sql; do
    echo "      Ejecutando: $(basename $sql_file)"
    mysql -u root -p asterisk < "$sql_file"
done
echo "      ✓ Migraciones ejecutadas"

echo ""
echo "=========================================="
echo "  Instalación completada!"
echo "=========================================="
echo ""
echo "Pasos siguientes:"
echo "  1. Recargar dialplan: asterisk -rx 'dialplan reload'"
echo "  2. Configurar pools de CallerID en la base de datos"
echo "  3. Asociar campañas a los pools"
echo ""
echo "Ver GESCALL_REPLICATION_GUIDE.md para más detalles."
