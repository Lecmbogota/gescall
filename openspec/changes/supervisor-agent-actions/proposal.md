## Why

Los supervisores necesitan herramientas integradas desde la tabla de estado en tiempo real para formación, QA y soporte sin depender de la consola del PBX: escuchar llamadas en curso, hablar solo con el agente, desbloquear agentes atascados en pausa y forzar cierre de sesión cuando sea necesario. Sin estas acciones, la supervisión queda limitada a la visualización.

## What Changes

- **Espiar (spy)**: El supervisor puede unirse a una llamada activa del agente en modo escucha (mono o según política del PBX), con indicación clara de grabación/auditoría si aplica.
- **Susurrar (whisper)**: Canal de audio al agente sin que el cliente escuche (vía funcionalidad nativa del conmutador/ARI o equivalente).
- **Pausa → disponible**: Acción explícita para pasar al agente de estado de pausa a disponible (validando que el supervisor tenga permiso y que el estado actual lo permita).
- **Desloguear**: Cerrar sesión remota del agente en la aplicación/cola (invalidar presencia, colgar bridge según política), con confirmación en UI para evitar errores.

## Capabilities

### New Capabilities

- `agent-supervisor-actions`: Acciones de supervisión sobre agentes en la vista de estado en tiempo real: espionaje de llamada, susurro al agente, transición de pausa a disponible y deslogueo remoto, incluyendo permisos, API/backend y UI (columna o menú de acciones).

### Modified Capabilities

- _(Ninguno: no hay requisitos de specs existentes modificados.)_

## Impact

- **Front**: `AgentMonitor` (u otra vista que muestre "Estado de Agentes (Tiempo Real)"), componentes de tabla, posible diálogo de confirmación y estados de carga/error por acción.
- **Back**: Nuevas rutas o ampliación de `routes/agents.js` (u homólogo), autorización por rol/supervisor, integración con **Asterisk ARI** / servicios existentes (`ariService` u otros) para spy/whisper y comandos de agente.
- **Tiempo real**: Posible coordinación con Socket.IO (`dashboard:realtime:update`) para reflejar cambios de estado tras acciones.
- **PBX / red**: Requisitos de canales, grabación y cumplimiento normativo según despliegue.
