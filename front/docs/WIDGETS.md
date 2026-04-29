# Widgets del Dashboard

## Descripción General

El dashboard de Vicidial cuenta con un sistema modular de widgets que permite personalizar completamente la vista. Los widgets son componentes adaptables que se redimensionan automáticamente según su tamaño en el grid.

## Widgets Disponibles

### Widgets KPI (Key Performance Indicators)

#### 1. **Nivel de Marcación**
- **ID:** `dialing-level`
- **Descripción:** Monitorea el nivel de marcación en tiempo real
- **Tamaño por defecto:** 3x2
- **Categoría:** KPI

#### 2. **Llamadas en Curso**
- **ID:** `calls-in-progress`
- **Descripción:** Visualiza las llamadas activas actualmente
- **Tamaño por defecto:** 3x2
- **Categoría:** KPI

#### 3. **Listas Activas**
- **ID:** `active-lists`
- **Descripción:** Resumen de listas activas en el sistema
- **Tamaño por defecto:** 3x2
- **Categoría:** KPI

#### 4. **Agentes Disponibles**
- **ID:** `available-agents`
- **Descripción:** Cantidad de agentes disponibles para recibir llamadas
- **Tamaño por defecto:** 3x2
- **Categoría:** KPI

#### 5. **Tiempo Promedio**
- **ID:** `average-time`
- **Descripción:** Tiempo promedio de llamadas
- **Tamaño por defecto:** 3x2
- **Categoría:** KPI

#### 6. **Tasa de % Avance**
- **ID:** `success-rate`
- **Descripción:** Porcentaje de llamadas exitosas
- **Tamaño por defecto:** 3x2
- **Categoría:** KPI

#### 7. **Llamadas Totales**
- **ID:** `total-calls`
- **Descripción:** Total de llamadas realizadas
- **Tamaño por defecto:** 3x2
- **Categoría:** KPI

---

### Widgets de Lista

#### 8. **Avance por Lista**
- **ID:** `lists-progress`
- **Descripción:** Tabla detallada del progreso de cada lista
- **Tamaño por defecto:** 12x4
- **Categoría:** List

---

### Widgets de Actividad

#### 9. **Actividad en Tiempo Real**
- **ID:** `activity-realtime`
- **Descripción:** Dashboard de actividad en vivo del call center
- **Tamaño por defecto:** 12x3
- **Categoría:** Activity

---

### Widgets de Productividad ⭐ NUEVO

#### 10. **Nota Adhesiva**
- **ID:** `sticky-note`
- **Descripción:** Toma notas rápidas en tu dashboard
- **Tamaño por defecto:** 3x3
- **Categoría:** Productivity
- **Características:**
  - Múltiples colores disponibles
  - Auto-guardado en localStorage
  - Indicador de cambios sin guardar
  - Adaptable: 3-12 filas según tamaño

#### 11. **Lista de Tareas**
- **ID:** `todo-list`
- **Descripción:** Gestiona tus tareas pendientes
- **Tamaño por defecto:** 4x4
- **Categoría:** Productivity
- **Características:**
  - Agregar/eliminar tareas
  - Marcar como completadas
  - Barra de progreso visual
  - Persistencia en localStorage
  - Diseño degradado índigo/púrpura

---

### Widgets de Utilidad ⭐ NUEVO

#### 12. **Enlaces Rápidos**
- **ID:** `quick-links`
- **Descripción:** Accesos directos a recursos importantes
- **Tamaño por defecto:** 4x3
- **Categoría:** Utility
- **Características:**
  - 6 enlaces predefinidos
  - Grid adaptativo (2-3 columnas)
  - Iconos coloridos por categoría
  - Apertura en nueva pestaña

#### 13. **Reloj Mundial**
- **ID:** `clock-widget`
- **Descripción:** Reloj en tiempo real con zona horaria
- **Tamaño por defecto:** 3x2
- **Categoría:** Utility
- **Características:**
  - Actualización en tiempo real (cada segundo)
  - Muestra fecha completa en español
  - Zona horaria configurable (default: America/Caracas)
  - Diseño oscuro elegante

#### 14. **Calendario**
- **ID:** `calendar-widget`
- **Descripción:** Calendario mensual con eventos
- **Tamaño por defecto:** 4x4
- **Categoría:** Utility
- **Características:**
  - Calendario mensual interactivo
  - Navegación entre meses
  - Resaltado del día actual
  - Soporte para eventos
  - Diseño esmeralda/teal

---

## Cómo Usar los Widgets

### Instalación de Widgets

1. Haz clic en el botón **"Agregar Widget"** en el dashboard
2. Se abrirá el **Marketplace de Widgets**
3. Navega entre las pestañas "Gratuitos" y "Premium"
4. Busca el widget que desees
5. Haz clic en **"Instalar"** o **"Comprar"** según el tipo de widget
6. El widget aparecerá automáticamente en el dashboard

### Organización de Widgets

