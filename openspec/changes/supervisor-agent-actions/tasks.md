## 1. Backend — API y permisos

- [x] 1.1 Definir matriz de estados permitidos para `force-ready` y comportamiento de `logout` con agente `ON_CALL` (alinear con stakeholders y documentar en código).
- [x] 1.2 Añadir middleware o comprobación de rol supervisor/admin en rutas nuevas (reutilizar patrón de rutas protegidas existentes).
- [x] 1.3 Implementar endpoints REST para `spy`, `whisper`, `force-ready` y `remote-logout` sobre `username` del agente objetivo con respuestas de error coherentes.

## 2. Backend — Integración PBX y estado

- [x] 2.1 Implementar servicio de supervisión (p. ej. `supervisorCallService` o extensión acotada de ARI) para resolver canal activo del agente y originar ChanSpy/Snoop/local channel según diseño.
- [x] 2.2 Implementar acción spy (escucha) usando la integración elegida y pruebas en entorno con Asterisk.
- [x] 2.3 Implementar acción whisper (audio supervisor → agente sin cliente) con el modo PBX correspondiente y manejo de fallos.
- [x] 2.4 Implementar `force-ready`: actualizar Redis `gescall:agent:<username>`, `last_change` y emitir `dashboard:realtime:update` / notificación acorde a `agent:state:update`.
- [x] 2.5 Implementar `remote-logout`: marcar offline, cerrar/desvincular sockets del agente y aplicar política de hangup si está definida.

## 3. Observabilidad y seguridad

- [x] 3.1 Añadir logging estructurado (y tabla opcional de auditoría) para actor, acción, agente objetivo y resultado.
- [x] 3.2 Revisar impacto legal/compliance con el despliegue (documentación operativa; flags si aplica).

## 4. Frontend — Tabla tiempo real

- [x] 4.1 Añadir columna o menú de acciones en la vista de estado de agentes en tiempo real (p. ej. `AgentMonitor` o componente equivalente al de la captura).
- [x] 4.2 Cablear llamadas HTTP a los nuevos endpoints con estados de carga y mensajes de error.
- [x] 4.3 Deshabilitar spy/whisper cuando el estado del agente no sea elegible (p. ej. no en llamada); confirmación modal para logout (y otras destructivas).

## 5. Verificación

- [x] 5.1 Pruebas manuales end-to-end: supervisor ejecuta cada acción contra agente de prueba.
- [x] 5.2 Pruebas automáticas mínimas en backend (autorización, rechazo sin llamada activa, transición force-ready).
