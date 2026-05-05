# CLAUDE.md

> **2026 — GesCall nativo:** Panel y dialer sobre **PostgreSQL + Redis + Go + ARI**. No hay Vicibroker ni Vicidial API en el camino principal. Dashboard: `services/api.ts` → `/api/campaigns/...`. Tipos de filas: `types/dashboardCampaign.ts`. Párrafos más abajo sobre Vicibroker/Vicidial son **históricos** y pueden ignorarse.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GesCall Manager: React + TypeScript (Vite) y backend Node.js + Express + Socket.IO, con motor de marcación en Go y datos en PostgreSQL (`gescall_*`).

## Development Commands

### Frontend
```bash
npm run dev          # Start Vite dev server on port 5173
npm run build        # TypeScript compilation + Vite build
npm run preview      # Preview production build
```

### Backend
```bash
cd server
npm run dev          # Start backend server with auto-reload on port 3001
npm start            # Start backend in production mode
```

### Running Both Simultaneously
Open two terminals:
1. Terminal 1: `cd server && npm run dev`
2. Terminal 2: `npm run dev`

## Architecture

### Frontend Architecture

**Framework:** React 18 + TypeScript + Vite

**State Management:**
- LocalStorage for persistence (settings, widgets, notes, todos)
- React hooks for local state
- No global state management library

**UI Library:** Radix UI primitives + shadcn/ui components + Tailwind CSS 4.0

**Real-time Communication:**
- REST API via `services/api.ts` (singleton ApiService class) - Node.js backend
- WebSocket via `services/socket.ts` (singleton SocketService class with Socket.IO) - Node.js backend
**Key Patterns:**
- Single-page application with manual routing via state (`currentPage` in App.tsx)
- Component-based architecture with strict TypeScript
- Adaptive widgets using ResizeObserver for responsive layouts
- Context menus throughout the application for advanced actions

### Backend Architecture

**Framework:** Node.js + Express + Socket.IO

**API:** REST bajo `/api/*` contra el backend en `back/` (JWT). Sin integración Vicidial en el flujo principal.

**Real-time Features:**
- Socket.IO events for dashboard updates, lead uploads, agent monitoring
- Periodic dashboard updates every 5 seconds via setInterval
- Progress tracking for batch operations (lead uploads)

**Configuration:** Environment variables via `.env` file in server directory

### Critical Architecture Details

**Triple-Service Pattern:**
The app uses three different services for data operations:
1. **REST API** (`services/api.ts`): CRUD operations, queries, health checks to Node.js backend
2. **WebSocket** (`services/socket.ts`): Real-time updates, batch uploads with progress, dashboard subscriptions to Node.js backend
3. *(Obsoleto)* ~~Vicibroker~~ — eliminado; usar solo REST + Socket del backend GesCall.

**Dynamic Configuration:**
Both API and Socket services check `localStorage.systemSettings` first, then fall back to environment variables. This allows runtime configuration changes without restart.

**Authentication:**
Currently mock authentication with two hardcoded users (see Login.tsx):
- `admin/admin` - Standard access
- `desarrollo/desarrollo` - Full access including system configuration

## Component Structure

**Main Components:**
- `App.tsx` - Root component with authentication and routing
- `DashboardLayout.tsx` - Main layout with sidebar navigation
- `Dashboard.tsx` - Customizable dashboard with draggable widgets (react-grid-layout)
- `Campaigns.tsx` - Campaign management with multiple views
- `Agents.tsx` - Agent monitoring with real-time updates
- `Reports.tsx` - Reporting interface

**Widget System:**
- Located in `components/widgets/`
- All widgets implement adaptive sizing (sm/md/lg/xl) based on container area
- Widget definitions in `Dashboard.tsx` `allWidgets` array
- Widgets persist state to localStorage independently
- See `docs/WIDGETS.md` for full widget documentation

**Agent Monitoring:**
- `AgentMonitor.tsx` - Main monitoring component with real-time updates
- `AgentMonitorCard.tsx` - Grid view
- `AgentMonitorList.tsx` - Table view
- `AgentMonitorHeatmap.tsx` - Efficiency heatmap
- See `docs/AGENT_MONITOR.md` for full documentation

