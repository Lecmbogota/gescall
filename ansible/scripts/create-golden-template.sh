#!/bin/bash
# ============================================================
# GesCall Golden Template Creator
# Ejecutar UNA SOLA VEZ en un LXC base de Proxmox (Debian 13)
# Crea la imagen maestra que se clonará para cada cliente
# ============================================================
set -e

echo "=== GesCall Golden Template ==="
echo "Este script instala TODO el stack en este LXC."
echo "Al terminar, convierte este LXC en template en Proxmox."
echo ""

# ─── 1. OS Dependencies ────────────────────────────────────
echo "[1/8] Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
  curl wget git ca-certificates gnupg lsb-release \
  build-essential ffmpeg sox nginx golang-go \
  python3 python3-pip python3-psycopg2 \
  postgresql-16 postgresql-client-16 postgresql-contrib \
  redis-server \
  asterisk asterisk-dev asterisk-core-sounds-es

# ─── 2. Node.js 22 ─────────────────────────────────────────
echo "[2/8] Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs

# ─── 3. PM2 ────────────────────────────────────────────────
echo "[3/8] Installing PM2..."
npm install -g pm2

# ─── 4. PostgreSQL setup ───────────────────────────────────
echo "[4/8] Configuring PostgreSQL..."
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'changeme';" 2>/dev/null || true
systemctl enable postgresql
systemctl restart postgresql

# ─── 5. Redis ──────────────────────────────────────────────
echo "[5/8] Configuring Redis..."
systemctl enable redis-server
systemctl restart redis-server

# ─── 6. Asterisk + ARI ─────────────────────────────────────
echo "[6/8] Configuring Asterisk..."
# Enable HTTP for ARI
sed -i 's/^;*enabled=.*/enabled=yes/' /etc/asterisk/http.conf 2>/dev/null || true
sed -i 's/^;*bindaddr=.*/bindaddr=0.0.0.0/' /etc/asterisk/http.conf 2>/dev/null || true
systemctl enable asterisk
systemctl restart asterisk

# ─── 7. Piper TTS ──────────────────────────────────────────
echo "[7/8] Installing Piper TTS..."
mkdir -p /opt/piper
curl -L -o /tmp/piper.tar.gz \
  https://github.com/rhasspy/piper/releases/download/v2023.11.14-2/piper_linux_x86_64.tar.gz
tar -xzf /tmp/piper.tar.gz -C /opt/piper
curl -L -o /opt/piper/es_ES-sharvard-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx
curl -L -o /opt/piper/es_ES-sharvard-medium.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx.json

cat > /usr/local/bin/piper-tts << 'PIPEREOF'
#!/bin/bash
echo "$1" | /opt/piper/piper -m /opt/piper/es_ES-sharvard-medium.onnx -f "$2"
PIPEREOF
chmod +x /usr/local/bin/piper-tts

mkdir -p /var/lib/asterisk/sounds/tts/piper
chown asterisk:asterisk /var/lib/asterisk/sounds/tts/piper

# Piper HTTP server via systemd
cat > /etc/systemd/system/piper-tts.service << 'UNITEOF'
[Unit]
Description=Piper TTS HTTP Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 -m http.server 5000 --directory /var/lib/asterisk/sounds/tts/piper
WorkingDirectory=/var/lib/asterisk/sounds/tts/piper
Restart=always
User=asterisk

[Install]
WantedBy=multi-user.target
UNITEOF
systemctl daemon-reload
systemctl enable piper-tts
systemctl start piper-tts

# ─── 8. Nginx ──────────────────────────────────────────────
echo "[8/8] Configuring Nginx..."
rm -f /etc/nginx/sites-enabled/default
systemctl enable nginx

# ─── Cleanup ───────────────────────────────────────────────
rm -f /tmp/piper.tar.gz
apt-get clean

echo ""
echo "============================================"
echo " Golden template listo."
echo " Ahora en Proxmox: clic derecho al LXC →"
echo " 'Convert to template'"
echo "============================================"
