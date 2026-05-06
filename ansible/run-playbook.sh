#!/bin/bash
# run-playbook.sh — Carga credenciales locales y ejecuta el playbook
# Uso: ./ansible/run-playbook.sh provision.yml --limit cliente01
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

for ENV_FILE in "$SCRIPT_DIR/.env" "$SCRIPT_DIR/semaphore/.env"; do
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    echo "✓ Loaded $ENV_FILE"
  fi
done

ansible-playbook -i "$SCRIPT_DIR/inventory/clients.yml" "$SCRIPT_DIR/$1" "${@:2}"