# Vicidial Admin Panel - Backend Server

Backend API server for Vicidial Admin Panel with WebSocket support for real-time updates.

## 🚀 Features

- RESTful API for Vicidial management
- WebSocket support with Socket.IO for real-time updates
- Lead upload with progress tracking
- Real-time dashboard updates
- Campaign and agent management
- List management

## 📋 Prerequisites

- Node.js 16+ 
- npm or yarn
- Access to Vicidial API server

## 🔧 Installation

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Edit `.env` with your Vicidial configuration:
```env
PORT=3001
NODE_ENV=development

VICIDIAL_API_URL=http://your-vicidial-server/vicidial/non_agent_api.php
VICIDIAL_API_USER=your_api_user
VICIDIAL_API_PASS=your_api_password
VICIDIAL_SOURCE=admin_panel

CORS_ORIGIN=http://localhost:5173
```

## 🏃 Running the Server

### Development mode (with auto-reload):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

The server will start on port 3001 (or the port specified in .env)

## 📡 API Endpoints

### Lists
- `GET /api/lists/:list_id` - Get list information
- `POST /api/lists` - Create a new list
- `PUT /api/lists/:list_id` - Update a list
- `DELETE /api/lists/:list_id` - Delete a list

### Leads
- `GET /api/leads/search?phone_number=XXX` - Search leads by phone
- `GET /api/leads/:lead_id` - Get lead information
- `POST /api/leads` - Create a new lead
- `PUT /api/leads/:lead_id` - Update a lead
- `DELETE /api/leads/:lead_id` - Delete a lead

### Campaigns
- `GET /api/campaigns` - Get all campaigns
- `GET /api/campaigns/:campaign_id/hopper` - Get campaign hopper

### Agents
- `GET /api/agents/logged-in` - Get logged in agents
- `GET /api/agents/:agent_user/status` - Get agent status

### Health
- `GET /health` - Server health check

## 🔌 WebSocket Events

### Client → Server

- `upload:leads:start` - Start lead upload process
  ```javascript
  { leads: [], list_id: "123" }
  ```

- `dashboard:subscribe` - Subscribe to dashboard updates

- `list:create` - Create a new list
  ```javascript
  { list_id: "123", list_name: "My List", campaign_id: "CAMP" }
  ```

- `list:info:request` - Request list information
  ```javascript
  { list_id: "123" }
  ```

- `agent:status:request` - Request agent status
  ```javascript
  { agent_user: "1000" }
  ```

### Server → Client

- `upload:leads:progress` - Lead upload progress update
  ```javascript
  { total: 100, processed: 50, successful: 48, errors: 2, percentage: 50 }
  ```

- `upload:leads:complete` - Lead upload completed
  ```javascript
  { total: 100, successful: 95, errors: 5, results: [] }
  ```

- `dashboard:update` - Dashboard data update
- `dashboard:realtime:update` - Real-time dashboard update (every 5s)

- `list:create:response` - Response to list creation
- `list:info:response` - Response to list info request
- `agent:status:response` - Response to agent status request

## 🏗️ Project Structure

```
server/
├── config/
│   └── vicidial.js          # Vicidial API configuration
├── routes/
│   ├── agents.js            # Agent endpoints
│   ├── campaigns.js         # Campaign endpoints
│   ├── leads.js             # Lead endpoints
│   └── lists.js             # List endpoints
├── services/
│   └── vicidialApi.js       # Vicidial API service
├── .env.example             # Environment variables example
├── package.json             # Dependencies
├── README.md                # This file
└── server.js                # Main server file
```

## 🔐 Security Notes

- Never commit your `.env` file
- Use strong API credentials
- Implement rate limiting in production
- Use HTTPS in production
- Validate all input data

## 🐛 Debugging

Enable debug logging:
```bash
NODE_ENV=development npm run dev
```

Check server health:
```bash
curl http://localhost:3001/health
```

## 📝 License

MIT
