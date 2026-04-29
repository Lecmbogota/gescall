# Sistema de Autenticación con Vicidial API

Este documento describe el sistema de autenticación implementado que se conecta con la API de Vicidial NON-AGENT.

## Arquitectura

### 1. Backend (`server/routes/auth.js`)

El backend proporciona dos endpoints:

#### GET `/api/auth/pubkey`
Retorna la clave pública RSA para encriptar credenciales en el frontend.

**Respuesta:**
```json
{
  "success": true,
  "publicKey": "-----BEGIN PUBLIC KEY-----\n..."
}
```

#### POST `/api/auth/login`
Autentica al usuario con Vicidial y retorna información completa de la sesión.

**Request (con encriptación):**
```json
{
  "agent_user_enc": "base64_encrypted_username",
  "password_enc": "base64_encrypted_password"
}
```

**Request (sin encriptación - no recomendado):**
```json
{
  "agent_user": "username",
  "password": "password"
}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "timestamp": "2025-10-29T...",
  "agent_user": "username",
  "user": {
    "user": "username",
    "full_name": "John Doe",
    "user_group": "AGENTS",
    "user_level": "1",
    "active": "Y",
    "email": "user@example.com",
    ...
  },
  "permissions": {
    "user_group": "AGENTS",
    "user_level": 1,
    "active": true,
    "campaigns": ["CAMP01", "CAMP02"],
    "ingroups": ["SALES", "SUPPORT"]
  },
  "userGroupStatus": [...],
  "inGroupStatus": [...],
  "agentStatus": {
    "user": "username",
    "status": "READY",
    "campaign_id": "CAMP01",
    "calls_today": "15",
    ...
  },
  "loggedInAgent": {
    "user": "username",
    "campaign_id": "CAMP01",
    "status": "READY",
    ...
  }
}
```

### 2. Frontend

#### State Management (`stores/authStore.ts`)

Utiliza **Zustand** para gestionar el estado de autenticación con persistencia en localStorage.

**Estado:**
- `session`: Información completa del usuario autenticado
- `isAuthenticated`: Boolean indicando si hay sesión activa
- `loading`: Estado de carga durante operaciones
- `error`: Mensajes de error
- `credentials`: Credenciales almacenadas (opcional, para refresh)

**Acciones:**
- `setSession(session)`: Guarda la sesión del usuario
- `setCredentials(user, pass)`: Guarda credenciales para refresh
- `clearCredentials()`: Limpia credenciales
- `logout()`: Cierra sesión y limpia todo
- `setLoading(loading)`: Actualiza estado de carga
- `setError(error)`: Actualiza error

**Getters:**
- `getUser()`: Retorna datos del usuario
- `getUserLevel()`: Retorna nivel del usuario
- `isAdmin()`: Verifica si es administrador (level >= 9)
- `hasPermission(campaign)`: Verifica acceso a campaña
- `getCampaigns()`: Lista de campañas permitidas
- `getIngroups()`: Lista de ingroups permitidos

#### Auth Service (`services/authService.ts`)

Servicio singleton que maneja la comunicación con la API de autenticación.

**Métodos:**

```typescript
// Login con encriptación RSA
await authService.login(username, password, true);

// Login sin encriptación (dev only)
await authService.login(username, password, false);

// Verificar sesión
const isValid = await authService.verifySession(username, password);

// Logout
authService.logout();
```

#### Componente Login (`components/Login.tsx`)

Actualizado para usar el sistema de autenticación real:

```typescript
import { useAuthStore } from '../stores/authStore';
import authService from '../services/authService';

const { setSession, setCredentials } = useAuthStore();

// En handleSubmit:
const session = await authService.login(username, password, true);
setSession(session);
setCredentials(username, password);
```

## Flujo de Autenticación

### 1. Login Flow

```
Usuario ingresa credenciales
    ↓
Frontend obtiene public key del backend
    ↓
Frontend encripta credenciales con RSA
    ↓
Frontend envía credenciales encriptadas a /api/auth/login
    ↓
Backend desencripta con private key
    ↓
Backend consulta Vicidial API:
  - user_details (info básica)
  - agent_campaigns (campañas y ingroups)
  - user_group_status (permisos del grupo)
  - in_group_status (estado de ingroups)
  - agent_status (estado actual del agente)
  - logged_in_agents (sesión activa)
    ↓
Backend construye objeto de sesión completo
    ↓
Frontend guarda en Zustand store (persiste en localStorage)
    ↓
Usuario autenticado
```

### 2. Session Persistence

El estado de autenticación se persiste automáticamente en localStorage:

```javascript
{
  "state": {
    "session": { /* datos completos */ },
    "isAuthenticated": true
  },
  "version": 0
}
```

Al recargar la página, Zustand restaura automáticamente la sesión.

### 3. Logout Flow

```
Usuario hace logout
    ↓
authStore.logout() limpia estado
    ↓
authService.logout() limpia local state
    ↓
localStorage es limpiado automáticamente
    ↓
Usuario redirigido a login
```

## Uso en Componentes

### Acceder a datos del usuario

```typescript
import { useAuthStore } from '../stores/authStore';

function MyComponent() {
  const { session, isAuthenticated, getUser, isAdmin } = useAuthStore();

  if (!isAuthenticated) {
    return <div>No autorizado</div>;
  }

  const user = getUser();
  const isAdminUser = isAdmin();

  return (
    <div>
      <h1>Bienvenido {user.full_name}</h1>
      {isAdminUser && <AdminPanel />}
    </div>
  );
}
```

### Verificar permisos

