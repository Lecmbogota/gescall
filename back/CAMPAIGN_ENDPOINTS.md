# Campaign Progress API Endpoints

## Resumen de Endpoints para el Módulo de Campañas

### 1. Obtener Avance de Campaña Individual

**Endpoint:** `POST /api/campaigns/:campaign_id/progress`

**Descripción:** Obtiene el avance de una campaña específica con total de leads, leads procesados y porcentaje de avance.

**Request:**
```http
POST /api/campaigns/LEGAXI01/progress
Content-Type: application/json

{
  "limit": 1000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "campaign_id": "LEGAXI01",
    "total": 5000,
    "avance": 3500,
    "porcentaje": 70.00
  }
}
```

**Estados considerados como "procesados":**
- PU, PM, SVYEXT, SALE, DNC, NI, DC, ADC, SVYHU, SVYVM

---

### 2. Obtener Estadísticas Generales de Campaña

**Endpoint:** `GET /api/campaigns/:campaign_id/stats`

**Descripción:** Obtiene estadísticas completas de una campaña incluyendo totales por tipo de estado.

**Request:**
```http
GET /api/campaigns/LEGAXI01/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "campaign_id": "LEGAXI01",
    "campaign_name": "Legaxi Campaign 01",
    "active": "Y",
    "total_leads": 5000,
    "leads_new": 1500,
    "leads_processed": 3500,
    "leads_answered": 800,
    "leads_no_answer": 500,
    "leads_drop": 200,
    "total_lists": 10
  }
}
```

---

### 3. Obtener Avance por Status

**Endpoint:** `GET /api/campaigns/:campaign_id/progress-status`

**Descripción:** Desglose detallado del avance de campaña por cada status con porcentajes.

**Request:**
```http
GET /api/campaigns/LEGAXI01/progress-status
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "status": "NEW",
      "status_name": "Nuevo",
      "count": 1500,
      "percentage": 30.00
    },
    {
      "status": "PU",
      "status_name": "Pickup",
      "count": 2000,
      "percentage": 40.00
    },
    {
      "status": "AA",
      "status_name": "Auto Answer",
      "count": 800,
      "percentage": 16.00
    }
  ]
}
```

---

### 4. Obtener Avance por Lista

**Endpoint:** `GET /api/campaigns/:campaign_id/lists-progress`

**Descripción:** Progreso detallado de cada lista dentro de la campaña.

**Request:**
```http
GET /api/campaigns/LEGAXI01/lists-progress
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "list_id": 101,
      "list_name": "Lista Principal",
      "active": "Y",
      "total_leads": 1000,
      "leads_new": 200,
      "leads_processed": 800,
      "leads_answered": 150,
      "leads_no_answer": 100,
      "leads_drop": 50,
      "leads_called": 800,
      "progress_percentage": 80.00
    },
    {
      "list_id": 102,
      "list_name": "Lista Secundaria",
      "active": "Y",
      "total_leads": 500,
      "leads_new": 100,
      "leads_processed": 400,
      "leads_answered": 80,
      "leads_no_answer": 50,
      "leads_drop": 20,
      "leads_called": 400,
      "progress_percentage": 80.00
    }
  ]
}
```

---

### 5. Obtener Actividad de Llamadas (Hoy)

**Endpoint:** `GET /api/campaigns/:campaign_id/call-activity`

**Descripción:** Estadísticas de llamadas realizadas hoy para la campaña.

**Request:**
```http
GET /api/campaigns/LEGAXI01/call-activity
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_calls": 450,
    "sales": 25,
    "transfers": 10,
    "drops": 15,
    "no_answer": 150,
    "busy": 50,
    "total_talk_time": 45000,
    "avg_talk_time": 100,
    "active_agents": 8
  }
}
```

---

### 6. Obtener Actividad por Hora (Hoy)

**Endpoint:** `GET /api/campaigns/:campaign_id/hourly-activity`

