# Reset Dashboard

Si el Dashboard muestra widgets antiguos o en blanco después de la actualización, sigue estos pasos:

## Opción 1: Usar el botón de Debug (Solo para usuario 'desarrollo')

1. Inicia sesión como `desarrollo/desarrollo`
2. Ve al Dashboard
3. Haz clic en el botón "🐛 Debug" en la esquina superior derecha
4. Abre la consola del navegador (F12)
5. Ejecuta: `localStorage.clear()`
6. Recarga la página (F5)

## Opción 2: Limpiar manualmente desde la consola

1. Abre la consola del navegador (F12)
2. Ejecuta los siguientes comandos uno por uno:

```javascript
localStorage.removeItem('dashboardWidgets');
localStorage.removeItem('dashboardLayouts');
```

3. Recarga la página (F5)

## Opción 3: Usar el menú contextual

1. En el Dashboard, haz clic derecho en el área vacía
2. Selecciona "Restaurar Layout"
3. Luego selecciona "Restablecer Widgets"
4. Recarga la página (F5)

## Widgets con datos (GesCall nativo)

Tras el reset, los KPIs del dashboard se alimentan del **backend GesCall** (PostgreSQL vía REST en `/api/campaigns/...`), no de Vicidial ni de un broker SQL externo.

## Configurar campañas por defecto

Para cambiar las campañas que se muestran:

1. Ve a Configuración del Sistema (solo usuario `desarrollo`)
2. Ajusta `defaultCampaigns` en la configuración guardada en localStorage (IDs de campaña GesCall)
3. Ejemplo mínimo de URLs (sin Vicibroker):

```json
{
  "apiUrl": "http://TU_SERVIDOR:3001/api",
  "socketUrl": "http://TU_SERVIDOR:3001",
  "defaultCampaigns": ["1", "2"]
}
```

4. Guarda y recarga

## Solución de problemas

### El Dashboard sigue en blanco

1. Comprueba que el backend responda (`VITE_API_URL` / login OK)
2. Abre la consola del navegador y busca errores de red o de autenticación
3. Verifica que existan campañas en PostgreSQL (`gescall_campaigns`) y que los IDs en `defaultCampaigns` coincidan

### No se muestran datos

1. Confirma que las campañas indicadas existan en GesCall
2. Revisa la consola: mensajes `[Dashboard]` o errores de `fetch`
3. Comprueba permisos del token JWT y que `/api/campaigns/:id/stats` devuelva 200
