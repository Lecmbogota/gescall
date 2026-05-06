# Ansible Semaphore Setup

UI web para ejecutar despliegues controlados de GesCall con Ansible.

## Variables

Crear `ansible/semaphore/.env` tomando como base `env.example`:

```bash
cp ansible/semaphore/env.example ansible/semaphore/.env
```

Variables mínimas para desplegar app:

- `PG_PASSWORD`
- `ARI_PASS`
- `SEMAPHORE_ADMIN_PASSWORD`
- `SEMAPHORE_ENCRYPTION_KEY`

Variables adicionales para provisionar LXC/DNS:

- `PROXMOX_HOST`
- `PROXMOX_USER`
- `PROXMOX_PASSWORD`
- `HOSTINGER_TOKEN`

## Opción Docker

```bash
cd ansible/semaphore
docker compose up -d
```

Acceso: `http://<IP>:3000`

Usuario inicial: `admin`

Contraseña inicial: valor de `SEMAPHORE_ADMIN_PASSWORD`.

## Opción systemd

Si instalaste Semaphore como binario en el host:

```bash
cd /opt/gescall
set -a
source ansible/semaphore/.env
set +a
bash ansible/semaphore/install.sh
```

## Configuración recomendada en la UI

Crear un proyecto `GesCall`.

Crear un inventario:

- Nombre: `Clientes GesCall`
- Tipo: `File`
- Path en systemd: `/opt/gescall/ansible/inventory/clients.yml`
- Path en Docker: `/etc/semaphore/playbooks/inventory/clients.yml`

Crear un Environment con las variables sensibles:

- `PG_PASSWORD`
- `ARI_PASS`
- `PROXMOX_HOST`
- `PROXMOX_USER`
- `PROXMOX_PASSWORD`
- `HOSTINGER_TOKEN`
- `GESCALL_REPO` opcional
- `GESCALL_VERSION` opcional

Crear una Task Template:

- Nombre: `GesCall - Deploy controlado`
- Playbook: `semaphore-deploy.yml`
- Inventory: `Clientes GesCall`
- Environment: el environment anterior
- Survey/Extra vars:

```yaml
deploy_action: configure
target_clients: cliente01
gescall_version: main
allow_all_clients: false
install_collections: true
```

Valores de `deploy_action`:

- `configure`: actualiza código, `.env`, dependencias, migraciones, build y PM2.
- `provision`: crea LXC y DNS.
- `full`: ejecuta `provision` y luego `configure`.

`target_clients` es obligatorio para evitar despliegues accidentales a todos los clientes. Para desplegar a todos, dejar `target_clients` vacío o usar `all`, pero confirmar explícitamente con `allow_all_clients: true`.

## Ejecución local equivalente

```bash
cd ansible
set -a
source semaphore/.env
set +a
ansible-playbook -i inventory/clients.yml semaphore-deploy.yml \
  -e deploy_action=configure \
  -e target_clients=cliente01 \
  -e gescall_version=main
```
