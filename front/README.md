# Vicidial Admin Panel

## 👥 Usuarios del Sistema

El panel incluye dos niveles de acceso:

| Usuario | Contraseña | Descripción |
|---------|-----------|-------------|
| `admin` | `admin` | Usuario administrador con acceso a todas las funciones excepto configuración del sistema |
| `desarrollo` | `desarrollo` | Usuario de desarrollo con acceso completo incluyendo configuración del sistema |

### Diferencias de Permisos

**Usuario `admin`:**
- ✅ Dashboard
- ✅ Campañas
- ❌ Configuración del Sistema

**Usuario `desarrollo`:**
- ✅ Dashboard
- ✅ Campañas
- ✅ **Configuración del Sistema** (exclusivo)

Panel de administración moderno para Vicidial con backend en Node.js, Express y Socket.IO para gestión en tiempo real.

## 🎯 Características

### Frontend (React + TypeScript)
- ✅ Sistema de autenticación con login moderno
- ✅ Dashboard con KPIs en tiempo real
- ✅ Gestión de campañas con vista de cards y lista
- ✅ Modal de carga de leads con 3 pasos
- ✅ Modal de reportes de avance
- ✅ Sidebar responsive y colapsable
- ✅ Secciones arrastrables en el dashboard
- ✅ Integración con Socket.IO para actualizaciones en tiempo real
- ✅ **Panel de configuración completo** con ajustes de backend, Vicidial, dashboard y opciones avanzadas

### Backend (Node.js + Express + Socket.IO)
- ✅ API RESTful completa
- ✅ Integración con Vicidial API
- ✅ WebSocket para comunicación en tiempo real
- ✅ Carga de leads con seguimiento de progreso
- ✅ Gestión de listas, leads, campañas y agentes
- ✅ Actualizaciones automáticas del dashboard cada 5 segundos

## 📋 Requisitos Previos

- Node.js 16+
- npm o yarn
- Acceso a servidor Vicidial con API habilitada
- Usuario de Vicidial con permisos de API

## 🚀 Instalación

### 1. Clonar o descargar el proyecto

```bash
# Si tienes el proyecto en git
git clone <repository-url>
cd vicidial-admin-panel

# O si descargaste el ZIP
unzip vicidial-admin-panel.zip
cd vicidial-admin-panel
```

### 2. Instalar Dependencias del Frontend

```bash
# Instalar dependencias del frontend
npm install
```

### 3. Configurar el Backend

```bash
# Navegar al directorio del servidor
cd server

# Instalar dependencias del backend
npm install

# Crear archivo de configuración
cp .env.example .env

# Editar .env con tus credenciales de Vicidial
nano .env  # o usa tu editor favorito
```

Configurar `server/.env` con tus datos:
```env
PORT=3001
NODE_ENV=development

VICIDIAL_API_URL=http://tu-servidor-vicidial/vicidial/non_agent_api.php
VICIDIAL_API_USER=tu_usuario_api
VICIDIAL_API_PASS=tu_password_api
VICIDIAL_SOURCE=admin_panel

CORS_ORIGIN=http://164.92.67.176:5173
```

### 4. Volver al directorio raíz

```bash
cd ..
```

## 🏃 Ejecutar la Aplicación

### Opción 1: Ejecutar Backend y Frontend por separado

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

### Opción 2: Crear script para ejecutar ambos

Puedes crear un archivo `start.sh`:
```bash
#!/bin/bash
# Iniciar backend en segundo plano
cd server && npm run dev &
BACKEND_PID=$!

# Iniciar frontend
cd .. && npm run dev

# Limpiar al salir
trap "kill $BACKEND_PID" EXIT
```

Hacer ejecutable:
```bash
chmod +x start.sh
./start.sh
```

## 🌐 Acceder a la Aplicación

- **Frontend:** http://164.92.67.176:5173
- **Backend API:** http://164.92.67.176:3001
- **Backend Health Check:** http://164.92.67.176:3001/health

**Credenciales de prueba (mock):**
- Usuario: `admin`
- Contraseña: `admin`

## 📁 Estructura del Proyecto

```
vicidial-admin-panel/
├── server/                      # Backend
│   ├── config/
│   │   └── vicidial.js         # Configuración API Vicidial
│   ├── routes/
│   │   ├── agents.js           # Rutas de agentes
│   │   ├── campaigns.js        # Rutas de campañas
│   │   ├── leads.js            # Rutas de leads
│   │   └── lists.js            # Rutas de listas
│   ├── services/
│   │   └── vicidialApi.js      # Servicio API Vicidial
│   ├── .env.example
│   ├── package.json
│   ├── README.md
│   └── server.js               # Servidor principal
│
├── services/                    # Servicios del frontend
│   ├── api.ts                  # Cliente HTTP
│   └── socket.ts               # Cliente WebSocket
│
├── components/                  # Componentes React
│   ├── Dashboard.tsx
│   ├── Campaigns.tsx
│   ├── Settings.tsx            # Panel de configuración
│   ├── UploadWizard.tsx
│   ├── DashboardLayout.tsx
│   └── ...
│
├── hooks/                       # Custom hooks
│   └── useSettings.ts          # Hook para configuración
│
├── .env.example
├── package.json
├── README.md
└── App.tsx
```

