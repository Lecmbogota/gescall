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
const vicidialApi = require('./services/vicidialApi');
const USE_NATIVE_DB = process.env.USE_GESCALL_DIALER === 'true';
const database = USE_NATIVE_DB ? null : require('./config/database');
const databaseService = USE_NATIVE_DB ? require('./services/pgDatabaseService') : require('./services/databaseService');

// Import routes
const authRoutes = USE_NATIVE_DB ? require('./routes/pg_auth') : require('./routes/auth');
const listsRoutes = USE_NATIVE_DB ? require('./routes/pg_lists') : require('./routes/lists');
const campaignsRoutes = USE_NATIVE_DB ? require('./routes/pg_campaigns') : require('./routes/campaigns');
const leadsRoutes = USE_NATIVE_DB ? require('./routes/pg_leads') : require('./routes/leads');
const agentsRoutes = USE_NATIVE_DB ? require('./routes/pg_agents') : require('./routes/agents');
const dashboardRoutes = USE_NATIVE_DB ? require('./routes/pg_dashboard') : require('./routes/dashboard');
const audioRoutes = require('./routes/audio'); // Audio remains unchanged as it directly connects to asterisk
const dncRoutes = USE_NATIVE_DB ? require('./routes/pg_dnc') : require('./routes/dnc');

const calleridPoolsRoutes = USE_NATIVE_DB ? require('./routes/pg_calleridPools') : require('./routes/calleridPools');
const schedulesRoutes = USE_NATIVE_DB ? require('./routes/pg_schedules') : require('./routes/schedules');
const ivrFlowsRoutes = require('./routes/ivrFlows');
const trunksRoutes = require('./routes/pg_trunks');
const ticketsRoutes = require('./routes/pg_tickets');
const usersRoutes = require('./routes/pg_users');
const rolesRoutes = require('./routes/pg_roles');
const ttsNodesRoutes = require('./routes/ttsNodes');
const pgDatabase = require('./config/pgDatabase');
const schedulerService = require('./services/schedulerService');
const uploadTaskService = require('./services/uploadTaskService');
const ariService = require('./services/ariService');
const provisioningService = require('./services/provisioningService');

const DEBUG_LOG_PATH = '/opt/gescall/.cursor/debug.log';
const writeDebugLog = (payload) => {
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch { }
};

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Allowed CORS origins
const baseOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://164.92.67.176:5173',
  'https://gescall.balenthi.com',
  'https://urlpro.cc'
];

const envOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : [];

const allowedOrigins = [...baseOrigins, ...envOrigins].filter(Boolean);

// CORS origin validation function
const corsOrigin = (origin, callback) => {
  // Allow requests with no origin (like mobile apps or curl)
  if (!origin) return callback(null, true);

  // Allow all origins if CORS_ALLOW_ALL is set to true
  if (process.env.CORS_ALLOW_ALL === 'true') {
    return callback(null, true);
  }

  if (allowedOrigins.includes(origin)) {
    callback(null, origin);
  } else {
    console.log('[CORS] Blocked origin:', origin);
    // #region agent log
    writeDebugLog({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B', location: 'back/server.js:corsOrigin', message: 'CORS blocked origin', data: { origin }, timestamp: Date.now() });
    // #endregion
    callback(new Error('Not allowed by CORS'), false);
  }
};

// Configure Socket.IO with CORS and increased buffer for large uploads
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 1e9, // 1GB - to safely support 500MB lead uploads
  pingTimeout: 120000, // 2 minutes timeout for large uploads
  pingInterval: 25000,
});

// Middleware
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP since frontend is served separately
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin for API
}));

// Rate limiting
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Try again in 15 minutes.' },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Slow down.' },
});

app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.set('io', io); // Make Socket.IO accessible to routes via req.app.get('io')
app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  // #region agent log
  writeDebugLog({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A', location: 'back/server.js:request', message: 'Incoming request', data: { method: req.method, path: req.path, origin: req.headers.origin || null }, timestamp: Date.now() });
  // #endregion
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  // #region agent log
  writeDebugLog({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A', location: 'back/server.js:health', message: 'Health check hit', data: { origin: req.headers.origin || null }, timestamp: Date.now() });
  // #endregion
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    vicidial: {
      url: process.env.VICIDIAL_API_URL,
      user: process.env.VICIDIAL_API_USER,
    },
  });
});

