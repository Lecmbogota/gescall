# GesCall — Deploy Automatizado (Proxmox LXC + OVH + Hostinger)

## Arquitectura

```
Proxmox Host (OVH)
├── LXC Template "gescall-golden"        ← creado 1 vez con create-golden-template.sh
├── LXC cliente01 (IP OVH + MAC virtual)
├── LXC cliente02 (IP OVH + MAC virtual)
└── ...

Hostinger DNS
├── cliente01.midominio.com → IP OVH cliente01
├── cliente02.midominio.com → IP OVH cliente02
└── ...
```

## Setup inicial (1 sola vez)

### 1. Crear el LXC template

```bash
# En Proxmox: crear LXC Debian 13 (2 cores, 1GB RAM, 20GB disco)
# Ejecutar dentro del LXC:
bash ansible/scripts/create-golden-template.sh

# En Proxmox: clic derecho al LXC → "Convert to template"
```

### 2. Configurar secretos en GitHub

| Secreto | Valor |
|---|---|
| `PROXMOX_HOST` | IP o dominio del Proxmox (ej: `pve.midominio.com`) |
| `PROXMOX_USER` | `root@pam` |
| `PROXMOX_PASSWORD` | Contraseña de root de Proxmox |
| `HOSTINGER_TOKEN` | Token API de Hostinger |
| `GESCALL_DEPLOY_SSH_KEY` | Llave SSH privada (opcional, el LXC acepta root) |
| `PG_PASSWORD` | Contraseña PostgreSQL (igual en todos los clientes) |
| `ARI_PASS` | Contraseña ARI Asterisk |

### 3. Registrar clientes

Editar `ansible/inventory/clients.yml` con los datos reales de cada cliente:

```yaml
cliente01:
  ovh_ip: 51.91.xxx.101
  ovh_mac: "02:00:00:xx:xx:01"
  ovh_gateway: 51.91.xxx.1
  proxmox_node: pve
  proxmox_template_id: 9000
  lxc_vmid: 101
  lxc_cores: 2
  lxc_memory_mb: 1024
  lxc_disk_gb: 20
  subdomain: cliente01.midominio.com
  dns_zone: midominio.com
  sip_trunk_endpoint: trunk_cliente01
  sip_trunk_host: sip.proveedor.com
  sip_trunk_port: 5060
  sip_trunk_prefix: "57"
```

## Flujo de trabajo

### Nuevo cliente (1 solo comando)

```bash
# Paso 1: Provisionar LXC + DNS
PROXMOX_HOST=pve.midominio.com PROXMOX_USER=root@pam PROXMOX_PASSWORD=... HOSTINGER_TOKEN=... \
  ansible-playbook -i ansible/inventory/clients.yml ansible/provision.yml --limit "cliente01"

# Paso 2: Desplegar GesCall
PG_PASSWORD=... ARI_PASS=... \
  ansible-playbook -i ansible/inventory/clients.yml ansible/configure.yml --limit "cliente01"
```

### Actualizar app en todos los clientes

```bash
GESCALL_VERSION=main PG_PASSWORD=... ARI_PASS=... \
  ansible-playbook -i ansible/inventory/clients.yml ansible/configure.yml
```

### Actualizar un solo cliente

```bash
GESCALL_VERSION=main PG_PASSWORD=... ARI_PASS=... \
  ansible-playbook -i ansible/inventory/clients.yml ansible/configure.yml --limit "cliente07"
```

### Despliegue controlado con Semaphore

Usar `ansible/semaphore-deploy.yml` como playbook único en Semaphore. Este playbook valida que se indique un cliente objetivo antes de ejecutar cambios.

```yaml
deploy_action: configure   # configure | provision | full
target_clients: cliente01
gescall_version: main
allow_all_clients: false
```

Ver `ansible/semaphore/README.md` para la configuración completa del proyecto, inventario, environment y task template.

## GitHub Actions (automático)

| Acción | Disparador | Resultado |
|---|---|---|
| Crear release en GitHub | `release: published` | Corre tests → despliega a TODOS los clientes |
| Workflow Dispatch | Manual en Actions | Elegir rama + clientes + si provisionar LXC nuevo |

### Secretos requeridos en GitHub Actions

Los mismos 7 secretos de arriba, configurados en Settings → Secrets → Actions.

## Playbooks

| Archivo | Propósito |
|---|---|
| `provision.yml` | Clona LXC del template en Proxmox + asigna IP OVH/MAC + crea DNS |
| `configure.yml` | Clona repo, build, .env, migraciones, PM2 reload + health check |
| `semaphore-deploy.yml` | Entrada segura para Semaphore con acción, cliente objetivo y validaciones |
| `site.yml` | Legacy: instalación completa desde cero (sin template) |

## Orden de operaciones

```
provision.yml (1 vez por cliente)
  ├─ Proxmox API: clonar LXC template
  ├─ Proxmox API: asignar MAC + IP OVH + recursos
  ├─ Proxmox API: iniciar LXC
  └─ Hostinger API: crear registro A

configure.yml (cada deploy)
  ├─ Clonar/actualizar repo desde GitHub
  ├─ Template .env con vars por cliente
  ├─ npm ci + build frontend
  ├─ go build dialer
  ├─ Migraciones PostgreSQL
  ├─ PM2 reload
  └─ Health check
```