#### Modo Edición
- **Activar:** Clic derecho en el dashboard → "Activar Edición"
- **Visual feedback:** 
  - Los widgets muestran bordes punteados al hacer hover
  - Aparece un indicador "Editar" en la esquina superior derecha
  - El cursor cambia a "grab" (mano)
  - Las zonas de redimensionamiento se vuelven visibles
- **Arrastrar:** Click y arrastra cualquier parte del widget
- **Redimensionar:** Usa el handle en la esquina inferior derecha (solo visible en modo edición)
- **Menú contextual:** Clic derecho sobre un widget para:
  - Configurar widget
  - Desactivar widget

#### Atajos del Dashboard
- **Clic derecho en el dashboard:** Menú contextual con opciones
  - Activar/Desactivar edición
  - Abrir Marketplace
  - Restaurar layout
  - Restablecer widgets

### Sincronización y Persistencia

- **Layouts:** Se guardan automáticamente en `localStorage`
- **Estados de widgets:** Se sincronizan al agregar/quitar widgets
- **Notas y tareas:** Se guardan automáticamente en `localStorage`

---

## Widgets Adaptativos

Todos los widgets se adaptan a su tamaño con 4 niveles:

- **SM (Small):** < 30,000px²
- **MD (Medium):** 30,000 - 60,000px²
- **LG (Large):** 60,000 - 100,000px²
- **XL (Extra Large):** > 100,000px²

Cada nivel ajusta:
- Tamaño de iconos
- Tamaño de texto
- Padding
- Contenido mostrado
- Información adicional

---

## Debug Mode

Para usuarios con rol "desarrollo":
- Aparece un badge **🐛 Debug** en el header
- Click para ver información de debug en la consola:
  - Lista completa de widgets
  - Estados de widgets
  - Layouts actuales
  - Widgets habilitados

---

## Solución de Problemas

### Los widgets no se muestran después de instalarlos
1. Verifica el modo edición esté activado
2. Haz scroll en el dashboard
3. Si persiste, usa "Restablecer Widgets" en el menú contextual
4. Borra el localStorage: `localStorage.clear()` en consola

### Los widgets se solapan
1. Activa el modo edición
2. Reorganiza manualmente
3. O usa "Restaurar Layout" para volver al diseño original

### Las notas o tareas no se guardan
1. Verifica que el navegador permita localStorage
2. Comprueba que no estés en modo incógnito
3. Revisa la consola para errores

---

## Características Visuales del Modo Edición

### Indicadores Visuales

#### Cuando está INACTIVO (modo normal):
- ❌ Sin zonas de redimensionamiento visibles
- ❌ Sin indicadores de edición
- ✅ Vista limpia y profesional
- ✅ Cursor normal

#### Cuando está ACTIVO (modo edición):
- ✅ Zonas de redimensionamiento visibles en esquinas inferiores derechas
- ✅ Cursor "grab" (mano abierta) al pasar sobre widgets
- ✅ Cursor "grabbing" (mano cerrada) al arrastrar
- ✅ Bordes punteados azules al hacer hover
- ✅ Indicador "Editar" en esquina superior derecha (hover)
- ✅ Placeholder azul semi-transparente al mover widgets
- ✅ Efecto de escala (1.02x) y sombra al arrastrar
- ✅ Transiciones suaves entre estados (350ms ease-out)

### Animaciones

- **Activar/Desactivar modo edición:** 350ms ease-out
- **Hover sobre widget:** 200ms ease-out
- **Arrastrar widget:** Sin transición (respuesta inmediata)
- **Soltar widget:** 350ms ease-out
- **Resize handles:** 250ms ease-out
- **Placeholder:** 150ms ease-out

### Cursores

- **Normal:** Default cursor
- **Modo edición (hover):** `cursor: grab`
- **Arrastrando:** `cursor: grabbing`
- **Redimensionando:** `cursor: se-resize`

---

## Desarrollo de Nuevos Widgets

Para crear un nuevo widget:

1. Crea el componente en `/components/widgets/`
2. Implementa la lógica de redimensionamiento adaptativo
3. Agrega la definición en `allWidgets` en `Dashboard.tsx`
4. Agrega el caso en `renderWidget()` switch
5. Actualiza esta documentación

### Template Básico

```tsx
import { useEffect, useRef, useState } from "react";

type WidgetSize = "sm" | "md" | "lg" | "xl";

export function MyWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>("md");

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        const area = offsetWidth * offsetHeight;
        
        if (area < 30000) setWidgetSize("sm");
        else if (area < 60000) setWidgetSize("md");
        else if (area < 100000) setWidgetSize("lg");
        else setWidgetSize("xl");
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full">
      {/* Widget content */}
    </div>
  );
}
```

---

## Próximas Características

- [ ] Widgets de gráficos avanzados con Recharts
- [ ] Widget de mapa de calor de agentes
- [ ] Widget de predicción con IA
- [ ] Exportar/importar configuración de dashboard
- [ ] Temas personalizados por widget
- [ ] Widget de notificaciones en tiempo real
- [ ] Widget de métricas comparativas
