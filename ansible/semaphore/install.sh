#!/bin/bash
# ============================================================
# Deploy Ansible Semaphore on existing server
# Usa PostgreSQL existente, no necesita Docker
# ============================================================
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/gescall/ansible/semaphore/.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${PG_PASSWORD:?PG_PASSWORD is required}"
: "${SEMAPHORE_ADMIN_PASSWORD:?SEMAPHORE_ADMIN_PASSWORD is required}"
: "${SEMAPHORE_ENCRYPTION_KEY:?SEMAPHORE_ENCRYPTION_KEY is required}"

echo "=== Installing Ansible Semaphore ==="

# 1. Install runtime dependencies
apt-get update
apt-get install -y ansible postgresql-client wget tar
ansible-galaxy collection install -r /opt/gescall/ansible/requirements.yml

# 2. Download Semaphore binary
SEM_VER="v2.18.1"
ARCH="linux_amd64"
mkdir -p /opt/semaphore
if [ ! -x /opt/semaphore/semaphore ]; then
  wget -q -O /tmp/semaphore.tar.gz \
    "https://github.com/semaphoreui/semaphore/releases/download/${SEM_VER}/semaphore_${SEM_VER}_${ARCH}.tar.gz"
  tar xzf /tmp/semaphore.tar.gz -C /opt/semaphore
  chmod +x /opt/semaphore/semaphore
  rm /tmp/semaphore.tar.gz
fi

# 3. Create database
PGPASSWORD="${PG_PASSWORD}" psql -h 127.0.0.1 -U gescall_admin -d gescall_db -c \
  "CREATE DATABASE semaphore OWNER gescall_admin;" 2>/dev/null || echo "DB semaphore already exists"

# 4. Semaphore config
cat > /opt/semaphore/config.json << CONFEOF
{
  "postgres": {
    "host": "127.0.0.1",
    "port": "5432",
    "user": "gescall_admin",
    "pass": "${PG_PASSWORD}",
    "name": "semaphore",
    "sslmode": "disable"
  },
  "tmp_path": "/tmp/semaphore",
  "cookie_hash": "${SEMAPHORE_ENCRYPTION_KEY}",
  "cookie_encryption": "${SEMAPHORE_ENCRYPTION_KEY}",
  "max_parallel_tasks": 20
}
CONFEOF
chmod 600 /opt/semaphore/config.json
mkdir -p /tmp/semaphore

# 5. Setup database schema
/opt/semaphore/semaphore setup --config /opt/semaphore/config.json

# 6. Create admin user
/opt/semaphore/semaphore user add \
  --config /opt/semaphore/config.json \
  --name Admin \
  --email admin@localhost \
  --login admin \
  --password "${SEMAPHORE_ADMIN_PASSWORD}" || echo "Admin user already exists"

# 7. Create systemd service
cat > /etc/systemd/system/semaphore.service << UNITEOF
[Unit]
Description=Ansible Semaphore
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
ExecStart=/opt/semaphore/semaphore server --config /opt/semaphore/config.json
Restart=always
RestartSec=5
WorkingDirectory=/opt/semaphore
EnvironmentFile=-${ENV_FILE}
Environment=SEMAPHORE_PLAYBOOK_PATH=/opt/gescall/ansible
Environment=ANSIBLE_HOST_KEY_CHECKING=False
Environment=TZ=America/Bogota

[Install]
WantedBy=multi-user.target
UNITEOF

systemctl daemon-reload
systemctl enable semaphore
systemctl start semaphore

echo ""
echo "==========================================="
echo "  Ansible Semaphore installed"
echo "  URL: http://$(hostname -I | awk '{print $1}'):3000"
echo "  Login: admin / <SEMAPHORE_ADMIN_PASSWORD>"
echo "==========================================="
