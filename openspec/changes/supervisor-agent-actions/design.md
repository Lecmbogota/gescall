## Context

GesCall ya expone el estado de agentes en Redis (`gescall:agent:<username>`), actualización por Socket.IO (`agent:state:update`, `dashboard:realtime:update`) y listado vía API (`routes/agents.js`). La UI de supervisión (p. ej. `AgentMonitor`) muestra agentes en tiempo real pero sin acciones de control. La telefonía pasa por Asterisk con ARI (`ariService.js`, app Stasis `gescall-ivr`). El término "whisper" en el código actual se refiere a un tono/prompt al agente al conectar una llamada de cola, **no** al susurro de supervisor; el susurro de supervisión requiere un mecanismo PBX distinto (p. ej. ChanSpy modo `w` / Snoop canal en ARI).

## Goals / Non-Goals

**Goals:**

- Permitir que un usuario supervisor autorizado, desde la tabla de estado en tiempo real, inicie espionaje y susurro sobre la llamada activa de un agente cuando exista canal conocido en Asterisk.
- Permitir forzar transición desde estados equivalentes a pausa (`PAUSED`, `NOT_READY`, variantes documentadas en UI) hacia disponible/listo (`READY` o equivalente GesCall).
- Permitir deslogueo remoto del agente con confirmación explícita, propagando estado `OFFLINE` y cerrando sockets de workspace asociados.
- Centralizar autorización en el backend y dejar errores recuperables en la UI.

**Non-Goals:**

- Implementar cliente softphone del supervisor dentro del navegador sin decidir tecnología WebRTC/WebSocket (solo se delinean opciones).
- Garantizar spy/whisper en despliegues sin acceso AMI/ARI extendido o sin política de grabación definida por el cliente.
- Redefinir el modelo completo de pausas de negocio (códigos de pausa, reportes HR) más allá de la transición solicitada.

## Decisions

1. **Superficie de API**: Exponer endpoints REST (o ampliar `routes/agents.js`) con acciones `POST` idempotentes donde aplique: `/supervisor/agents/:username/spy`, `/whisper`, `/force-ready`, `/logout` (nombres finales a alinear con convención del proyecto). El front solo llama a la API autenticada; no ejecuta comandos AMI desde el navegador.

2. **Integración PBX para spy / susurro**:
   - **Opción preferida (Asterisk)**: Localizar el canal del agente en llamada (variables Stasis, bridges en `activeCalls` o consulta ARI `channels`) y originar un canal local hacia el agente con **ChanSpy** o **Snoop** según versión y API disponible; modo espía = escuchar; modo susurro = hablar al agente sin mezclar audio hacia el cliente (comportamiento depende de aplicación `chanspy` / bridge).
   - **Alternativa**: AMI `Originate` con aplicación `ExtenSpy` o contexto dedicado; mayor acoplamiento a dialplan.
   - **Decisión interina**: Abstraer en un servicio `supervisorCallService` (o extensión de `ariService`) para no mezclar lógica de cola IVR con supervisión.

3. **Force ready**: Actualizar Redis `gescall:agent:<username>` a `READY` (y `last_change`), emitir actualización en tiempo real coherente con `agent:state:update`, y opcionalmente notificar al cliente del agente vía socket para refrescar UI. Rechazar si el agente está `ON_CALL` o en estados donde la política de negocio prohíba el cambio (definir lista blanca en implementación).

4. **Logout remoto**: Reutilizar el mecanismo existente de desconexión (p. ej. invalidar sesión socket por `username`, marcar `OFFLINE` en Redis, alinear con flujo en `sockets/index.js` en `disconnect`). Si hace falta colgar canales activos, delegar en política (configurable: solo marcar offline vs hangup agresivo).

5. **Permisos**: Restringir a rol supervisor/admin (mismo patrón que otras rutas protegidas). Opcional: scope por campaña asignada al supervisor.

6. **Auditoría**: Registrar en log estructurado (y opcionalmente tabla `gescall_audit`) actor, acción, target agent, timestamp, éxito/error.

## Risks / Trade-offs

- **Incumplimiento legal de grabación / escucha** → Documentar en despliegue; opcional banner o requisito de consentimiento interno; limitar acción a roles auditables.
- **Canal no encontrado** (agente no en Stasis o canal distinto) → Respuesta HTTP clara; UI deshabilita spy/whisper si no hay llamada activa según estado `ON_CALL` + verificación backend.
- **Condiciones de carrera** (llamada termina al iniciar spy) → Manejar error de ARI y mensaje al supervisor.
- **Force ready vs estado real del agente** → Riesgo de inconsistencia si el softphone sigue en pausa; mitigación: combinar con notificación al cliente o documentar como "solo cola GesCall".

## Migration Plan

1. Desplegar backend con endpoints detrás de feature flag o permiso.
2. Desplegar front (columna acciones) activada para el mismo rol.
3. Validar en entorno de prueba con una llamada real y un supervisor.
4. Rollback: ocultar UI y desregistrar rutas o devolver 404 si se usa flag.

## Open Questions

- ¿El supervisor usa el mismo WebRTC que el agente o un flujo click-to-call hacia un contexto de spy fijo?
- ¿Política exacta de estados permitidos para `force-ready` y para `logout` con llamada en curso?
- ¿Existe requisito de grabación automática de sesiones de spy?