## 🔌 API Endpoints

### Lists
```
GET    /api/lists/:list_id           # Obtener información de lista
POST   /api/lists                    # Crear lista
PUT    /api/lists/:list_id           # Actualizar lista
DELETE /api/lists/:list_id           # Eliminar lista
```

### Leads
```
GET    /api/leads/search             # Buscar leads
GET    /api/leads/:lead_id           # Obtener lead
POST   /api/leads                    # Crear lead
PUT    /api/leads/:lead_id           # Actualizar lead
DELETE /api/leads/:lead_id           # Eliminar lead
```

### Campaigns
```
GET    /api/campaigns                # Obtener campañas
GET    /api/campaigns/:id/hopper     # Obtener hopper
```

### Agents
```
GET    /api/agents/logged-in         # Agentes conectados
GET    /api/agents/:user/status      # Estado de agente
```

## 🔔 Eventos WebSocket

### Emitir desde el cliente:
```javascript
import socket from './services/socket';

// Suscribirse al dashboard
socket.subscribeToDashboard((data) => {
  console.log('Dashboard update:', data);
});

// Crear lista
socket.createList(listData, (response) => {
  console.log('List created:', response);
});

// Cargar leads con progreso
socket.uploadLeads(
  leads,
  listId,
  (progress) => {
    console.log(`Progress: ${progress.percentage}%`);
  },
  (result) => {
    console.log(`Completed: ${result.successful}/${result.total}`);
  }
);
```

## 🛠️ Desarrollo

### Agregar nueva funcionalidad

1. **Backend:** Agregar endpoint en `/server/routes/`
2. **Servicio:** Agregar método en `/services/api.ts` o `/services/socket.ts`
3. **Frontend:** Usar el servicio en tus componentes

### Ejemplo: Agregar nueva ruta

**Backend (`/server/routes/custom.js`):**
```javascript
router.get('/my-endpoint', async (req, res) => {
  const result = await vicidialApi.request({
    function: 'my_function',
    // ... parámetros
  });
  res.json(result);
});
```

**Frontend (`/services/api.ts`):**
```typescript
async myFunction() {
  return this.request('/custom/my-endpoint');
}
```

## 🐛 Solución de Problemas

### El backend no se conecta a Vicidial
- Verificar que `VICIDIAL_API_URL` esté correcta en `.env`
- Verificar credenciales de usuario API
- Comprobar que el usuario tenga permisos de API en Vicidial

### El frontend no se conecta al backend
- Verificar que el backend esté corriendo en el puerto correcto
- Revisar `VITE_API_URL` y `VITE_SOCKET_URL` en `.env`
- Verificar CORS en el backend

### Error de permisos en Vicidial
- El usuario API debe tener `user_level` 8 o superior
- Habilitar permisos específicos según las funciones que uses

## 📝 Funcionalidades Principales

### 1. Panel de Configuración ⚙️
- **Backend**: Configurar URLs de API y WebSocket, probar conexión
- **Vicidial**: Credenciales y URL de la API de Vicidial
- **Dashboard**: Intervalos de actualización, notificaciones, formato de fecha
- **Avanzado**: Timeouts, reintentos, modo debug
- Ver [Guía de Configuración](/docs/SETTINGS.md) para más detalles

### 2. Gestión de Listas
- Crear listas nuevas
- Actualizar configuración
- Ver información detallada
- Eliminar listas

### 3. Gestión de Leads
- Agregar leads individuales
- Carga masiva desde CSV
- Búsqueda por teléfono
- Actualización de datos
- Verificación de duplicados

### 4. Dashboard en Tiempo Real
- KPIs principales actualizados automáticamente
- Avance por lista
- Nivel de marcación
- Llamadas en curso
- Listas activas
- Secciones arrastrables

### 5. Monitoreo de Agentes
- Agentes conectados
- Estado en tiempo real
- Estadísticas de llamadas

## 🔐 Seguridad

- No commitear archivos `.env`
- Usar credenciales seguras
- Implementar rate limiting en producción
- Usar HTTPS en producción
- Validar todos los datos de entrada

## 📚 Documentación Adicional

- [Backend README](./server/README.md)
- [Guía de Configuración](./docs/SETTINGS.md)
- [Vicidial API Documentation](https://www.vicidial.org/docs/NON-AGENT_API.txt)

## 🤝 Contribuir

1. Fork el proyecto
2. Crear una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir un Pull Request

## 📄 Licencia

MIT License

## ✨ Próximas Características

- [x] Panel de configuración completo
- [ ] Autenticación real con JWT
- [ ] Roles y permisos de usuario
- [ ] Reportes avanzados con filtros
- [ ] Exportación de datos
- [ ] Notificaciones en tiempo real
- [ ] Gestión de usuarios
- [ ] Dashboard personalizable
- [ ] Temas dark/light
- [ ] Integración completa con API de Vicidial

---

Desarrollado con ❤️ para Vicidial
