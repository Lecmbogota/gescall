require('dotenv').config();
const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const vicidialApi = require('./services/vicidialApi');
const database = require('./config/database');
const databaseService = require('./services/databaseService');

// Import routes
const authRoutes = require('./routes/auth');
const listsRoutes = require('./routes/lists');
const leadsRoutes = require('./routes/leads');
const campaignsRoutes = require('./routes/campaigns');
const agentsRoutes = require('./routes/agents');
const dashboardRoutes = require('./routes/dashboard');
const audioRoutes = require('./routes/audio');
const dncRoutes = require('./routes/dnc');

const calleridPoolsRoutes = require('./routes/calleridPools');
const schedulesRoutes = require('./routes/schedules');
const schedulerService = require('./services/schedulerService');
const uploadTaskService = require('./services/uploadTaskService');

const DEBUG_LOG_PATH = '/opt/gescall/.cursor/debug.log';
const writeDebugLog = (payload) => {
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch { }
};

const app = express();
const server = http.createServer(app);

// Allowed CORS origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://164.92.67.176:5173',
  'https://gescall.balenthi.com',
  process.env.CORS_ORIGIN,
].filter(Boolean);

// CORS origin validation function
const corsOrigin = (origin, callback) => {
  // Allow requests with no origin (like mobile apps or curl)
  if (!origin) return callback(null, true);

  if (allowedOrigins.includes(origin)) {
    callback(null, origin);
  } else {
    console.log('[CORS] Blocked origin:', origin);
    // #region agent log
    writeDebugLog({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B', location: 'back/server.js:corsOrigin', message: 'CORS blocked origin', data: { origin }, timestamp: Date.now() });
    // #endregion
    callback(null, false);
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
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
        } else if (task.status === 'failed' || task.status === 'cancelled') {
          socket.emit('upload:leads:cancelled', {
            processId: taskId,
            processed: task.processed_records,
            message: task.status === 'failed' ? 'La tarea falló' : 'Tarea cancelada'
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

    const BATCH_SIZE = 50; // Process 50 leads concurrently

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

      const batchPromises = batch.map(async (lead) => {
        try {
          // Normalize lead object: find comments field even with trailing semicolons
          const normalizedLead = { ...lead };

          // Find the comments field (may have trailing semicolons or other chars)
          const commentsKey = Object.keys(lead).find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'comments');
          if (commentsKey && commentsKey !== 'comments') {
            normalizedLead.comments = lead[commentsKey];
            delete normalizedLead[commentsKey]; // Remove the malformed key
            console.log(`[Lead Upload] Normalized comments key: "${commentsKey}" -> "comments"`);
          }

          // DEBUG: Log lead data to verify comments field
          console.log(`[Lead Upload DEBUG] Phone: ${normalizedLead.phone_number}, Comments: "${normalizedLead.comments || 'EMPTY'}", Keys: ${Object.keys(normalizedLead).join(', ')}`);

          const result = await vicidialApi.addLead({
            ...normalizedLead,
            list_id: list_id,
            phone_code: normalizedLead.phone_code || '57' // Use CSV phone_code or default Colombia
          });

          if (result.success) {
            return { success: true };
          } else {
            console.error(`[Lead Upload Error] Phone: ${lead.phone_number}, Error:`, result.data);
            return { success: false, error: result.data || 'Error desconocido' };
          }
        } catch (error) {
          console.error(`[Lead Upload Exception] Phone: ${lead.phone_number}`, error);
          return { success: false, error: error.message };
        }
      });

      // Execute batch
      const batchResults = await Promise.all(batchPromises);

      // Aggregate results
      let batchSuccess = 0;
      let batchErrors = 0;

      batchResults.forEach((res, index) => {
        if (res.success) {
          batchSuccess++;
          successful++;
        } else {
          batchErrors++;
          errors++;
          // Store detailed error for the specific lead in the batch
          results.push({
            success: false,
            phone_number: batch[index].phone_number,
            error: res.error,
          });
        }
      });

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

  // Agent status updates
  socket.on('agent:status:request', async (data) => {
    const { agent_user } = data;
    try {
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
database.connect()
  .then(() => {
    dbConnected = true;
    console.log('✓ Database connection successful');
  })
  .catch((error) => {
    console.warn('⚠ Database connection failed:', error.message);
    console.warn('⚠ Server will continue without direct DB access');
    console.warn('⚠ Please check DB credentials and network access');
  });

// Start server regardless of DB connection
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  Vicidial Admin Panel Backend Server      ║
╠════════════════════════════════════════════╣
║  Server running on port: ${PORT}              ║
║  Environment: ${process.env.NODE_ENV || 'development'}                ║
║  Database: ${process.env.DB_HOST || '209.38.233.46'}:${process.env.DB_PORT || '3306'}        ║
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
  await database.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
