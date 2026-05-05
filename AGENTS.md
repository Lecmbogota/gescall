# AGENTS.md — GesCall

## Repository layout

```
back/         Node.js + Express + Socket.IO backend (npm, port 3001)
front/        React + TypeScript + Vite frontend (npm, port 5173)
dialer-go/    Go outbound dialer engine (binary, PM2-managed)
database_schemas/  PostgreSQL dump files
deploy-package/    Dialplan mínimo + install.sh (sin AGI; IVR por ARI/Stasis)
installer/    Bare-metal install/setup scripts
```

Each of the three main dirs has its own dependency manifest and `node_modules` (or `go.sum`). They are **separate packages** — run commands from the relevant directory, never from root.

## Development commands

```bash
# Backend (auto-reload via nodemon)
cd back && npm run dev          # → localhost:3001

# Frontend (Vite HMR dev server)
cd front && npm run dev         # → localhost:5173

# Frontend production build (outputs to /var/www/gescall, not dist/)
cd front && npm run build

# Go dialer (build & run)
cd dialer-go && go build -o gescall-dialer . && ./gescall-dialer
```

There is **zero test, lint, typecheck, or CI configuration**. No `eslint`, no `prettier`, no GitHub Actions, no pre-commit hooks. TypeScript strict mode is **off** (`front/tsconfig.json` → `"strict": false`). Do not run or configure these unless asked.

A `tsc --noEmit` check will report pre-existing errors in `CampaignDetailPage`, `Dashboard`, `DraggableSection`, and `SwaggerDocs` — these are not related to your changes.

## Production deployment (bare-metal, no Docker)

PM2 manages the backend + dialer:

```bash
pm2 start ecosystem.config.js   # → gescall-backend (port 3001) + gescall-dialer
```

Nginx serves the frontend at port 8081 (`host-nginx.conf`). The frontend build writes directly to `/var/www/gescall` (see `front/vite.config.ts` → `build.outDir`). El mismo `host-nginx.conf` incluye **`location /ws`** hacia Asterisk (`transport-ws`, típicamente puerto **8088**): el WebRTC/JsSIP del agente usa `wss://<host>/ws`; si falta ese bloque, el navegador verá **502** en el handshake y el estado SIP quedará desconectado.

Required infrastructure services (started via systemd): PostgreSQL 16, Redis, ClickHouse, Asterisk 16+, Piper TTS (Python, port 5000).

## Environment variables

**back/.env** — manually loaded by `server.js` at startup (not `dotenv.config()`; reads with `fs + dotenv.parse`). The Go dialer reads this **same file** via a hardcoded absolute path: `/opt/gescall/back/.env` (`dialer-go/main.go:25`). Migrations also parse this file the same way before requiring `pgDatabase`.

**ARI (`ariService.js`):** solo PostgreSQL (`pg`); no hay pool MySQL ni tablas `vicidial_*` en el motor IVR. `ariService.init(io)` en `server.js`.

Key non-obvious vars the Go dialer needs:
- `ARI_URL`, `ARI_USER`, `ARI_PASS` — Asterisk REST Interface (default `http://127.0.0.1:8088`)
- `REDIS_URL` — Redis connection string (shared with Node backend for hopper data)
- `DIALER_INTERVAL_MS`, `DIALER_MAX_CONCURRENT`, `DIALER_MAX_CPS` — pacing controls
- `SBC_ENDPOINT`, `SBC_HOST`, `SBC_PORT`, `SBC_PREFIX` — SIP trunk routing

**front/.env** — Vite's built-in env loading (`VITE_API_URL=/api`, `VITE_SOCKET_URL=/`). At runtime the frontend also checks `localStorage.systemSettings` first, falling back to env vars — URL changes don't require a rebuild.

`.env*` patterns are gitignored (see root `.gitignore`).

## Architecture & data flow (outbound call)

1. **Hopper fill**: Cron/Node task pushes leads from PostgreSQL into Redis lists (`gescall:hopper:<campaign_id>`)
2. **Go dialer tick**: Reads hopper per active campaign, atomically claims leads in PG (`status = 'DIALING'`)
3. **ARI Originate**: Sends `POST /ari/channels` to Asterisk with app `gescall-ivr`, passing lead/campaign vars
4. **Stasis event**: Asterisk hits Node backend, which controls the call (IVR via Piper TTS, or transfer to human agent)
5. **WebSocket to frontend**: Backend pushes real-time agent/call state via Socket.IO
6. **Cleanup**: Call log written to PostgreSQL; later archived to ClickHouse

