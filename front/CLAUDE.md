# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GESCALL Manager is a modern Vicidial administration panel built with React + TypeScript frontend and Node.js + Express + Socket.IO backend. The application provides real-time monitoring and management of call center operations through the Vicidial API.

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
- **Vicibroker WebSocket** via `services/vicibroker.ts` (singleton VicibrokerService class) - SQL query broker

**Key Patterns:**
- Single-page application with manual routing via state (`currentPage` in App.tsx)
- Component-based architecture with strict TypeScript
- Adaptive widgets using ResizeObserver for responsive layouts
- Context menus throughout the application for advanced actions

### Backend Architecture

**Framework:** Node.js + Express + Socket.IO

**API Integration:** Vicidial NON-AGENT API via HTTP requests
- Service: `server/services/vicidialApi.js` (singleton VicidialAPI class)
- Routes organized by resource: agents, campaigns, leads, lists
- Pipe-delimited response parser included

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
3. **Vicibroker WebSocket** (`services/vicibroker.ts`): SQL queries for reports, statistics, and campaign data from Vicibroker

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

### Vicidial API Integration
```
Frontend request → Backend route → VicidialAPI service → HTTP request to Vicidial → Parse pipe-delimited response → Return to frontend
```

### Vicibroker Query Flow
```
Frontend component → vicibroker.query() → Socket.IO emit 'query' → Vicibroker server → SQL execution → Socket.IO emit 'result' → Callback/Promise → State update
```

## Vicibroker Integration

**What is Vicibroker:**
Vicibroker is a SQL query broker that exposes Vicidial database queries via WebSocket (Socket.IO). It provides real-time access to call center data for reports, statistics, and campaign monitoring.

**Connection Details:**
- URL: `http://209.38.233.46:8095`
- Path: `/ws`
- Protocol: Socket.IO
- Send Event: `query`
- Receive Event: `result`

**Available Queries:**
1. `dial_log_by_campaign_date_range` - Get call logs by campaign and date
2. `status_summary_by_list` - Get status counts grouped by list
3. `campaign_progress_by_list` - Get campaign progress metrics per list
4. `campaigns_status` - Get current status of campaigns
5. `lists_count_by_campaign` - Get lead counts by list and campaign
6. `progress_for_single_campaign` - Get detailed progress for ONE campaign (not array)

**Query Message Format:**
```typescript
{
  type: 'query',
  name: 'campaigns_status',
  payload: { campaigns: ['CAMP01', 'CAMP02'] }
}
```

**Response Format:**
```typescript
{
  ok: true,
  name: 'campaigns_status',
  rows: [ /* data array */ ],
  meta: { durationMs: 123, rows: 10, ts: '2025-10-28T...' }
}
```

**Using Vicibroker Service:**
```typescript
import vicibroker from '@/services/vicibroker';

// Connect (auto-connects on first query)
vicibroker.connect();

// Query with Promise
const result = await vicibroker.campaignsStatus(['CAMP01', 'CAMP02']);
if (result.ok) {
  console.log(result.rows);
}

// Query with callback
vicibroker.query('campaigns_status',
  { campaigns: ['CAMP01'] },
  (result) => {
    if (result.ok) {
      setData(result.rows);
    }
  }
);
```

**Important Notes:**
- Always validate that `campaigns` array is not empty before queries that require it
- `progress_for_single_campaign` accepts a single string, NOT an array
- Query results include metadata: duration, row count, timestamp
- Use `limit` parameter to prevent huge responses (default: 1000)
- Service auto-reconnects with 5 attempts, 1s delay
- All methods return Promise for async/await usage

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
- `systemSettings` - Backend URLs, Vicidial credentials, dashboard config
- `dashboardLayout` - Widget positions and sizes
- `widgetStates` - Enabled/disabled state per widget
- `favoriteMenu` - User's default menu preference
- Widget-specific keys: `sticky-note-content`, `todo-list-tasks`, etc.

**Vicidial API Response Format:**
- Pipe-delimited text with header row
- Success detection: Check if response contains "ERROR:"
- Parser: `vicidialApi.parseResponse()` converts to array of objects

**Widget Development Pattern:**
1. Create component in `components/widgets/`
2. Implement ResizeObserver for adaptive sizing
3. Add to `allWidgets` array in Dashboard.tsx
4. Add render case in `renderWidget()` switch
5. Update `docs/WIDGETS.md`

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=http://164.92.67.176:3001/api
VITE_SOCKET_URL=http://164.92.67.176:3001
VITE_VICIBROKER_URL=http://209.38.233.46:8095
```

### Backend (server/.env)
```
PORT=3001
NODE_ENV=development
VICIDIAL_API_URL=http://your-vicidial-server/vicidial/non_agent_api.php
VICIDIAL_API_USER=your_api_user
VICIDIAL_API_PASS=your_api_password
VICIDIAL_SOURCE=admin_panel
CORS_ORIGIN=http://164.92.67.176:5173
```

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

**Mock Data:**
- Agent monitoring currently uses mock data (see AgentMonitor.tsx)
- Dashboard KPIs use mock data until Vicidial integration complete
- Campaign data fetched from backend but may be simulated

**Vicidial Integration Status:**
- Backend service fully implemented for: lists, leads, campaigns, agents
- Frontend consumes API for campaign management
- Real-time agent monitoring planned but not yet integrated
- Lead upload with progress tracking fully functional via WebSocket

## Common Development Tasks

**Adding a New API Endpoint:**
1. Add method to `server/services/vicidialApi.js`
2. Create route in `server/routes/[resource].js`
3. Register route in `server/server.js`
4. Add method to `services/api.ts`
5. Use in component

**Adding a New Widget:**
1. Create component in `components/widgets/NewWidget.tsx`
2. Implement adaptive sizing with ResizeObserver
3. Add to `allWidgets` in Dashboard.tsx with metadata
4. Add render case in `renderWidget()` switch
5. Test all size variants (sm/md/lg/xl)

**Adding Real-time Event:**
1. Add Socket.IO event handler in `server/server.js`
2. Add method to `services/socket.ts`
3. Use in component with cleanup in useEffect

**Modifying Layout System:**
- Grid system: react-grid-layout (12 columns, 60px rows, 10px margin)
- Layouts stored per breakpoint: lg, md, sm, xs, xxs
- Modify in Dashboard.tsx `layouts` state
- Changes auto-persist via `onLayoutChange`

**Using Vicibroker in Components:**
1. Import service: `import vicibroker from '@/services/vicibroker'`
2. Connect on mount: `useEffect(() => { vicibroker.connect(); }, [])`
3. Query with async/await:
   ```typescript
   const fetchData = async () => {
     try {
       const result = await vicibroker.campaignsStatus(['CAMP01']);
       if (result.ok) setData(result.rows);
     } catch (error) {
       console.error('Query failed:', error);
     }
   };
   ```
4. Clean up on unmount: `useEffect(() => { return () => vicibroker.disconnect(); }, [])`
5. Handle errors gracefully with try/catch or .catch()
6. Use loading states while querying