**Descripción:** Distribución de llamadas y ventas por hora del día actual.

**Request:**
```http
GET /api/campaigns/LEGAXI01/hourly-activity
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "hour": 9,
      "calls": 45,
      "sales": 3,
      "talk_time": 4500
    },
    {
      "hour": 10,
      "calls": 78,
      "sales": 5,
      "talk_time": 7800
    },
    {
      "hour": 11,
      "calls": 92,
      "sales": 8,
      "talk_time": 9200
    }
  ]
}
```

---

### 7. Obtener Performance de Agentes (Hoy)

**Endpoint:** `GET /api/campaigns/:campaign_id/agents-performance`

**Descripción:** Rendimiento de cada agente en la campaña durante el día actual.

**Request:**
```http
GET /api/campaigns/LEGAXI01/agents-performance
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "user": "6001",
      "full_name": "Juan Pérez",
      "total_calls": 85,
      "sales": 8,
      "transfers": 2,
      "total_talk_time": 8500,
      "avg_talk_time": 100,
      "conversion_rate": 9.41
    },
    {
      "user": "6002",
      "full_name": "María García",
      "total_calls": 72,
      "sales": 6,
      "transfers": 1,
      "total_talk_time": 7200,
      "avg_talk_time": 100,
      "conversion_rate": 8.33
    }
  ]
}
```

---

### 8. Obtener Listas de una Campaña

**Endpoint:** `GET /api/campaigns/:campaign_id/lists`

**Descripción:** Lista todas las listas asociadas a una campaña.

**Request:**
```http
GET /api/campaigns/LEGAXI01/lists
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "list_id": 101,
      "list_name": "Lista Principal",
      "campaign_id": "LEGAXI01",
      "active": "Y",
      "list_description": "Lista principal de contactos",
      "list_changedate": "2025-01-15 10:30:00",
      "list_lastcalldate": "2025-11-02 15:45:00",
      "reset_time": null,
      "expiration_date": null
    }
  ]
}
```

---

## Uso en el Frontend

### Ejemplo de uso en React:

```typescript
import api from '@/services/api';

// Obtener avance de campaña
const getCampaignProgress = async (campaignId: string) => {
  try {
    const response = await api.post(`/campaigns/${campaignId}/progress`, {
      limit: 1000
    });

    if (response.data.success) {
      const { total, avance, porcentaje } = response.data.data;
      console.log(`Progreso: ${avance}/${total} (${porcentaje}%)`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

// Obtener estadísticas completas
const getCampaignStats = async (campaignId: string) => {
  try {
    const response = await api.get(`/campaigns/${campaignId}/stats`);

    if (response.data.success) {
      const stats = response.data.data;
      console.log('Estadísticas:', stats);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

// Obtener avance por listas
const getListsProgress = async (campaignId: string) => {
  try {
    const response = await api.get(`/campaigns/${campaignId}/lists-progress`);

    if (response.data.success) {
      const lists = response.data.data;
      lists.forEach(list => {
        console.log(`${list.list_name}: ${list.progress_percentage}%`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

## Notas Importantes

1. **Avance de Campaña:** El endpoint `/progress` calcula el avance basado en los estados finales del lead (PU, PM, SVYEXT, SALE, DNC, NI, DC, ADC, SVYHU, SVYVM).

2. **Datos en Tiempo Real:** Los endpoints de actividad (`call-activity`, `hourly-activity`, `agents-performance`) muestran datos del día actual (desde las 00:00:00).

3. **Porcentajes:** Los porcentajes se calculan con 2 decimales de precisión usando `ROUND()`.

4. **Performance:** Las queries están optimizadas con índices en `campaign_id`, `list_id`, `status` y `call_date`.

5. **Límites:** Por defecto, las queries tienen límites para evitar sobrecarga:
   - Progress: 1000 registros
   - Agents Performance: Top 50 agentes