// API Routes
// JWT Authentication — protects ALL routes below except /api/auth, /api/health, /api/docs
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
app.use('/api/ivr-flows', ivrFlowsRoutes(USE_NATIVE_DB ? pgDatabase : database));
app.use('/api/trunks', trunksRoutes(pgDatabase));
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/tts-nodes', ttsNodesRoutes(USE_NATIVE_DB ? pgDatabase : database));
app.use('/api/tickets', ticketsRoutes(io));
app.use('/api/metrics', require('./routes/metrics'));
app.use('/api/settings', require('./routes/settings'));

// Swagger Documentation setup
app.get('/api/docs.json', async (req, res) => {
  try {
    // Read fresh from disk to avoid caching mutations
    const swaggerSpec = JSON.parse(fs.readFileSync('./swagger_output.json', 'utf8'));

    // If user is not system admin, dynamically filter what they can see based on UI permissions.
    if (req.user && !req.user.is_system) {
      const role_id = req.user.role_id;
      let userPerms = [];

      if (USE_NATIVE_DB) {
        const result = await pgDatabase.query('SELECT permission FROM gescall_role_permissions WHERE role_id = $1', [role_id]);
        userPerms = result.rows.map(r => r.permission);
      } else {
        // Graceful fallback for legacy database, assume empty perms
        userPerms = [];
      }

      // Map Swagger Tags to Explicit API Permissions
      // If a tag is omitted here, it defaults to restricted unless they're ADMIN
      const tagPermissionsMappings = {
        'Dashboard': ['api_docs_campaigns'], // There are no standalone dashboard API routes mostly, but mapped to campaigns
        'Campaigns': ['api_docs_campaigns'],
        'Lists': ['api_docs_campaigns'],
        'Leads': ['api_docs_leads'],
        'Agents': ['api_docs_users'], // Agents logs and presence are mostly used around users or campaigns
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
        'Auth': ['ALWAYS_ALLOW'] // Login/logout endpoints should usually be visible
      };

      for (const currentPath in swaggerSpec.paths) {
        let keepPath = false;
        const methods = Object.keys(swaggerSpec.paths[currentPath]);

        for (const method of methods) {
          const endpoint = swaggerSpec.paths[currentPath][method];
          const tags = endpoint.tags || [];

          // Allow if ANY tag matches a permission the user is holding
          if (tags.length === 0 || tags.includes('Auth')) {
            keepPath = true; break;
          }

          const hasAccess = tags.some(tag => {
            const neededPerms = tagPermissionsMappings[tag];
            if (!neededPerms) return false;
            // check if user has at least one of the needed perms
            return neededPerms.some(p => userPerms.includes(p));
          });

          if (hasAccess) {
            keepPath = true; break;
          }
        }

        // If none of the methods on this path have permission, we purge the whole path
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

// Track active uploads for cancellation
const activeUploads = new Set();
const pausedUploads = new Set();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  // Subscribe to task updates (for reconnection)
  socket.on('task:subscribe', async (taskId) => {
    // Check memory first (active upload in current process)
    if (activeUploads.has(taskId)) {
      console.log(`[Socket.IO] Client ${socket.id} subscribed to active task: ${taskId}`);
      socket.join(`task:${taskId}`);
      return;
    }

    // Check database for persisted task
    try {
      const task = await uploadTaskService.getTask(taskId);
      if (task) {
        console.log(`[Socket.IO] Client ${socket.id} subscribed to DB task: ${taskId} (status: ${task.status})`);
        socket.join(`task:${taskId}`);

        // Send current status to client
        if (task.status === 'completed') {
          socket.emit('upload:leads:complete', {
            processId: taskId,
            successful: task.successful_records,
            errors: task.error_records,
            message: 'Carga completada'
          });
        } else if (task.status === 'failed') {
          socket.emit('upload:leads:error', {
            processId: taskId,
            message: task.error_log || 'La tarea falló'
          });
        } else if (task.status === 'cancelled') {
          socket.emit('upload:leads:cancelled', {
            processId: taskId,
            processed: task.processed_records,
            message: 'Tarea cancelada'
          });
        } else {
          // Task is pending/running/paused - send progress
          socket.emit('upload:leads:progress', {
            processId: taskId,
            percentage: task.total_records > 0 ? Math.round((task.processed_records / task.total_records) * 100) : 0,
            processed: task.processed_records,
            total: task.total_records,
            successful: task.successful_records,
            errors: task.error_records,
            recoverable: true
          });
        }
        return;
      }
    } catch (err) {
      console.error(`[Socket.IO] Error checking DB for task ${taskId}:`, err.message);
    }

    console.log(`[Socket.IO] Client subscribe rejected (not found): ${taskId}`);
    socket.emit('task:not_found', { processId: taskId });
  });

  // Handle lead upload with progress tracking
  socket.on('upload:leads:start', async (data) => {
    const { leads, list_id, campaign_id, processId } = data;
    console.log(`[Socket.IO] Starting lead upload: ${leads.length} leads to list ${list_id} (Process: ${processId})`);

    // Join a room specific to this task
    socket.join(`task:${processId}`);

    let processed = 0;
    let successful = 0;
    let errors = 0;
    const results = [];

    // Mark upload as active in memory
    activeUploads.add(processId);

    // Persist task to database for recovery
    try {
      await uploadTaskService.createTask(processId, list_id, campaign_id, leads);
      await uploadTaskService.updateTaskStatus(processId, 'running');
      console.log(`[Socket.IO] Task ${processId} persisted to database`);
    } catch (dbErr) {
      console.error(`[Socket.IO] Failed to persist task ${processId}:`, dbErr.message);
      // Continue anyway - we still have in-memory tracking
    }

    const isNativeDB = process.env.USE_GESCALL_DIALER === 'true';
    const BATCH_SIZE = isNativeDB ? 2000 : 50; // Process 2000 leads concurrently for native DB, 50 for Vicidial

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      // Check for cancellation
      if (!activeUploads.has(processId)) {
        console.log(`[Socket.IO] Upload cancelled: ${processId}`);
        io.to(`task:${processId}`).emit('upload:leads:cancelled', {
          processId,
          processed,
          message: 'Carga cancelada por el usuario'
        });
        break;
      }

      // Check for pause
      while (pausedUploads.has(processId)) {
        if (!activeUploads.has(processId)) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // If cancelled while paused
      if (!activeUploads.has(processId)) {
        io.to(`task:${processId}`).emit('upload:leads:cancelled', {
          processId,
          processed,
          message: 'Carga cancelada por el usuario'
        });
        break;
      }

      // Prepare batch
      const batch = leads.slice(i, i + BATCH_SIZE);

      let batchSuccess = 0;
      let batchErrors = 0;

      if (isNativeDB) {
        try {
          // PostgreSQL Bulk Insert Strategy
          const values = [];
          const params = [];
          let paramIdx = 1;

          batch.forEach(lead => {
            const commentsKey = Object.keys(lead).find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'comments');
            const commentsVal = commentsKey && commentsKey !== 'comments' ? lead[commentsKey] : lead.comments;

            values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
            params.push(
              list_id,
              lead.phone_number,
              lead.first_name || null,
              lead.last_name || null,
              lead.vendor_lead_code || null,
              commentsVal || null,
              lead.tts_vars ? JSON.stringify(lead.tts_vars) : '{}'
            );
          });

          const query = `
            INSERT INTO gescall_leads 
            (list_id, phone_number, first_name, last_name, vendor_lead_code, comments, tts_vars) 
            VALUES ${values.join(', ')}
          `;

          await pgDatabase.query(query, params);

          // If bulk insert succeeds, all records in batch are successful
          batchSuccess = batch.length;
          successful += batch.length;

        } catch (dbErr) {
          console.error(`[Lead Upload Bulk Error] Error:`, dbErr.message);
          batchErrors = batch.length;
          errors += batch.length;
          results.push({
            success: false,
            error: "Error en carga masiva: " + dbErr.message
          });
        }
      } else {
        // Legacy Vicidial API (HTTP per record)
        const batchPromises = batch.map(async (lead) => {
          try {
            const normalizedLead = { ...lead };
            const commentsKey = Object.keys(lead).find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'comments');
            if (commentsKey && commentsKey !== 'comments') {
              normalizedLead.comments = lead[commentsKey];
              delete normalizedLead[commentsKey];
            }

            const result = await vicidialApi.addLead({
              ...normalizedLead,
              list_id: list_id,
              phone_code: normalizedLead.phone_code || '57'
            });

            if (result.success) {
              return { success: true };
            } else {
              return { success: false, error: result.data || 'Error desconocido' };
            }
          } catch (error) {
            return { success: false, error: error.message };
          }
        });

        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach((res, index) => {
          if (res.success) {
            batchSuccess++;
            successful++;
          } else {
            batchErrors++;
            errors++;
            results.push({
              success: false,
              phone_number: batch[index].phone_number,
              error: res.error,
            });
          }
        });
      }

      processed += batch.length;

      // Calculate progress percentage
      const percentage = Math.round((processed / leads.length) * 100);

      // Emit progress to room
      io.to(`task:${processId}`).emit('upload:leads:progress', {
        processId,
        percentage,
        processed,
        total: leads.length,
        successful,
        errors
      });

      // Persist progress every 10 batches (500 records) to database
      if ((i / BATCH_SIZE) % 10 === 0 || processed === leads.length) {
        try {
          await uploadTaskService.updateProgress(processId, processed, successful, errors);
        } catch (dbErr) {
          console.error(`[Socket.IO] Failed to persist progress:`, dbErr.message);
        }
      }
    }

    if (activeUploads.has(processId)) {
      io.to(`task:${processId}`).emit('upload:leads:complete', {
        processId,
        successful,
        errors,
        message: 'Carga completada exitosamente'
      });
      console.log(`[Socket.IO] Lead upload completed: ${successful} successful, ${errors} errors`);

      // Mark as completed in database
      try {
        await uploadTaskService.updateTaskStatus(processId, 'completed', processed, successful, errors);
      } catch (dbErr) {
        console.error(`[Socket.IO] Failed to mark task completed:`, dbErr.message);
      }

      // Cleanup memory
      activeUploads.delete(processId);
      pausedUploads.delete(processId);
    }
  });

  // Handle cancellation request
  socket.on('upload:leads:cancel', async (data) => {
    const { processId } = data;
    if (activeUploads.has(processId)) {
      console.log(`[Socket.IO] Cancelling upload: ${processId}`);
      activeUploads.delete(processId);
      pausedUploads.delete(processId);

      // Persist cancellation to database
      try {
        await uploadTaskService.updateTaskStatus(processId, 'cancelled');
      } catch (dbErr) {
        console.error(`[Socket.IO] Failed to mark task cancelled:`, dbErr.message);
      }
      // The loop will detect this change and break
    }
  });

  // Handle pause request
  socket.on('upload:leads:pause', (data) => {
    const { processId } = data;
    if (activeUploads.has(processId)) {
      console.log(`[Socket.IO] Pausing upload: ${processId}`);
      pausedUploads.add(processId);
      io.to(`task:${processId}`).emit('upload:leads:paused', { processId });
    }
  });

  // Handle resume request
  socket.on('upload:leads:resume', (data) => {
    const { processId } = data;
    if (activeUploads.has(processId) && pausedUploads.has(processId)) {
      console.log(`[Socket.IO] Resuming upload: ${processId}`);
      pausedUploads.delete(processId);
      io.to(`task:${processId}`).emit('upload:leads:resumed', { processId });
    }
  });

  // Real-time dashboard updates
  socket.on('dashboard:subscribe', async () => {
    console.log(`[Socket.IO] Client subscribed to dashboard updates: ${socket.id}`);

    // Send initial data
    try {
      const stats = await databaseService.getDashboardStats();
      const agents = await databaseService.getActiveAgents();
      const campaigns = await databaseService.getAllCampaigns();

      socket.emit('dashboard:update', {
        timestamp: new Date().toISOString(),
        stats,
        agents,
        campaigns,
      });
    } catch (error) {
      console.error('[Socket.IO] Error fetching dashboard data:', error);
    }
  });

  // Campaign Realtime Stats updates
  socket.on('campaign:subscribe', (data) => {
    if (data && data.campaign_id) {
      socket.join(`campaign:${data.campaign_id}`);
    }
  });

  socket.on('campaign:unsubscribe', (data) => {
    if (data && data.campaign_id) {
      socket.leave(`campaign:${data.campaign_id}`);
    }
  });

  // Agent status updates
  socket.on('agent:status:request', async (data) => {
    const { agent_user } = data;
    try {
      if (USE_NATIVE_DB) {
        socket.emit('agent:status:response', {
          agent_user,
          success: true,
          data: { user: agent_user, status: 'OFFLINE' },
        });
        return;
      }
      const result = await vicidialApi.getAgentStatus({ agent_user });

      socket.emit('agent:status:response', {
        agent_user,
        success: result.success,
        data: result.success ? vicidialApi.parseResponse(result.data)[0] : null,
      });
    } catch (error) {
      socket.emit('agent:status:response', {
        agent_user,
        success: false,
        error: error.message,
      });
    }
  });

  // List creation
  socket.on('list:create', async (data) => {
    try {
      if (USE_NATIVE_DB) {
        // Handled via HTTP in native mode
        socket.emit('list:create:response', { success: false, error: 'Use HTTP endpoint' });
        return;
      }
      const result = await vicidialApi.addList(data);

      socket.emit('list:create:response', {
        success: result.success,
        data: result.data,
      });
    } catch (error) {
      socket.emit('list:create:response', {
        success: false,
        error: error.message,
      });
    }
  });

  // Get list info
  socket.on('list:info:request', async (data) => {
    const { list_id } = data;
    try {
      if (USE_NATIVE_DB) {
        socket.emit('list:info:response', { list_id, success: true, data: { list_id, active: 'Y' } });
        return;
      }
      const result = await vicidialApi.getListInfo({ list_id });

      socket.emit('list:info:response', {
        list_id,
        success: result.success,
        data: result.success ? vicidialApi.parseResponse(result.data)[0] : null,
      });
    } catch (error) {
      socket.emit('list:info:response', {
        list_id,
        success: false,
        error: error.message,
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Periodic dashboard updates (every 5 seconds)
setInterval(async () => {
  try {
    const stats = await databaseService.getDashboardStats();
    const agents = await databaseService.getActiveAgents();

    io.emit('dashboard:realtime:update', {
      timestamp: new Date().toISOString(),
      stats,
      agents,
    });
  } catch (error) {
    console.error('[Dashboard Update] Error:', error.message);
  }

  // Periodic campaign updates for active subscribers
  try {
    if (io.sockets.adapter.rooms) {
      for (const [room, clients] of io.sockets.adapter.rooms.entries()) {
        if (room.startsWith('campaign:') && clients.size > 0) {
          const campaignId = room.split(':')[1];
          if (campaignId) {
            const stats = await databaseService.getCampaignRealtimeStats(campaignId);
            io.to(room).emit('campaign:realtime:update', stats);
          }
        }
      }
    }
  } catch (error) {
    console.error('[Campaign Realtime Update] Error:', error.message);
  }
}, 5000);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Start server
const PORT = process.env.PORT || 3001;

// Try to connect to database (non-blocking)
let dbConnected = false;

if (USE_NATIVE_DB) {
  dbConnected = true;
  console.log('✓ PostgreSQL Native Mode active');

  ariService.init(null, io).catch(err => {
    console.warn('⚠ ARI init deferred:', err.message);
  });

  console.log('[Init] USE_GESCALL_DIALER is:', process.env.USE_GESCALL_DIALER);
  if (process.env.USE_GESCALL_DIALER === 'true') {
    // const dialerEngine = require('./services/redisDialerEngine');
    // dialerEngine.start();
    console.log('[Routing] Go Dialer Engine handles calls now.');

    // Start maintenance jobs (cleanup stuck leads, retry failed, load hopper)
    const maintenance = require('./services/maintenanceService');
    maintenance.start();
  }
} else {
  database.connect()
    .then(() => {
      dbConnected = true;
      console.log('✓ Database connection successful');
      // Auto-provision GesCall resources
      return provisioningService.run(database.pool);
    })
    .then(() => {
      // Initialize ARI IVR engine
      ariService.init(database.pool, io).catch(err => {
        console.warn('⚠ ARI init deferred:', err.message);
      });

      // Initialize High-Capacity Spool Dialer Engine
      console.log('[Init] USE_GESCALL_DIALER is:', process.env.USE_GESCALL_DIALER);
      if (process.env.USE_GESCALL_DIALER === 'true') {
        // const dialerEngine = require('./services/redisDialerEngine');
        // dialerEngine.start();
        console.log('[Routing] Go Dialer Engine handles calls now.');

        // Start maintenance jobs (cleanup stuck leads, retry failed, cleanup Redis)
        const maintenance = require('./services/maintenanceService');
        maintenance.start();
      }
    })
    .catch((error) => {
      console.warn('⚠ Database connection failed:', error.message);
      console.warn('⚠ Server will continue without direct DB access');
      console.warn('⚠ Please check DB credentials and network access');
    });
}

// Start server regardless of DB connection
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  GesCall Backend Server                   ║
╠════════════════════════════════════════════╣
║  Server running on port: ${PORT}              ║
║  Environment: ${process.env.NODE_ENV || 'development'}                ║
║  Database: ${USE_NATIVE_DB ? 'PostgreSQL (native)' : (process.env.DB_HOST || '209.38.233.46') + ':' + (process.env.DB_PORT || '3306')}        ║
║  Vicidial API: ${process.env.VICIDIAL_API_URL ? 'Configured' : 'Not configured'}          ║
╚════════════════════════════════════════════╝
  `);
  // #region agent log
  writeDebugLog({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'D', location: 'back/server.js:listen', message: 'Server started', data: { port: PORT, env: process.env.NODE_ENV || 'development' }, timestamp: Date.now() });
  // #endregion

  // Start the scheduler service
  schedulerService.start();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  try {
    const maintenance = require('./services/maintenanceService');
    maintenance.stop();
  } catch (e) { /* not loaded */ }
  try {
    const dialerEngine = require('./services/redisDialerEngine');
    dialerEngine.stop();
  } catch (e) { /* not loaded */ }
  if (database) await database.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
