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

## Widgets con Datos Reales

Después del reset, verás estos widgets con datos de Vicibroker:

- **Nivel de Hopper**: Total de leads en cola
- **Nivel Auto-Marcado**: Promedio de auto_dial_level
- **Campañas Activas**: Campañas con active='Y'
- **Listas Totales**: Número total de listas
- **Total de Leads**: Suma de todos los leads
- **Estado de Campañas**: Tabla con detalles de cada campaña
- **Listas por Campaña**: Tabla con todas las listas

## Configurar Campañas

Para cambiar las campañas que se muestran:

1. Ve a Configuración del Sistema (solo usuario 'desarrollo')
2. Agrega el campo `defaultCampaigns` en la configuración
3. Ejemplo:
```json
{
  "apiUrl": "http://164.92.67.176:3001/api",
  "socketUrl": "http://164.92.67.176:3001",
  "vicibrokerUrl": "http://209.38.233.46:8095",
  "defaultCampaigns": ["LEGAXI01", "LEGAXI03", "CAMP03"]
}
```
4. Guarda y recarga

## Solución de Problemas

### El Dashboard sigue en blanco

1. Verifica que Vicibroker esté corriendo en `http://209.38.233.46:8095`
2. Abre la consola del navegador y busca errores de conexión
3. Verifica que las campañas existan en Vicidial

### No se muestran datos

1. Verifica que las campañas especificadas existan en tu sistema
2. Revisa los logs en la consola: `[Dashboard] Data received`
3. Asegúrate de que Vicibroker esté respondiendo correctamente