**UI Components:**
- Reusable primitives in `components/ui/` (shadcn/ui pattern)
- Custom context menu system in `components/ContextMenu.tsx`

## Data Flow

### Dashboard Real-time Updates
```
Backend (every 5s) → Socket.IO broadcast → Frontend subscribeToDashboard() → State update → Component re-render
```

### Lead Upload Flow
```
Frontend UploadWizard → Socket emit 'upload:leads:start' → Backend batch processing → Progress events → Frontend progress bar → Complete event
```

### Dashboard / campañas (nativo)
```
Frontend → api.getBulkCampaignsStatus / getBulkListsCount → GET /api/campaigns/:id/stats|lists → PostgreSQL
```

## Vicibroker (obsoleto)

Integración eliminada. No usar `vicibroker.ts` (archivo borrado).

## Path Aliases

TypeScript/Vite path alias configured:
```typescript
"@/*" → "./*"  // Root directory
```

## Key Technical Considerations

**TypeScript Configuration:**
- Strict mode enabled
- Module: ESNext with bundler resolution
- No unused locals/parameters enforcement
- Server directory excluded from TS compilation

**Socket.IO Patterns:**
- Always check connection before emitting
- Clean up listeners after one-time operations (avoid memory leaks)
- Use listener Map to track and remove event handlers
- Reconnection enabled with 5 attempts, 1s delay

**LocalStorage Usage:**
- `systemSettings` — URLs del backend (`apiUrl`, `socketUrl`), `defaultCampaigns`, etc.
- `dashboardLayout` - Widget positions and sizes
- `widgetStates` - Enabled/disabled state per widget
- `favoriteMenu` - User's default menu preference
- Widget-specific keys: `sticky-note-content`, `todo-list-tasks`, etc.

**Widget Development Pattern:**
1. Create component in `components/widgets/`
2. Implement ResizeObserver for adaptive sizing
3. Add to `allWidgets` array in Dashboard.tsx
4. Add render case in `renderWidget()` switch
5. Update `docs/WIDGETS.md`

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
```

### Backend (`back/.env`)
Ver variables en `back/` (PostgreSQL, JWT, Redis, ARI, etc.). GesCall no requiere Vicidial en el flujo principal.

## Important Implementation Notes

**Context Menu System:**
- Right-click menus available throughout the app
- General menu (dashboard): Toggle edit mode, marketplace, restore layout
- Widget menu: Configure, disable widget
- Agent menu: View details, call agent, force pause, disconnect
- Implementation in `components/ContextMenu.tsx`

**Edit Mode for Widgets:**
- Visual indicators: dashed borders, grab cursor, resize handles
- Activated via context menu or dashboard controls
- Smooth transitions (350ms ease-out)
- Layout changes auto-save to localStorage

**Datos reales vs mock:**
- Parte del monitor de agentes puede usar datos de prueba según componente
- KPIs de campaña: REST `api.ts` → `/api/campaigns/*`

## Common Development Tasks

**Adding a New API Endpoint:**
1. Ruta en `back/routes/` y registro en `back/server.js` (o módulo de rutas que use el proyecto)
2. Método en `services/api.ts`
3. Uso en componente con token JWT del `ApiService`

**Adding a New Widget:**
1. Create component in `components/widgets/NewWidget.tsx`
2. Implement adaptive sizing with ResizeObserver
3. Add to `allWidgets` in Dashboard.tsx with metadata
4. Add render case in `renderWidget()` switch
5. Test all size variants (sm/md/lg/xl)

**Adding Real-time Event:**
1. Handler en `back/sockets/` (Socket.IO del backend GesCall)
2. Método en `services/socket.ts`
3. Uso en componente con cleanup en `useEffect`

**Modifying Layout System:**
- Grid system: react-grid-layout (12 columns, 60px rows, 10px margin)
- Layouts stored per breakpoint: lg, md, sm, xs, xxs
- Modify in Dashboard.tsx `layouts` state
- Changes auto-persist via `onLayoutChange`
