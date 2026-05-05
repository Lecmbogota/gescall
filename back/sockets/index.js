const uploadTaskService = require('../services/uploadTaskService');
const pgDatabase = require('../config/pgDatabase');
const { exec } = require('child_process');
const { syncAgentPauseSegments } = require('../services/agentPauseSegmentsSync');

module.exports = function(io, { databaseService }) {
  const activeUploads = new Set();
  const pausedUploads = new Set();
  const redis = require('../config/redisClient'); // Import Redis Client
  const chatRoomParticipants = new Map(); // room -> Map(socketId -> { role, username })

  /**
   * Pausas que se registran en BD para reportes. Excluye PAUSE_PENDING (modal de PIN sin confirmar).
   */
  function isLoggedPauseState(s) {
    const u = String(s || '').toUpperCase();
    return u === 'NOT_READY' || u.startsWith('NOT_READY_') || u === 'PAUSED' || u === 'BREAK';
  }

  // Cache SIP extension statuses to avoid hammering Asterisk on every 5s tick
  let extensionStatusCache = {}; // { ext: 'Online'|'Offline'|'N/A' }
  let tickCounter = 0;

  function getExtensionStatus(extension) {
    return new Promise((resolve) => {
      if (!extension) return resolve('N/A');
      exec(`asterisk -rx "pjsip show endpoint ${extension}" 2>/dev/null`, (err, stdout) => {
        if (err || !stdout) return resolve('Offline');
        if (stdout.includes('not found') || stdout.includes('object not found') || stdout.includes('Unable to find')) {
          resolve('Offline');
        } else if (stdout.match(new RegExp(`Endpoint:\\s+${extension}\\s+Unavailable`))) {
          resolve('Offline');
        } else if (stdout.match(new RegExp(`Endpoint:\\s+${extension}\\s+(Not in use|In use|Busy|Reachable)`))) {
          resolve('Online');
        } else if (stdout.includes('Endpoint:')) {
          resolve('Online');
        } else {
          resolve('Offline');
        }
      });
    });
  }

  async function refreshExtensionCache() {
    try {
      const { rows } = await pgDatabase.query(
        'SELECT username, sip_extension FROM gescall_users WHERE active = true AND sip_extension IS NOT NULL'
      );
      for (const user of rows) {
        extensionStatusCache[user.username] = await getExtensionStatus(user.sip_extension);
      }
    } catch (e) {
      console.error('[Socket.IO] Error refreshing extension cache:', e.message);
    }
  }
  
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
        
        const newState = state || 'UNKNOWN';
        // Conservar last_change si el estado no ha cambiado: el front envía heartbeat cada 15s
        // y al hacer logout/login rápido el estado real (READY/PAUSED/...) suele ser el mismo;
        // sobrescribir last_change reiniciaría el cronómetro de "Duración" cada heartbeat.
        const prev = await redis.hGetAll(`gescall:agent:${username}`).catch(() => ({}));
        const prevState = prev && prev.state ? String(prev.state) : '';
        const prevLastChange = prev && prev.last_change ? parseInt(prev.last_change, 10) : 0;
        const stateChanged = prevState !== newState;
        const lastChange = stateChanged
          ? (timestamp || Date.now())
          : (prevLastChange || timestamp || Date.now());

        if (stateChanged) {
          const camp = campaignId || prev.campaign_id || null;
          await syncAgentPauseSegments(username, prevState, newState, camp, lastChange);
        }

        // Tiempo logueado del turno (acum + segmento actual en línea); reinicia al cambiar día UTC
        const now = Date.now();
        const today = new Date().toISOString().slice(0, 10);
        let shift_day = prev.shift_day || today;
        let shift_accum_sec = parseInt(prev.shift_accum_sec || '0', 10) || 0;
        let shift_segment_start = parseInt(prev.shift_segment_start || '0', 10) || 0;

        if (shift_day !== today) {
          shift_day = today;
          shift_accum_sec = 0;
          const prevWasOnline = prevState && prevState !== 'OFFLINE' && prevState !== 'UNKNOWN';
          shift_segment_start =
            prevWasOnline && newState !== 'OFFLINE' && newState !== 'UNKNOWN' ? now : 0;
        }

        const wasOnline = prevState && prevState !== 'OFFLINE' && prevState !== 'UNKNOWN';
        const isOnline = newState !== 'OFFLINE' && newState !== 'UNKNOWN';

        if (wasOnline && !isOnline && shift_segment_start > 0) {
          shift_accum_sec += Math.floor((now - shift_segment_start) / 1000);
          shift_segment_start = 0;
        }
        if (!wasOnline && isOnline) {
          shift_segment_start = now;
        }

        const payload = {
          state: newState,
          last_change: lastChange,
          socket_id: socket.id,
          shift_day,
          shift_accum_sec: String(shift_accum_sec)
        };
        if (shift_segment_start > 0) {
          payload.shift_segment_start = String(shift_segment_start);
        }
        // El dialer predictivo/progresivo (Go) cuenta agentes READY con campaign_ids o campaign_id.
        // Sin esto, había una ventana donde solo existía state=READY y el marcador veía readyCount=0
        // hasta que enrichWithCampaignIds terminaba la consulta a Postgres.
        if (campaignId) {
          payload.campaign_id = String(campaignId);
          payload.campaign_ids = String(campaignId);
        }
        await redis.hSet(`gescall:agent:${username}`, payload);
        if (!payload.shift_segment_start) {
          await redis.hDel(`gescall:agent:${username}`, 'shift_segment_start').catch(() => {});
        }

        // Asynchronously enrich with campaign_ids from DB (non-blocking for state write)
        enrichWithCampaignIds(username, campaignId);

        // Look up SIP extension to include status in the broadcast
        let extensionStatus = 'N/A';
        try {
          const { rows: userRows } = await pgDatabase.query(
            'SELECT sip_extension FROM gescall_users WHERE username = $1 LIMIT 1',
            [username]
          );
          if (userRows.length > 0 && userRows[0].sip_extension) {
            extensionStatus = extensionStatusCache[username] || await getExtensionStatus(userRows[0].sip_extension);
            extensionStatusCache[username] = extensionStatus;
          }
        } catch (lookupErr) {}
        
        // Global broadcast so supervisors update immediately
        io.emit('dashboard:realtime:update', { 
          timestamp: new Date().toISOString(),
          agent_update: { username, ...payload, extension_status: extensionStatus } 
        });
        
      } catch (err) {
        console.error('[Socket.IO] Error updating agent state:', err.message);
      }
    });
  
    socket.on('disconnect', async () => {
      if (socket.agentUsername) {
        try {
          // Conservar last_change anterior: si vuelve a entrar pronto al MISMO estado (READY, PAUSED, …),
          // el cronómetro de "Duración" no se reinicia (gescall:state:update también lo respeta cuando no cambia).
          const prev = await redis.hGetAll(`gescall:agent:${socket.agentUsername}`).catch(() => ({}));
          const prevLastChange = prev && prev.last_change ? parseInt(prev.last_change, 10) : 0;
          const lastChange = prevLastChange || Date.now();
          const prevState = prev && prev.state ? String(prev.state) : '';
          const now = Date.now();
          const today = new Date().toISOString().slice(0, 10);
          let shift_day = prev.shift_day || today;
          let shift_accum_sec = parseInt(prev.shift_accum_sec || '0', 10) || 0;
          let shift_segment_start = parseInt(prev.shift_segment_start || '0', 10) || 0;
          if (shift_day !== today) {
            shift_day = today;
            shift_accum_sec = 0;
            shift_segment_start = 0;
          }
          const wasOnline = prevState && prevState !== 'OFFLINE' && prevState !== 'UNKNOWN';
          if (wasOnline && shift_segment_start > 0) {
            shift_accum_sec += Math.floor((now - shift_segment_start) / 1000);
          }
          const prevCamp = prev.campaign_id || null;
          await syncAgentPauseSegments(socket.agentUsername, prevState, 'OFFLINE', prevCamp, now);
          await redis.hSet(`gescall:agent:${socket.agentUsername}`, {
            state: 'OFFLINE',
            last_change: lastChange,
            shift_day,
            shift_accum_sec: String(shift_accum_sec)
          });
          await redis.hDel(`gescall:agent:${socket.agentUsername}`, 'shift_segment_start').catch(() => {});
          io.emit('dashboard:realtime:update', {
            timestamp: new Date().toISOString(),
            agent_update: { username: socket.agentUsername, state: 'OFFLINE', last_change: lastChange, extension_status: extensionStatusCache[socket.agentUsername] || 'N/A' }
          });
        } catch (err) {
          console.error('[Socket.IO] Error on agent disconnect:', err.message);
        }
      }
    });

    socket.on('agent:workspace:subscribe', async (data) => {
      const username = data && data.username ? String(data.username) : '';
      if (!username) return;
      try {
        await socket.join(`${AGENT_METRICS_ROOM_PREFIX}${username}`);
        const metrics = await buildAgentWorkspaceMetrics(username);
        socket.emit('agent:workspace:metrics', metrics);
      } catch (e) {
        console.error('[Socket.IO] agent:workspace:subscribe:', e.message);
      }
    });

    socket.on('agent:workspace:unsubscribe', async (data) => {
      const username = data && data.username ? String(data.username) : '';
      if (!username) return;
      try {
        socket.leave(`${AGENT_METRICS_ROOM_PREFIX}${username}`);
      } catch (_) {}
    });

    socket.on('agent:workspace:chat:subscribe', async (data) => {
      const campaignId = data && data.campaign_id ? String(data.campaign_id) : '';
      const agentUsername = data && data.agent_username ? String(data.agent_username) : '';
      const participantRole = data && data.participant_role ? String(data.participant_role).toUpperCase() : '';
      const participantUsername = data && data.participant_username ? String(data.participant_username) : '';
      if (!campaignId || !agentUsername) return;
      const roomName = `agent-workspace-chat:${campaignId}:${agentUsername}`;
      try {
        socket.join(roomName);
        if (!chatRoomParticipants.has(roomName)) {
          chatRoomParticipants.set(roomName, new Map());
        }
        const participants = chatRoomParticipants.get(roomName);
        participants.set(socket.id, {
          role: participantRole === 'SUPERVISOR' ? 'SUPERVISOR' : 'AGENT',
          username: participantUsername || null,
        });
        if (!socket.chatRooms) socket.chatRooms = new Set();
        socket.chatRooms.add(roomName);
        broadcastChatPresence(roomName);
      } catch (_) {}
    });

    socket.on('agent:workspace:chat:unsubscribe', async (data) => {
      const campaignId = data && data.campaign_id ? String(data.campaign_id) : '';
      const agentUsername = data && data.agent_username ? String(data.agent_username) : '';
      if (!campaignId || !agentUsername) return;
      const roomName = `agent-workspace-chat:${campaignId}:${agentUsername}`;
      try {
        socket.leave(roomName);
        removeChatParticipant(roomName, socket.id);
      } catch (_) {}
    });

    socket.on('disconnect', () => {
      try {
        if (!socket.chatRooms || socket.chatRooms.size === 0) return;
        for (const roomName of socket.chatRooms.values()) {
          removeChatParticipant(roomName, socket.id);
        }
      } catch (_) {}
    });
  });

  function removeChatParticipant(roomName, socketId) {
    const participants = chatRoomParticipants.get(roomName);
    if (!participants) return;
    participants.delete(socketId);
    if (participants.size === 0) {
      chatRoomParticipants.delete(roomName);
      return;
    }
    broadcastChatPresence(roomName);
  }

  function broadcastChatPresence(roomName) {
    const participants = chatRoomParticipants.get(roomName);
    const values = participants ? Array.from(participants.values()) : [];
    const supervisor_online = values.some((p) => p.role === 'SUPERVISOR');
    const agent_online = values.some((p) => p.role === 'AGENT');
    io.to(roomName).emit('agent:workspace:chat:presence', {
      room: roomName,
      supervisor_online,
      agent_online,
      supervisor_count: values.filter((p) => p.role === 'SUPERVISOR').length,
      agent_count: values.filter((p) => p.role === 'AGENT').length,
      timestamp: new Date().toISOString(),
    });
  }

  // Async background task: enrich agent Redis key with campaign_ids from DB.
  // Runs after the state write to avoid blocking the critical path.
  async function enrichWithCampaignIds(username, fallbackCampaignId) {
    try {
      const { rows: campRows } = await pgDatabase.query(
        `SELECT uc.campaign_id 
         FROM gescall_user_campaigns uc
         JOIN gescall_campaigns c ON uc.campaign_id = c.campaign_id
         WHERE uc.user_id = (SELECT user_id FROM gescall_users WHERE username = $1 LIMIT 1)
         AND c.active = true`,
        [username]
      );
      const campaigns = campRows.map(r => r.campaign_id);
      if (campaigns.length > 0) {
        await redis.hSet(`gescall:agent:${username}`, {
          campaign_ids: campaigns.join(','),
          campaign_id: String(campaigns[0])
        });
      } else if (fallbackCampaignId) {
        const fid = String(fallbackCampaignId);
        await redis.hSet(`gescall:agent:${username}`, {
          campaign_ids: fid,
          campaign_id: fid
        });
      }
    } catch (e) {
      if (fallbackCampaignId) {
        const fid = String(fallbackCampaignId);
        try {
          await redis.hSet(`gescall:agent:${username}`, { campaign_ids: fid, campaign_id: fid });
        } catch (_) {}
      }
    }
  }

  const AGENT_METRICS_ROOM_PREFIX = 'agent-metrics:';

  async function buildAgentWorkspaceMetrics(username) {
    const agent = await redis.hGetAll(`gescall:agent:${username}`).catch(() => ({}));
    const campaignIdsRaw = agent.campaign_ids || agent.campaign_id || '';
    const campaignIds = String(campaignIdsRaw).split(',').map((s) => s.trim()).filter(Boolean);

    let dbPart = { queue_depth: 0, calls_today: 0 };
    try {
      dbPart = await databaseService.getAgentShiftMetrics(username, campaignIds);
    } catch (e) {
      console.error('[Socket.IO] getAgentShiftMetrics:', e.message);
    }

    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    let shift_accum_sec = parseInt(agent.shift_accum_sec || '0', 10) || 0;
    const shift_day = agent.shift_day || today;
    const seg = parseInt(agent.shift_segment_start || '0', 10) || 0;
    const st = agent.state || 'OFFLINE';
    const isOnline = st !== 'OFFLINE' && st !== 'UNKNOWN';

    let logged_seconds = shift_accum_sec;
    if (shift_day !== today) {
      logged_seconds = 0;
    } else if (isOnline && seg > 0) {
      logged_seconds += Math.floor((now - seg) / 1000);
    }

    return {
      username,
      logged_seconds,
      calls_today: dbPart.calls_today,
      queue_depth: dbPart.queue_depth,
      timestamp: new Date().toISOString(),
    };
  }

  setInterval(async () => {
    tickCounter++;
    const broadcast = { timestamp: new Date().toISOString() };
    let hasData = false;

    try {
      // Refresh SIP extension cache every 30s (6 ticks)
      if (tickCounter % 6 === 0) {
        refreshExtensionCache();
      }
      
      const stats = await databaseService.getDashboardStats();
      broadcast.stats = stats;
      hasData = true;
    } catch (e) {
      console.error('[Socket.IO] getDashboardStats error:', e.message);
    }

    try {
      const agents = await databaseService.getActiveAgents();
      broadcast.agents = agents;
      hasData = true;
    } catch (e) {
      console.error('[Socket.IO] getActiveAgents error:', e.message);
    }

    // Always include extension cache (may be empty on first run before 30s refresh)
    broadcast.extensions = { ...extensionStatusCache };

    if (hasData || Object.keys(extensionStatusCache).length > 0) {
      if (tickCounter % 12 === 1) {
        console.log(`[Socket.IO] Periodic broadcast #${tickCounter} — agents: ${(broadcast.agents || []).length}, extensions: ${Object.keys(extensionStatusCache).length}, clients: ${io.engine.clientsCount}`);
      }
      io.emit('dashboard:realtime:update', broadcast);
    }

    // Campaign room broadcasts
    try {
      if (io.sockets.adapter.rooms) {
        for (const [room, clients] of io.sockets.adapter.rooms.entries()) {
          if (room.startsWith('campaign:') && clients.size > 0) {
            const campaignId = room.split(':')[1];
            if (campaignId) {
              try {
                const stats = await databaseService.getCampaignRealtimeStats(campaignId);
                io.to(room).emit('campaign:realtime:update', stats);
              } catch (innerE) {
                console.error(`[Socket.IO] campaign:${campaignId} stats error:`, innerE.message);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[Socket.IO] Campaign room broadcast error:', e.message);
    }

    // Métricas de turno por agente (vista workspace)
    try {
      if (io.sockets.adapter.rooms) {
        for (const [roomName] of io.sockets.adapter.rooms.entries()) {
          if (!roomName.startsWith(AGENT_METRICS_ROOM_PREFIX)) continue;
          const username = roomName.slice(AGENT_METRICS_ROOM_PREFIX.length);
          if (!username) continue;
          try {
            const metrics = await buildAgentWorkspaceMetrics(username);
            io.to(roomName).emit('agent:workspace:metrics', metrics);
          } catch (innerE) {
            console.error(`[Socket.IO] agent metrics ${username}:`, innerE.message);
          }
        }
      }
    } catch (e) {
      console.error('[Socket.IO] Agent workspace metrics broadcast:', e.message);
    }
  }, 5000);
};
