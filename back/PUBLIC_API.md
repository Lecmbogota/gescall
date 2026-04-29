# Public API (Gescall)

Este backend es independiente del actual y expone rutas bajo `/api/public`.

Puerto sugerido: `PUBLIC_API_PORT=3002`.

Todas las rutas están bajo `/api/public` y requieren API key.

Autenticación:
- Header `x-api-key: <API_KEY>`
- o `Authorization: Bearer <API_KEY>`

## Campañas

Crear campaña (clonando plantilla):
```
POST /api/public/campaigns
{
  "campaign_id": "NEWCAMP",
  "campaign_name": "Nueva Campaña",
  "template_campaign_id": "LEGAXI12",
  "active": "N",
  "playback_mode": "tts",
  "audio_filename": "gc_legaxi12.wav"
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
```

## Llamadas

Enviar llamada (External Dial - Agente debe estar logueado):
```
POST /api/public/calls
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
