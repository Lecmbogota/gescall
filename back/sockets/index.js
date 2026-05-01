const uploadTaskService = require('../services/uploadTaskService');
const pgDatabase = require('../config/pgDatabase');
module.exports = function(io, { databaseService }) {
  const activeUploads = new Set();
  const pausedUploads = new Set();
  const redis = require('../config/redisClient'); // Import Redis Client
  
  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
  
    socket.on('task:subscribe', async (taskId) => {
      if (activeUploads.has(taskId)) {
        socket.join(`task:${taskId}`);
        return;
      }
      try {
        const task = await uploadTaskService.getTask(taskId);
        if (task) {
          socket.join(`task:${taskId}`);
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
      socket.emit('task:not_found', { processId: taskId });
    });
  
    socket.on('upload:leads:start', async (data) => {
      const { leads, list_id, campaign_id, processId } = data;
      console.log(`[Socket.IO] Starting lead upload: ${leads.length} leads to list ${list_id}`);
  
      socket.join(`task:${processId}`);
      let processed = 0, successful = 0, errors = 0;
      activeUploads.add(processId);
  
      try {
        await uploadTaskService.createTask(processId, list_id, campaign_id, leads);
        await uploadTaskService.updateTaskStatus(processId, 'running');
      } catch (dbErr) {
        console.error(`[Socket.IO] Failed to persist task ${processId}:`, dbErr.message);
      }
  
      const BATCH_SIZE = 2000;
  
      for (let i = 0; i < leads.length; i += BATCH_SIZE) {
        if (!activeUploads.has(processId)) {
          io.to(`task:${processId}`).emit('upload:leads:cancelled', { processId, processed, message: 'Carga cancelada por el usuario' });
          break;
        }
        while (pausedUploads.has(processId)) {
          if (!activeUploads.has(processId)) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (!activeUploads.has(processId)) {
          io.to(`task:${processId}`).emit('upload:leads:cancelled', { processId, processed, message: 'Carga cancelada por el usuario' });
          break;
        }
  
        const batch = leads.slice(i, i + BATCH_SIZE);
        try {
          const values = [];
          const params = [];
          let paramIdx = 1;
  
          batch.forEach(lead => {
            const commentsKey = Object.keys(lead).find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'comments');
            const commentsVal = commentsKey && commentsKey !== 'comments' ? lead[commentsKey] : lead.comments;
            values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
            params.push(list_id, lead.phone_number, lead.first_name || null, lead.last_name || null, lead.vendor_lead_code || null, commentsVal || null, lead.tts_vars ? JSON.stringify(lead.tts_vars) : '{}');
          });
  
          const query = `INSERT INTO gescall_leads (list_id, phone_number, first_name, last_name, vendor_lead_code, comments, tts_vars) VALUES ${values.join(', ')}`;
          await pgDatabase.query(query, params);
          successful += batch.length;
        } catch (dbErr) {
          console.error(`[Lead Upload Bulk Error] Error:`, dbErr.message);
          errors += batch.length;
        }
  
        processed += batch.length;
        const percentage = Math.round((processed / leads.length) * 100);
        io.to(`task:${processId}`).emit('upload:leads:progress', { processId, percentage, processed, total: leads.length, successful, errors });
  
        if ((i / BATCH_SIZE) % 10 === 0 || processed === leads.length) {
          try { await uploadTaskService.updateProgress(processId, processed, successful, errors); } catch (e) {}
        }
      }
  
      if (activeUploads.has(processId)) {
        io.to(`task:${processId}`).emit('upload:leads:complete', { processId, successful, errors, message: 'Carga completada exitosamente' });
        try { await uploadTaskService.updateTaskStatus(processId, 'completed', processed, successful, errors); } catch (e) {}
        activeUploads.delete(processId);
        pausedUploads.delete(processId);
      }
    });
  
    socket.on('upload:leads:cancel', async (data) => {
      const { processId } = data;
      if (activeUploads.has(processId)) {
        activeUploads.delete(processId);
        pausedUploads.delete(processId);
        try { await uploadTaskService.updateTaskStatus(processId, 'cancelled'); } catch (e) {}
      }
    });
  
    socket.on('upload:leads:pause', (data) => {
      if (activeUploads.has(data.processId)) {
        pausedUploads.add(data.processId);
        io.to(`task:${data.processId}`).emit('upload:leads:paused', { processId: data.processId });
      }
    });
  
    socket.on('upload:leads:resume', (data) => {
      if (activeUploads.has(data.processId) && pausedUploads.has(data.processId)) {
        pausedUploads.delete(data.processId);
        io.to(`task:${data.processId}`).emit('upload:leads:resumed', { processId: data.processId });
      }
    });
  
    socket.on('dashboard:subscribe', async () => {
      try {
        const stats = await databaseService.getDashboardStats();
        const agents = await databaseService.getActiveAgents();
        const campaigns = await databaseService.getAllCampaigns();
        socket.emit('dashboard:update', { timestamp: new Date().toISOString(), stats, agents, campaigns });
      } catch (error) {
        console.error('[Socket.IO] Error fetching dashboard data:', error);
      }
    });
  
    socket.on('campaign:subscribe', (data) => {
      if (data && data.campaign_id) socket.join(`campaign:${data.campaign_id}`);
    });
  
    socket.on('campaign:unsubscribe', (data) => {
      if (data && data.campaign_id) socket.leave(`campaign:${data.campaign_id}`);
    });
  
    socket.on('agent:status:request', async (data) => {
      socket.emit('agent:status:response', { agent_user: data.agent_user, success: true, data: { user: data.agent_user, status: 'OFFLINE' } });
    });
  
    socket.on('list:create', async (data) => {
      socket.emit('list:create:response', { success: false, error: 'Use HTTP endpoint' });
    });
  
    socket.on('agent:state:update', async (data) => {
      try {
        const { username, state, campaignId, timestamp } = data;
        if (!username) return;
        
        // Save socket reference to easily handle disconnect
        socket.agentUsername = username;
        
        const payload = {
          state: state || 'UNKNOWN',
          last_change: timestamp || Date.now(),
          socket_id: socket.id
        };
        if (campaignId) payload.campaign_id = campaignId;

        await redis.hSet(`gescall:agent:${username}`, payload);
        
        // Global broadcast so supervisors update immediately
        io.emit('dashboard:realtime:update', { 
          timestamp: new Date().toISOString(),
          agent_update: { username, ...payload } 
        });
        
      } catch (err) {
        console.error('[Socket.IO] Error updating agent state:', err.message);
      }
    });
  
    socket.on('disconnect', async () => {
      if (socket.agentUsername) {
        try {
          await redis.hSet(`gescall:agent:${socket.agentUsername}`, {
            state: 'OFFLINE',
            last_change: Date.now()
          });
          io.emit('dashboard:realtime:update', { 
            timestamp: new Date().toISOString(),
            agent_update: { username: socket.agentUsername, state: 'OFFLINE', last_change: Date.now() } 
          });
        } catch (err) {
          console.error('[Socket.IO] Error on agent disconnect:', err.message);
        }
      }
    });
  });
  
  setInterval(async () => {
    try {
      const stats = await databaseService.getDashboardStats();
      const agents = await databaseService.getActiveAgents();
      io.emit('dashboard:realtime:update', { timestamp: new Date().toISOString(), stats, agents });
    } catch (e) {}
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
    } catch (e) {}
  }, 5000);
};