```typescript
const { hasPermission, getCampaigns } = useAuthStore();

// Verificar acceso a campaña específica
if (hasPermission('CAMP01')) {
  // mostrar datos de CAMP01
}

// Obtener todas las campañas
const campaigns = getCampaigns();
```

### Mostrar información de sesión

```typescript
import { UserSession } from '../components/UserSession';

// Muestra toda la información del usuario
<UserSession />
```

## Datos Disponibles en Session

### user (VicidialUser)
Información básica del usuario de Vicidial:
- `user`: Username
- `full_name`: Nombre completo
- `user_group`: Grupo del usuario
- `user_level`: Nivel de acceso (1-9)
- `active`: Estado activo (Y/N)
- `email`: Email del usuario
- `phone_login`: Teléfono de login
- Más campos de Vicidial...

### permissions (UserPermissions)
Permisos y accesos:
- `user_group`: Grupo asignado
- `user_level`: Nivel numérico
- `active`: Boolean
- `campaigns`: Array de campaign_ids permitidos
- `ingroups`: Array de ingroup_ids permitidos

### agentStatus (AgentStatus)
Estado actual del agente en Vicidial:
- `user`: Username
- `status`: Estado actual (READY, PAUSED, INCALL, etc.)
- `campaign_id`: Campaña actual
- `calls_today`: Llamadas del día
- `login_time`: Hora de login
- `server_ip`: IP del servidor

### loggedInAgent (LoggedInAgent)
Si el agente está actualmente logueado:
- `user`: Username
- `campaign_id`: Campaña activa
- `status`: Estado
- `sub_status`: Sub-estado
- `calls_today`: Llamadas del día

### userGroupStatus
Array con información del grupo del usuario

### inGroupStatus
Array con información de los ingroups asignados

## Seguridad

### Encriptación RSA

Las credenciales se encriptan en el frontend usando RSA-OAEP con SHA-256:
1. Backend genera par de claves RSA-2048
2. Frontend obtiene public key
3. Frontend encripta credenciales con public key
4. Backend desencripta con private key
5. Credenciales nunca viajan en texto plano

### Best Practices

1. **Siempre usar encriptación en producción:**
   ```typescript
   await authService.login(username, password, true); // ✓ Encriptado
   ```

2. **No almacenar contraseñas en plaintext:**
   ```typescript
   // Solo almacenar si necesitas refresh automático
   setCredentials(username, password);
   // Considerar no almacenar password en producción
   ```

3. **Verificar permisos en frontend Y backend:**
   ```typescript
   // Frontend
   if (!hasPermission('CAMP01')) return null;

   // Backend también debe verificar
   ```

4. **Usar HTTPS en producción:**
   - Las credenciales encriptadas siguen siendo vulnerables sin TLS

5. **Implementar refresh de sesión:**
   ```typescript
   // Verificar sesión cada X minutos
   setInterval(async () => {
     if (credentials) {
       await authService.verifySession(
         credentials.agent_user,
         credentials.password
       );
     }
   }, 15 * 60 * 1000); // Cada 15 minutos
   ```

## Configuración

### Backend (.env)

```env
# Vicidial API
VICIDIAL_API_URL=http://your-vicidial-server/vicidial/non_agent_api.php
VICIDIAL_API_USER=api_user
VICIDIAL_API_PASS=api_password
VICIDIAL_SOURCE=admin_panel

# Server
PORT=3001
CORS_ORIGIN=http://164.92.67.176:5173
```

### Frontend (.env)

```env
VITE_API_URL=http://164.92.67.176:3001/api
VITE_SOCKET_URL=http://164.92.67.176:3001
```

## Testing

### Probar login:

1. Inicia el backend:
   ```bash
   cd server
   npm run dev
   ```

2. Inicia el frontend:
   ```bash
   npm run dev
   ```

3. Ve a http://164.92.67.176:5173

4. Ingresa credenciales de Vicidial válidas

5. Abre la consola del navegador (F12) para ver los logs detallados:
   ```
   [Login] Attempting login for user: username
   [AuthService] Getting public key for encryption...
   [AuthService] Encrypting credentials...
   [AuthService] Sending login request...
   [AuthService] Login successful
   [AuthService] User info: {...}
   [App] Restored session for user: username
   ```

### Ver sesión almacenada:

```javascript
// En consola del navegador
JSON.parse(localStorage.getItem('auth-storage'))
```

## Troubleshooting

### Error: "Failed to get public key"
- Verifica que el backend esté corriendo
- Verifica la URL del API en `.env`

### Error: "Failed to connect to Vicidial"
- Verifica configuración de Vicidial en `server/.env`
- Verifica que Vicidial API esté accesible
- Verifica usuario y contraseña de API

### Error: "Invalid credentials"
- Verifica que el usuario exista en Vicidial
- Verifica que el password sea correcto
- Verifica que el usuario tenga `active='Y'`

### Sesión no persiste
- Verifica que localStorage esté habilitado
- Revisa la consola por errores de Zustand
- Limpia localStorage y reintenta

## Próximas Mejoras

1. **Refresh Token automático**
   - Implementar refresh periódico de sesión
   - Token expiration management

2. **Logout de Vicidial**
   - Implementar endpoint para logout real en Vicidial
   - Usar función `agent_logout` del NON-AGENT API

3. **Session timeout**
   - Detectar inactividad del usuario
   - Logout automático después de X minutos

4. **Multi-factor authentication**
   - Agregar segundo factor de autenticación
   - SMS, email, o TOTP

5. **Role-based access control**
   - Mejorar sistema de permisos basado en roles
   - Restricciones granulares por funcionalidad
