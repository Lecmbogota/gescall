const fs = require('fs');
const dotenv = require('dotenv');
if (fs.existsSync('.env')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env'));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

// Native Postgres implementation
const pgDatabase = require('./config/pgDatabase');
const databaseService = require('./services/pgDatabaseService');

// Import routes
const authRoutes = require('./routes/auth');
const listsRoutes = require('./routes/lists');
const campaignsRoutes = require('./routes/campaigns');
const leadsRoutes = require('./routes/leads');
const agentsRoutes = require('./routes/agents');
const dashboardRoutes = require('./routes/dashboard');
const audioRoutes = require('./routes/audio'); 
const dncRoutes = require('./routes/dnc');
const calleridPoolsRoutes = require('./routes/calleridPools');
const schedulesRoutes = require('./routes/schedules');
const ivrFlowsRoutes = require('./routes/ivrFlows');
const trunksRoutes = require('./routes/trunks');
const ticketsRoutes = require('./routes/tickets');
const usersRoutes = require('./routes/users');
const rolesRoutes = require('./routes/roles');
const ttsNodesRoutes = require('./routes/ttsNodes');
const didsRoutes = require('./routes/dids');

const schedulerService = require('./services/schedulerService');
const uploadTaskService = require('./services/uploadTaskService');
const ariService = require('./services/ariService');

const DEBUG_LOG_PATH = '/opt/gescall/.cursor/debug.log';
const writeDebugLog = (payload) => {
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch { }
};

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Allowed CORS origins (Best practice: Configure via .env)
const envOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173']; // Localhost defaults for development

const allowedOrigins = [...envOrigins].filter(Boolean);

const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (process.env.CORS_ALLOW_ALL === 'true') {
    return callback(null, true);
  }
  if (allowedOrigins.includes(origin)) {
    callback(null, origin);
  } else {
    console.log('[CORS] Blocked origin:', origin);
    callback(new Error('Not allowed by CORS'), false);
  }
};

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 1e9,
  pingTimeout: 120000,
  pingInterval: 25000,
});

const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Try again in 15 minutes.' },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Slow down.' },
});

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.set('io', io);
app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    system: 'GesCall Native'
  });
});

// Audio recordings don't need JWT (WaveSurfer fetches directly from browser)
// This inline route bypasses JWT for recording file playback
const path = require('path');
const fs2 = require('fs');
app.get('/api/audio/recordings/:filename', (req, res) => {
    const { filename } = req.params;
    if (filename.includes('/') || filename.includes('..')) {
        return res.status(400).send('Invalid filename');
    }
    const recordingsPath = '/var/spool/asterisk/recording';
    const filePath = path.join(recordingsPath, filename);
    if (!fs2.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Recording not found' });
    }
    const stat = fs2.statSync(filePath);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        res.setHeader('Content-Length', chunksize);
        fs2.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        fs2.createReadStream(filePath).pipe(res);
    }
});

const { requireAuth } = require('./middleware/jwtAuth');
app.use('/api', requireAuth);

app.use('/api/auth', authRoutes);
app.use('/api/lists', listsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/dnc', dncRoutes);
app.use('/api/callerid-pools', calleridPoolsRoutes);
app.use('/api/schedules', schedulesRoutes);
app.use('/api/ivr-flows', ivrFlowsRoutes(pgDatabase));
app.use('/api/trunks', trunksRoutes(pgDatabase));
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/dids', didsRoutes);
app.use('/api/tts-nodes', ttsNodesRoutes(pgDatabase));
app.use('/api/tickets', ticketsRoutes(io));
app.use('/api/metrics', require('./routes/metrics'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/typifications', require('./routes/typifications'));

app.get('/api/docs.json', async (req, res) => {
  try {
    const swaggerSpec = JSON.parse(fs.readFileSync('./swagger_output.json', 'utf8'));
    if (req.user && !req.user.is_system) {
      const role_id = req.user.role_id;
      const result = await pgDatabase.query('SELECT permission FROM gescall_role_permissions WHERE role_id = $1', [role_id]);
      const userPerms = result.rows.map(r => r.permission);

      const tagPermissionsMappings = {
        'Dashboard': ['api_docs_campaigns'],
        'Campaigns': ['api_docs_campaigns'],
        'Lists': ['api_docs_campaigns'],
        'Leads': ['api_docs_leads'],
        'Agents': ['api_docs_users'],
        'Audio': ['api_docs_audio'],
        'CallerID Pools': ['api_docs_callerid'],
        'Schedules': ['api_docs_schedules'],
        'IVR Flows': ['api_docs_ivr'],
        'Trunks': ['api_docs_trunks'],
        'Users': ['api_docs_users'],
        'Roles': ['api_docs_roles'],
        'Tickets': ['api_docs_tickets'],
        'TTS Nodes': ['api_docs_tts'],
        'DNC': ['api_docs_dnc'],
        'Metrics': ['api_docs_campaigns'],
        'Auth': ['ALWAYS_ALLOW']
      };

      for (const currentPath in swaggerSpec.paths) {
        let keepPath = false;
        const methods = Object.keys(swaggerSpec.paths[currentPath]);
        for (const method of methods) {
          const endpoint = swaggerSpec.paths[currentPath][method];
          const tags = endpoint.tags || [];
          if (tags.length === 0 || tags.includes('Auth')) {
            keepPath = true; break;
          }
          const hasAccess = tags.some(tag => {
            const neededPerms = tagPermissionsMappings[tag];
            if (!neededPerms) return false;
            return neededPerms.some(p => userPerms.includes(p));
          });
          if (hasAccess) {
            keepPath = true; break;
          }
        }
        if (!keepPath) {
          delete swaggerSpec.paths[currentPath];
        }
      }
    }
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  } catch (err) {
    console.error('[Swagger] Error building dynamic JSON:', err.message);
    res.status(500).json({ error: 'Failed to build docs structure' });
  }
});

app.use('/api/docs', swaggerUi.serve, (req, res, next) => {
  const swaggerSpec = require('./swagger_output.json');
  swaggerUi.setup(swaggerSpec)(req, res, next);
});

require('./sockets')(io, { USE_NATIVE_DB: true, databaseService, pgDatabase });

app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3001;

console.log('✓ PostgreSQL Native Mode active');
ariService.init(null, io).catch(err => console.warn('⚠ ARI init deferred:', err.message));

console.log('[Routing] Go Dialer Engine handles calls now.');
const { initClickHouse } = require('./config/clickhouse');
initClickHouse().catch(err => console.warn('⚠ ClickHouse init failed:', err.message));

const maintenance = require('./services/maintenanceService');
maintenance.start();

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  GesCall Backend Server                    ║
╠════════════════════════════════════════════╣
║  Server running on port: ${PORT}              ║
║  Environment: ${process.env.NODE_ENV || 'development'}                ║
║  Database: PostgreSQL (native)             ║
╚════════════════════════════════════════════╝
  `);
  schedulerService.start();
});

process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  try { maintenance.stop(); } catch (e) { }
  if (pgDatabase) {
    try {
      if (typeof pgDatabase.end === 'function') {
        await pgDatabase.end();
      } else if (pgDatabase.pool && typeof pgDatabase.pool.end === 'function') {
        await pgDatabase.pool.end();
      }
    } catch (e) {
      console.log('DB close warning (non-fatal):', e.message);
    }
  }
  try { server.close(); } catch (e) { }
  console.log('Server closed');
  process.exit(0);
});
