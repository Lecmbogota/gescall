# 🚀 GesCall - Enterprise Telephony Platform

GesCall es una plataforma de telefonía autónoma de alto rendimiento (High-Performance Call Center Engine). Su arquitectura ha sido completamente desacoplada de sistemas legados (Vicidial) y reescrita para operar bajo una filosofía de **microsistemas en tiempo real (Bare-Metal / Native)**.

---

## 🏛️ Arquitectura del Sistema

La plataforma se compone de módulos independientes hiper-optimizados que operan bajo un modelo de orquestación nativa:

| Componente | Tecnología | Responsabilidad |
| :--- | :--- | :--- |
| **Dialer Engine** | Golang (Go) | Motor de marcación ultra-rápido. Asigna CallerIDs dinámicamente, lee la cola de llamadas y dispara solicitudes `Originate` directamente al motor de telefonía. |
| **Core Backend** | Node.js (Express + Socket.io) | Orquestador central. Gestiona el enrutamiento IVR (ARI/Stasis), WebSocket en tiempo real para la pantalla del agente, campañas, y reportes consolidados. |
| **Frontend** | React (Vite + Nginx) | Panel de administración y consola de agentes. Proveído nativamente a través de Nginx. |
| **Bases de Datos** | PostgreSQL 15 | Almacenamiento "Caliente" (Hot Storage). Guarda configuración, campañas, leads, y estados operativos. |
| **Caché y Hopper** | Redis | Gestión de sesiones de agentes y cola de marcación (Hopper) ultra-rápida en memoria. |
| **Data Warehouse** | ClickHouse | Almacenamiento "Frío/Analítico" (Cold Storage). Archiva millones de logs telefónicos de forma particionada para consultas instantáneas y evitar bloqueos en PostgreSQL. |
| **Voice AI** | Piper TTS (Python) | Red neuronal para Text-To-Speech (Síntesis de voz dinámica) para flujos conversacionales. |
| **Telephony** | Asterisk (16+) | PBX y Engine ARI (Asterisk REST Interface) subyacente. |

---

## ⚙️ Despliegue Nativo (Bare-Metal)

Todo el ecosistema de GesCall se ejecuta en modo **Host Nativo** para eliminar el *overhead* de red y proxy de los contenedores (NAT), permitiendo que el tráfico de voz RTP (Real-Time Protocol) y la señalización SIP fluyan a máxima velocidad.

### 1. Iniciar la Infraestructura (Bases de Datos)
Las bases de datos corren nativamente como servicios Systemd del host:
- `systemctl start postgresql` (Puerto 5432)
- `systemctl start redis-server` (Puerto 6379)
- `systemctl start clickhouse-server` (Puerto 8123)

### 2. PM2 Ecosystem (Backend + Go Dialer)
La orquestación de la lógica de la aplicación se gestiona centralizadamente con **PM2**. PM2 asegura que, ante cualquier eventualidad, los sistemas se reinicien en menos de 10 milisegundos.

```bash
# Navegar a la raíz del proyecto
cd /opt/gescall

# Arrancar el ecosistema completo
pm2 start ecosystem.config.js

# Monitorear tráfico y logs en tiempo real
pm2 monit
```

### 3. Nginx (Frontend)
El frontend web se compila y se sirve directamente con el Nginx del sistema operativo.
```bash
# Compilar código de producción
cd /opt/gescall/front
npm ci && npm run build

# Nginx sirve los archivos desde el outDir de Vite (p. ej. /var/www/gescall — ver front/vite.config.ts)
sudo systemctl restart nginx
```

---

## 🔄 Flujo de una Llamada Saliente (Outbound)

1. **Inyección:** Un usuario sube una lista de contactos mediante el Backend.
2. **Hopper (Redis):** Una tarea Cron transfiere contactos a Redis (el Hopper) según la cuota de CPS (Llamadas por Segundo) permitidas por las Troncales.
3. **Go Dialer (Disparo):** El motor compilado en Go lee el Hopper, asigna un CallerID dinámico desde la base de datos (PostgreSQL), y envía una instrucción `Originate` nativa al ARI de Asterisk.
4. **Asterisk (Enrutamiento):** Asterisk llama al cliente. Al contestar, la llamada ingresa a la aplicación Stasis `gescall-ivr`.
5. **Backend (Control):** Node.js recibe el evento Stasis. Si es modo IVR, consume `Piper TTS` para hablar. Si es para un Agente Humano, actualiza la interfaz de React vía WebSockets y transfiere la llamada.
6. **Cierre (ClickHouse):** Cuando la llamada termina, se guarda en PostgreSQL. Una vez superado el límite de retención (ej. 30 días), una tarea de mantenimiento comprime los registros en formato NDJSON y los transfiere permanentemente a ClickHouse.

---
*Arquitectura diseñada para escalar a nivel Enterprise sin dependencias de legado.*
