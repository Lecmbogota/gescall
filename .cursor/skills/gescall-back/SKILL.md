---
name: gescall-back
description: Guides work on the GesCall Node.js Express backend in back/ (API routes, Socket.IO, PostgreSQL, migrations, .env). Use when editing back/, server.js, routes under /api, sockets, migrations, or when the user mentions backend, API, or port 3001.
disable-model-invocation: true
---

# GesCall backend (back/)

## Scope

Work only inside `back/` unless the task explicitly spans dialer, frontend, or deploy. The repo root is not an npm package — always `cd back` before `npm` scripts.

## Commands

```bash
cd back && npm run dev    # nodemon, localhost:3001
```

There is no project-wide test, lint, or typecheck; do not add or run these unless the user asks.

## Environment

- **`back/.env`**: Loaded manually in `server.js` with `fs` + `dotenv.parse` (not `dotenv.config()`).
- **Go dialer** reads the same file at the hardcoded path `/opt/gescall/back/.env` — keep variable names and paths consistent when changing env layout.
- **Migrations** (JS under `back/migrations/`) parse `.env` the same way before requiring `pgDatabase`. Standalone `node -e` scripts that import `pgDatabase` without that pattern will fail.

## Architecture shortcuts

| Concern | Where |
|--------|--------|
| HTTP API | Routes under `/api/*`, JWT via `middleware/jwtAuth.js` (login and pubkey excluded as documented in AGENTS.md) |
| Realtime | `sockets/index.js` (not all logic in `server.js`) |
| DB access | `pgDatabase` — `query(text, params)` and `pool` (large pool, default not 10) |
| Swagger | `/api/docs`, `/api/docs.json` |
| One-off ops | `back/cli/` |

## Migrations

- Numbered JS migrations: `back/migrations/NNN_<name>.js`.
- Run from `back/`: `node migrations/<name>.js`.
- Mixed with raw `.sql` in the same tree — check format before editing.

## Vicidial / legacy

`services/vicidialApi.js` and `config/vicidial.js` exist as fallback; primary data path is native PostgreSQL. Prefer PG unless the task is explicitly Vicidial-related.

## Full repo context

For end-to-end call flow, frontend triple-service pattern, PM2, and infrastructure, read [AGENTS.md](../../../AGENTS.md) at the repository root.