Circuit breaker logic in the dialer pauses dialing after 3 consecutive ARI failures to avoid burning leads.

## Auth

JWT authentication backed by PostgreSQL (`gescall_users` + `gescall_roles`). Login endpoint (`/api/auth/login`) supports RSA-encrypted credentials (public key at `/api/auth/pubkey`) and bcrypt password comparison. All `/api/*` routes require a valid Bearer token except `/api/auth/login`. User sessions include role-based permissions from `gescall_role_permissions`.

Rate limiting: 200 req/min on `/api`, 10 req/15min on `/api/auth/login`.

## Frontend conventions

- **SPA routing**: Manual page switching via React state (`currentPage` in `App.tsx`), not a router library.
- **Dual service pattern**: El front usa dos fuentes de datos (GesCall nativo):
  1. `services/api.ts` — singleton `ApiService`; REST al backend Node (`/api/*`)
  2. `services/socket.ts` — singleton `SocketService`; Socket.IO para eventos en tiempo real, progreso de carga, etc.
- **Path alias**: `@/` resolves to the frontend project root (`./`), **not** `src/`.
- **State**: LocalStorage + React hooks + Zustand (`stores/`). No Redux.
- **UI library**: Radix UI primitives + shadcn/ui components + Tailwind CSS 4 (`@tailwindcss/postcss` plugin).
- **Widget system**: Dashboard uses `react-grid-layout` with adaptive sizing (`sm`/`md`/`lg`/`xl`) driven by ResizeObserver.
- **Agent workspace**: The agent interface (`AgentWorkspace.tsx`) includes a WebPhone (JaSIP/RTC), widget sidebar, and call typification modal that auto-opens when a call transitions from connected → idle.
- **vite.config.ts** `build.outDir` is `/var/www/gescall` — never write to `dist/`.

## Backend conventions

- **Database**: PostgreSQL nativo (`pg`). GesCall no depende de Vicidial; el panel y el dialer usan solo tablas `gescall_*`.
- **Routes are all under `/api/*`** with JWT auth middleware (`middleware/jwtAuth.js`).
- **Socket.IO** events are defined in `sockets/index.js`, not in `server.js` directly.
- **Migrations**: Mixed format — `.js` scripts (`back/migrations/`) and raw `.sql` files. JS migrations follow a three-digit numbering prefix (`015_<name>.js`). Run JS migrations with `node migrations/<name>.js` from `back/`. Migrations manually parse `.env` before requiring `pgDatabase` — standalone `node -e` scripts that use `pgDatabase` directly will fail unless you replicate this pattern.
- **pgDatabase pool**: Exports `query(text, params)` and `pool` (for transactions). Max pool size is 500 (not the default 10).
- **Swagger docs** auto-generated at `/api/docs` (UI) and `/api/docs.json` (spec), with role-based endpoint filtering.
- **CLI tools**: En `back/cli/` y `back/tools/` hay utilidades PG/SSH y pruebas sueltas. **No hay MySQL** en el producto ni scripts archivados en el repo; el esquema es solo PostgreSQL (`back/migrations/`, `back/scripts/*.sql` donde aplique).

## Call typification (tipificaciones)

Per-campaign call classifications with optional custom forms. Database tables:
- `gescall_typifications` — typifications per campaign (name, category, form_id, sort_order)
- `gescall_typification_forms` — custom form definitions per campaign
- `gescall_typification_form_fields` — fields within a form (text, number, select, date, textarea, email, phone)
- `gescall_typification_results` — submitted results with `form_data` JSONB

API routes at `/api/typifications/` (JWT-protected):
- CRUD for typifications, forms, and fields under `campaigns/:campaignId/...`
- `POST /submit` — save a typification result
- `GET /call-logs/:logId/typification` — fetch typification for a call log

Configuration UI: `CampaignDetailPage.tsx` has a "Tipificaciones" tab backed by `CampaignTypifications.tsx`.
Agent UI: `AgentWorkspace.tsx` loads typifications dynamically for the agent's assigned campaign, grouped by category (Contactado / No Contactado), and renders custom form fields when a typification with an associated form is selected.

## References

- `front/CLAUDE.md` — Detailed frontend architecture, component tree, Vicibroker usage, widget development patterns, data flow diagrams. Authoritative for frontend work.
- `README.md` — High-level architecture diagram and component overview.
- `deploy-package/GESCALL_REPLICATION_GUIDE.md` — Despliegue Asterisk + PostgreSQL (sin MySQL/Vicidial); checklist y verificación `psql`.
