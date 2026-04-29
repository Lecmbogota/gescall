# Monitor de Agentes en Tiempo Real

## Descripción

El Monitor de Agentes es un sistema completo de visualización en tiempo real que permite supervisar el estado, actividad y rendimiento de todos los agentes del call center.

## Características Principales

### 🎯 Estados de Agente

- **Disponible** (Verde): Agente listo para recibir llamadas
- **En Llamada** (Azul): Agente actualmente en una llamada
- **En Pausa** (Amarillo): Agente en descanso o pausa
- **En Disposición** (Morado): Agente completando datos post-llamada
- **Desconectado** (Gris): Agente offline/desconectado

### 📊 Vistas Disponibles

#### 1. Vista Grid (Tarjetas)
Tarjetas individuales por agente mostrando:
- Nombre y extensión
- Estado actual con indicador visual
- Campaña asignada
- Tiempo en estado actual
- Información de llamada actual (si aplica)
- Código de pausa (si aplica)
- Estadísticas del día:
  - Llamadas realizadas
  - Tiempo total en llamadas
  - Tiempo total en pausa

#### 2. Vista Lista (Tabla)
Tabla compacta con columnas:
- Agente (nombre + extensión)
- Estado
- Campaña
- Tiempo en estado
- Llamada actual / Código de pausa
- Llamadas hoy
- Tiempo hablado total

#### 3. Vista Mapa de Calor (Heatmap)
Visualización por eficiencia:
- Agrupación por campaña
- Tarjetas pequeñas con código de colores según eficiencia
- Métricas clave: eficiencia, llamadas, tiempo hablado
- Indicadores de llamada activa
- Escala de colores:
  - Verde: ≥70% eficiencia
  - Amarillo: 50-69% eficiencia
  - Naranja: 30-49% eficiencia
  - Rojo: <30% eficiencia

### 🔄 Actualización en Tiempo Real

- Actualización automática cada segundo
- Contador de tiempo en vivo para:
  - Tiempo en estado actual
  - Duración de llamada en curso
- Indicador visual de actualización automática activa
- Opción para pausar/reanudar actualización

### 🎯 Filtros y Búsqueda

- **Búsqueda**: Por nombre de agente o extensión
- **Estado**: Filtrar por estado específico o ver todos
- **Campaña**: Filtrar por campaña específica o ver todas

### 📈 Estadísticas Generales

Tarjetas de resumen en la parte superior:
1. **Total**: Número total de agentes
2. **Disponibles**: Agentes listos para llamadas
3. **En Llamada**: Llamadas activas actualmente
4. **En Pausa**: Agentes en descanso
5. **Desconectados**: Agentes offline

### 🖱️ Menú Contextual

#### Menú General (clic derecho en cualquier parte):
- Pausar/Reanudar actualización automática
- Forzar actualización manual
- Exportar estado actual
- Configuración del monitor
- Vista pantalla completa

#### Menú por Agente (clic derecho en agente):
- Ver detalles completos
- Llamar a agente
- Forzar pausa
- Desconectar agente
- Configurar agente

## Estructura de Componentes

```
AgentMonitor.tsx (Principal)
├── AgentMonitorCard.tsx (Vista Grid)
├── AgentMonitorList.tsx (Vista Lista)
└── AgentMonitorHeatmap.tsx (Vista Mapa de Calor)
```

## Interfaz de Datos

```typescript
export type AgentStatus = 
  | 'available' 
  | 'incall' 
  | 'paused' 
  | 'disposition' 
  | 'dead';

export interface Agent {
  id: string;
  name: string;
  extension: string;
  status: AgentStatus;
  campaign: string;
  timeInStatus: number; // en segundos
  currentCall?: {
    phoneNumber: string;
    leadId: string;
    duration: number;
    campaignName: string;
  };
  todayStats: {
    calls: number;
    talkTime: number; // en segundos
    pauseTime: number;
    loginTime: number;
  };
  pauseCode?: string;
  lastActivity: string;
}
```

## Integración con Backend

### WebSocket Events (Planeado)

```javascript
// Suscribirse a actualizaciones de agentes
socket.on('agent:update', (agent) => {
  // Actualizar estado de agente individual
});

socket.on('agent:status', (data) => {
  // Actualización de estado
});

socket.on('agent:call:start', (data) => {
  // Nueva llamada iniciada
});

socket.on('agent:call:end', (data) => {
  // Llamada finalizada
});

socket.on('agents:snapshot', (agents) => {
  // Snapshot completo de todos los agentes
});
```

### API REST Endpoints (Planeado)

```
GET  /api/agents              - Obtener todos los agentes
GET  /api/agents/:id          - Obtener agente específico
GET  /api/agents/:id/stats    - Estadísticas de agente
POST /api/agents/:id/pause    - Forzar pausa
POST /api/agents/:id/logout   - Desconectar agente
GET  /api/agents/export       - Exportar estado actual
```

## Uso

### En la aplicación

El monitor está integrado en la sección de Agentes:

```tsx
import { Agents } from './components/Agents';

// El componente Agents tiene dos tabs:
// - Monitor en Tiempo Real (AgentMonitor)
// - Rendimiento (vista de estadísticas)
```

### Acceso directo al componente

```tsx
import { AgentMonitor } from './components/AgentMonitor';

<AgentMonitor username="supervisor" />
```

## Características Técnicas

- ✅ Actualización en tiempo real con useEffect
- ✅ Mock data incluido para desarrollo
- ✅ Responsive design
- ✅ Scroll controlado (solo área de contenido)
- ✅ Menús contextuales integrados
- ✅ Notificaciones toast
- ✅ Animaciones suaves
- ✅ Accesibilidad (ARIA labels)
- ✅ TypeScript types completos

## Próximas Mejoras

- [ ] Integración real con WebSocket
- [ ] Gráficos de tendencias por agente
- [ ] Alertas configurables
- [ ] Exportación a CSV/Excel
- [ ] Vista de supervisor (multi-agente)
- [ ] Grabación de pantalla de agente
- [ ] Chat directo con agente
- [ ] Transferencia de llamadas
- [ ] Configuración de umbrales de alerta
- [ ] Dashboard de supervisor

## Notas de Desarrollo

- Los datos actualmente son mock data
- El intervalo de actualización está hardcoded a 1000ms
- La eficiencia se calcula como: `(tiempo_hablado / tiempo_login) * 100`
- Los estados están basados en la nomenclatura estándar de Vicidial
- Compatible con la API NON-AGENT de Vicidial para integración futura

## Estilos Visuales

- Diseño moderno y limpio
- Código de colores intuitivo por estado
- Indicadores visuales animados (pulse) para estados activos
- Cards con hover effects
- Transiciones suaves
- Glassmorphism en menús contextuales
