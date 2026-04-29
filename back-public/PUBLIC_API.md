# Public API (Gescall)

Este backend es independiente del actual y expone rutas bajo `/api/public`.

Puerto sugerido: `PUBLIC_API_PORT=3002`.

Todas las rutas están bajo `/api/public` y requieren API key (excepto el endpoint de login).

## Autenticación

### Obtener API Key (Login)

Este endpoint **NO requiere autenticación** y devuelve un API Key:

```
POST /api/public/auth/login
{
  "username": "api_user",
  "password": "api_pass"
}
```

**Respuesta:**
```json
{
  "success": true,
  "api_key": "tu_api_key_unico_generado",
  "expires_at": "2024-04-15T10:30:00.000Z",
  "message": "Login exitoso"
}
```

**Nota importante:**
- Cada login genera un **nuevo API Key único** diferente
- Los API Keys tienen un **tiempo de expiración de 90 días** desde su creación
- Los API Keys expirados se marcan automáticamente como inactivos
- Después de la expiración, será necesario hacer un nuevo login para obtener un nuevo API Key

**Configuración de múltiples usuarios:**

En el archivo `.env`, puedes configurar múltiples usuarios de dos formas:

**Formato 1:** Usuario y contraseña en la misma variable (separados por `:`):
```bash
API_LOGIN_CREDENTIALS=usuario1:contraseña1,usuario2:contraseña2,usuario3:contraseña3
```

**Formato 2:** Usuarios y contraseñas separados (mapeados por índice):
```bash
API_LOGIN_USER=desarrollo,test,produccion
API_LOGIN_PASS=123456,abcd,pass123
```
En este formato, el primer usuario (`desarrollo`) se mapea con la primera contraseña (`123456`), el segundo usuario (`test`) con la segunda contraseña (`abcd`), etc.

**Formato único (un solo usuario):**
```bash
API_LOGIN_USER=usuario
API_LOGIN_PASS=contraseña
```

### Usar API Key

Una vez obtenido el API Key, úsalo en los demás endpoints:
- Header `x-api-key: <API_KEY>`
- o `Authorization: Bearer <API_KEY>`

## Campañas

Crear campaña:
```
POST /api/public/campaigns
{
  "campaign_name": "Mi Nueva Campaña",
  "playback_mode": "tts",
  "user_group_list": "publicapi"  // Opcional
}
```

**Parámetros:**
- `campaign_name` (requerido): Nombre de la campaña
- `playback_mode` (requerido): `"tts"` o `"static_audio"` - Tipo de reproducción
- `user_group_list` (opcional): ID del grupo de usuarios. Si no se proporciona, se usa "APIGROUP" por defecto. Si el grupo no existe, se crea automáticamente.

**Notas:**
- El `campaign_id` se genera automáticamente de forma incremental (API0001, API0002, etc.)
- Usa automáticamente la campaña "PRUEBAS" como template
- La campaña se asigna al grupo "APIGROUP" por defecto (o al especificado en `user_group_list`)
- **Siempre se crea automáticamente:**
  - Un usuario asociado al grupo de la campaña
  - Un remote agent para ese usuario, asignado a la campaña con estado ACTIVE
- El audio se asigna mediante otra API (ver sección Audio)

**Respuesta:**
```json
{
  "success": true,
  "campaign_id": "API0001",
  "playback_mode": "tts"
}
```

Activar/Desactivar:
```
POST /api/public/campaigns/NEWCAMP/activate
POST /api/public/campaigns/NEWCAMP/deactivate
```

Playback (TTS o audio estático):
```
PUT /api/public/campaigns/NEWCAMP/playback
{
  "playback_mode": "static_audio",
  "audio_filename": "gc_newcamp.wav"
}
```

Consultar playback:
```
GET /api/public/campaigns/NEWCAMP/playback
```

## Listas y Leads

Crear lista:
```
POST /api/public/lists
{
  "list_name": "Lista Enero",
  "campaign_id": "NEWCAMP",
  "active": "Y",
  "list_description": "Carga API"
}
```

Cargar leads (JSON):
```
POST /api/public/lists/12345/leads
{
  "leads": [
    { "phone_number": "573001112233", "first_name": "Ana", "last_name": "Diaz" }
  ]
}
```

Cargar leads (CSV):
```
POST /api/public/lists/12345/leads
Content-Type: multipart/form-data
file=@/path/leads.csv
```

## Reportes

Dial Log:
```
POST /api/public/reports/dial-log
{
  "campaigns": ["NEWCAMP"],
  "startDatetime": "2026-01-01 00:00:00",
  "endDatetime": "2026-01-31 23:59:59",
  "limit": 500000
}
```

Call Log:
```
POST /api/public/reports/call-log
{
  "campaigns": ["NEWCAMP"],
  "startDatetime": "2026-01-01 00:00:00",
  "endDatetime": "2026-01-31 23:59:59",
  "limit": 500000
}
```

Call Summary:
```
POST /api/public/reports/call-summary
{
  "campaigns": ["NEWCAMP"],
  "startDatetime": "2026-01-01 00:00:00",
  "endDatetime": "2026-01-31 23:59:59"
}
  "endDatetime": "2026-01-31 23:59:59"
}
```

## Llamadas

Enviar llamada (External Dial):
- `agent_user`: Opcional. Si no se envía, usa el configurado por defecto.
- `phone_number`: Requerido.

```
POST /api/public/v1/calls
{
  "phone_number": "3001234567"
}
```
o especificando agente:
```
POST /api/public/v1/calls
{
  "agent_user": "agente101",
  "phone_number": "3001234567"
}
```

## Audio

Listar audios:
```
GET /api/public/audio
```

Subir audio:
```
POST /api/public/audio/upload
Content-Type: multipart/form-data
audio=@/path/audio.wav
campaign=NEWCAMP
```
