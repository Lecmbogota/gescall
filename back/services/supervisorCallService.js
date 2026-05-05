/**
 * Supervisión PBX (spy/whisper) y utilidades de estado para acciones de supervisor.
 * Usa ARI (snoop) y Redis/PG siguiendo patrones del proyecto.
 */
const { exec } = require('child_process');
const pg = require('../config/pgDatabase');
const redis = require('../config/redisClient');
const { getClient } = require('./ariService');
const { syncAgentPauseSegments } = require('./agentPauseSegmentsSync');

const STASIS_SUPERVISOR_APP = process.env.SUPERVISOR_ARI_STASIS_APP || 'gescall-supervisor';

async function getSupervisorSipRow(username) {
  if (!username) return { sip_extension: null, username: null };
  const { rows } = await pg.query(
    `SELECT username, sip_extension FROM gescall_users WHERE username = $1 AND active = true LIMIT 1`,
    [username]
  );
  if (rows.length === 0) return { sip_extension: null, username: null };
  const sip = rows[0].sip_extension != null ? String(rows[0].sip_extension).trim() : null;
  return { username: rows[0].username, sip_extension: sip || null };
}

function buildSupervisorEndpoint(sipExtension) {
  const direct = (process.env.SUPERVISOR_MONITOR_ENDPOINT || '').trim();
  if (direct) return direct;

  const tpl = (process.env.SUPERVISOR_MONITOR_ENDPOINT_TEMPLATE || '').trim();
  if (tpl && sipExtension) {
    return tpl.replace('{ext}', sipExtension);
  }

  if (sipExtension) {
    return `PJSIP/${sipExtension}`;
  }

  return '';
}

async function attachSupervisorLegToSnoop(ari, snoopChannelId, actorUsername, mode) {
  const sup = await getSupervisorSipRow(actorUsername);
  const endpoint = buildSupervisorEndpoint(sup.sip_extension);
  if (!endpoint) {
    return {
      ok: false,
      code: 'SUPERVISOR_ENDPOINT_MISSING',
      error:
        'No se pudo resolver endpoint del supervisor (sip_extension o SUPERVISOR_MONITOR_ENDPOINT[_TEMPLATE]).',
    };
  }

  let monitorChannel = null;
  let bridge = null;
  try {
    monitorChannel = await ari.channels.originate({
      endpoint,
      app: STASIS_SUPERVISOR_APP,
      appArgs: 'supervisor_monitor_leg',
      callerId: actorUsername ? `"${actorUsername}" <${actorUsername}>` : undefined,
    });

    const monitorId = monitorChannel && monitorChannel.id ? monitorChannel.id : null;
    if (!monitorId) {
      return { ok: false, code: 'SUPERVISOR_MONITOR_ORIGINATE_FAILED', error: 'No se obtuvo canal del supervisor.' };
    }

    bridge = await ari.bridges.create({ type: 'mixing', name: `supervisor_${mode}_${Date.now()}` });
    await bridge.addChannel({ channel: [snoopChannelId, monitorId] });

    return {
      ok: true,
      data: {
        supervisor_endpoint: endpoint,
        supervisor_channel_id: monitorId,
        supervisor_bridge_id: bridge.id,
      },
    };
  } catch (e) {
    if (bridge && bridge.id) {
      try { await ari.bridges.destroy({ bridgeId: bridge.id }); } catch (_) {}
    }
    if (monitorChannel && monitorChannel.id) {
      try { await ari.channels.hangup({ channelId: monitorChannel.id }); } catch (_) {}
    }
    return {
      ok: false,
      code: 'SUPERVISOR_ATTACH_FAILED',
      error: e.message || 'No fue posible enlazar el supervisor al canal de supervisión.',
    };
  }
}

/**
 * @param {string} ext
 */
function getExtensionStatusFast(ext) {
  return new Promise((resolve) => {
    if (!ext) return resolve('N/A');
    exec(`asterisk -rx "pjsip show endpoint ${ext}" 2>/dev/null`, (err, stdout) => {
      if (err || !stdout) return resolve('Offline');
      if (stdout.includes('not found') || stdout.includes('object not found') || stdout.includes('Unable to find')) {
        resolve('Offline');
      } else if (stdout.match(new RegExp(`Endpoint:\\s+${ext}\\s+Unavailable`))) {
        resolve('Offline');
      } else if (stdout.match(new RegExp(`Endpoint:\\s+${ext}\\s+(Not in use|In use|Busy|Reachable)`))) {
        resolve('Online');
      } else if (stdout.includes('Endpoint:')) {
        resolve('Online');
      } else {
        resolve('Offline');
      }
    });
  });
}

/**
 * @param {string} username
 * @returns {Promise<{ sip_extension: string|null, user_id?: string }>}
 */
async function getAgentSipRow(username) {
  const { rows } = await pg.query(
    `SELECT user_id, username, sip_extension FROM gescall_users WHERE username = $1 LIMIT 1`,
    [username]
  );
  if (rows.length === 0) return { sip_extension: null };
  const sip = rows[0].sip_extension != null ? String(rows[0].sip_extension).trim() : null;
  return { sip_extension: sip || null, user_id: rows[0].user_id };
}

async function enrichCampaignIds(username, fallbackCampaignId) {
  try {
    const { rows: campRows } = await pg.query(
      `SELECT uc.campaign_id 
         FROM gescall_user_campaigns uc
         JOIN gescall_campaigns c ON uc.campaign_id = c.campaign_id
         WHERE uc.user_id = (SELECT user_id FROM gescall_users WHERE username = $1 LIMIT 1)
         AND c.active = true`,
      [username]
    );
    const campaigns = campRows.map((r) => r.campaign_id);
    const key = `gescall:agent:${username}`;
    if (campaigns.length > 0) {
      await redis.hSet(key, {
        campaign_ids: campaigns.join(','),
        campaign_id: String(campaigns[0]),
      });
    } else if (fallbackCampaignId) {
      const fid = String(fallbackCampaignId);
      await redis.hSet(key, { campaign_ids: fid, campaign_id: fid });
    }
  } catch (e) {
    if (fallbackCampaignId) {
      try {
        await redis.hSet(`gescall:agent:${username}`, {
          campaign_ids: String(fallbackCampaignId),
          campaign_id: String(fallbackCampaignId),
        });
      } catch (_) {}
    }
  }
}

/**
 * @param {object} ari
 * @param {string} sipExtension
 * @param {string[]} channelIdsToSkip
 */
async function findChannelForPjsipExtension(ari, sipExtension, channelIdsToSkip = []) {
  if (!sipExtension || !ari) return null;
  const ext = String(sipExtension).trim();
  const channels = await ari.channels.list().catch(() => []);
  const escaped = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const extRe = new RegExp(`PJSIP/${escaped}-|/${escaped}-`, 'i');
  const candidates = (channels || []).filter((ch) => {
    if (!ch || !ch.id) return false;
    if (channelIdsToSkip.includes(ch.id)) return false;
    const name = `${ch.name || ''} ${ch.caller?.name || ''} ${ch.connected?.name || ''}`;
    if (extRe.test(name)) return true;
    return false;
  });
  const up =
    candidates.find((c) => String(c.state || '').toLowerCase() === 'up') || candidates.find((c) => c.state !== 'Down');
  return up || null;
}

/**
 * Resuelve el canal Asterisk donde participa el agente en llamada.
 * @returns {Promise<{ channelId: string, source: string } | { error: string, code: string }>}
 */
async function resolveAgentVoiceChannel(username) {
  const ari = getClient();
  if (!ari) {
    return { error: 'ARI no está conectado; no es posible localizar ni espiar canales PBX.', code: 'ARI_UNAVAILABLE' };
  }
  const { sip_extension } = await getAgentSipRow(username);
  const stateMap = await redis.hGetAll(`gescall:agent:${username}`).catch(() => ({}));
  const hinted = stateMap.active_channel_id ? String(stateMap.active_channel_id).trim() : '';

  if (hinted) {
    try {
      const ch = await ari.channels.get({ channelId: hinted });
      if (ch && ch.id) {
        const st = String(ch.state || '').toLowerCase();
        if (st === 'down') {
          await redis.hDel(`gescall:agent:${username}`, 'active_channel_id').catch(() => {});
        } else {
          return { channelId: ch.id, source: 'redis_active_channel_id' };
        }
      }
    } catch (_) {
      await redis.hDel(`gescall:agent:${username}`, 'active_channel_id').catch(() => {});
    }
  }

  if (!sip_extension) {
    return {
      error:
        'No hay sip_extension para el agente en PostgreSQL; no se puede buscar canal PJSIP. Asegure extensión o active_channel_id en Redis tras integración PBX.',
      code: 'SIP_EXTENSION_MISSING',
    };
  }

  const found = await findChannelForPjsipExtension(ari, sip_extension);
  if (!found || !found.id) {
    return {
      error:
        'No se encontró un canal Asterisk coincidente con la extensión del agente (best-effort). El agente puede usar solo WebRTC con otro formato de nombre de canal.',
      code: 'AGENT_CHANNEL_NOT_FOUND',
    };
  }

  return { channelId: found.id, source: `pjsip_match:${sip_extension}` };
}

/**
 * Spy: audio de la llamada hacia canal snoop sin whisper.
 * Whisper: audio desde el canal de snoop hacia el agente (coach); parámetros ARI según documentación Asterisk.
 */
async function createSupervisorSnoop(mode, username, actorUsername) {
  const resolved = await resolveAgentVoiceChannel(username);
  if (resolved.error) return resolved;

  const ari = getClient();
  if (!ari) {
    return { error: 'ARI no está conectado.', code: 'ARI_UNAVAILABLE' };
  }

  const spy =
    mode === 'whisper'
      ? process.env.SUPERVISOR_SNOOP_SPY_WHISPER || 'both'
      : process.env.SUPERVISOR_SNOOP_SPY_SPY || 'both';
  const whisper =
    mode === 'whisper'
      ? process.env.SUPERVISOR_SNOOP_WHISPER || 'both'
      : process.env.SUPERVISOR_SNOOP_WHISPER_NONE || 'none';

  try {
    const snoopChannel = await ari.channels.snoopChannel({
      channelId: resolved.channelId,
      app: STASIS_SUPERVISOR_APP,
      appArgs: mode === 'whisper' ? 'supervisor_whisper' : 'supervisor_spy',
      snoopId: `sup-${username}-${Date.now()}`,
      spy,
      whisper,
    });
    const snoopId = snoopChannel && snoopChannel.id ? snoopChannel.id : null;
    if (!snoopId) {
      return { error: 'ARI devolvió snoop sin id de canal.', code: 'SNOOP_EMPTY' };
    }

    const attach = await attachSupervisorLegToSnoop(ari, snoopId, actorUsername, mode);
    if (!attach.ok) {
      try { await ari.channels.hangup({ channelId: snoopId }); } catch (_) {}
      return { error: attach.error, code: attach.code };
    }

    return {
      success: true,
      data: {
        agent_username: username,
        agent_channel_id: resolved.channelId,
        channel_resolution: resolved.source,
        snoop_channel_id: snoopId,
        mode,
        actor_username: actorUsername || null,
        ...attach.data,
      },
    };
  } catch (e) {
    console.error('[supervisorCallService] snoop:', e.message || e);
    return {
      error:
        e.message ||
        'Fallo al iniciar canal de supervisión PBX (snoop). Compruebe permisos ARI y que el canal del agente exista.',
      code: 'SNOOP_FAILED',
    };
  }
}

async function hangupChannelsForUsername(username) {
  const resolved = await resolveAgentVoiceChannel(username);
  if (resolved.error) {
    return { ok: false, error: resolved.error, code: resolved.code || 'CHANNEL_RESOLVE_FAIL' };
  }
  if (!resolved.channelId) {
    return { ok: false, error: 'Sin canal conocido.', code: 'CHANNEL_RESOLVE_FAIL' };
  }

  const ari = getClient();
  if (!ari) return { ok: false, error: 'ARI no está conectado.', code: 'ARI_UNAVAILABLE' };
  try {
    await ari.channels.hangup({ channelId: resolved.channelId });
    await redis.hDel(`gescall:agent:${username}`, 'active_channel_id').catch(() => {});
    return {
      ok: true,
      data: {
        hung_channel_id: resolved.channelId,
        resolution: resolved.source,
      },
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e), code: 'HANGUP_FAILED' };
  }
}

async function enrichAndEmitDashboard(io, username, payload) {
  let extension_status = 'N/A';
  try {
    const { rows } = await pg.query('SELECT sip_extension FROM gescall_users WHERE username = $1 LIMIT 1', [username]);
    if (rows.length > 0 && rows[0].sip_extension) {
      extension_status = await getExtensionStatusFast(rows[0].sip_extension);
    }
  } catch (_) {}
  io.emit('dashboard:realtime:update', {
    timestamp: new Date().toISOString(),
    agent_update: { username, ...payload, extension_status },
  });
}

async function applyForceReady(io, username) {
  const prev = await redis.hGetAll(`gescall:agent:${username}`).catch(() => ({}));
  const prevState = prev.state ? String(prev.state) : '';
  const ts = Date.now();

  await syncAgentPauseSegments(username, prevState, 'READY', prev.campaign_id || null, ts);

  const today = new Date().toISOString().slice(0, 10);
  let shift_day = prev.shift_day || today;
  let shift_accum_sec = parseInt(prev.shift_accum_sec || '0', 10) || 0;
  let shift_segment_start = parseInt(prev.shift_segment_start || '0', 10) || 0;
  const now = Date.now();

  if (shift_day !== today) {
    shift_day = today;
    shift_accum_sec = 0;
    const prevWasOnline = prevState && prevState !== 'OFFLINE' && prevState !== 'UNKNOWN';
    shift_segment_start = prevWasOnline ? now : 0;
  }

  const wasOnline = prevState && prevState !== 'OFFLINE' && prevState !== 'UNKNOWN';
  const isOnline = true;
  if (wasOnline && !isOnline && shift_segment_start > 0) {
    shift_accum_sec += Math.floor((now - shift_segment_start) / 1000);
    shift_segment_start = 0;
  }
  if (!wasOnline && isOnline) {
    shift_segment_start = now;
  }

  const payload = {
    state: 'READY',
    last_change: ts,
    shift_day,
    shift_accum_sec: String(shift_accum_sec),
  };
  if (shift_segment_start > 0) {
    payload.shift_segment_start = String(shift_segment_start);
  }

  await redis.hSet(`gescall:agent:${username}`, {
    ...payload,
    last_change: String(ts),
  });
  if (!payload.shift_segment_start) {
    await redis.hDel(`gescall:agent:${username}`, 'shift_segment_start').catch(() => {});
  }

  enrichCampaignIds(username, prev.campaign_id || null).catch(() => {});

  await enrichAndEmitDashboard(io, username, payload);
}

async function disconnectAgentSockets(io, username) {
  try {
    const ns = io.sockets;
    const map = ns && ns.sockets;
    if (!map || typeof map.forEach !== 'function') return 0;
    let n = 0;
    map.forEach((sock) => {
      if (sock && sock.agentUsername === username) {
        try {
          sock.disconnect(true);
          n += 1;
        } catch (_) {}
      }
    });
    return n;
  } catch (e) {
    console.error('[supervisorCallService] disconnectAgentSockets:', e.message);
    return 0;
  }
}

/**
 * Remote logout: OFFLINE Redis + mismo broadcast que desconectar socket agente + desconectar sockets.
 */
async function applyRemoteLogout(io, username, options = {}) {
  const hangupFirst = !!options.hangupFirst;
  if (hangupFirst) {
    const hang = await hangupChannelsForUsername(username);
    const benign = ['AGENT_CHANNEL_NOT_FOUND', 'SIP_EXTENSION_MISSING', 'CHANNEL_RESOLVE_FAIL'];
    if (
      !hang.ok &&
      hang.code === 'ARI_UNAVAILABLE'
    ) {
      return { ok: false, error: hang.error, code: hang.code };
    }
    if (!hang.ok && hang.code && !benign.includes(hang.code)) {
      return { ok: false, error: hang.error, code: hang.code };
    }
  }

  const prev = await redis.hGetAll(`gescall:agent:${username}`).catch(() => ({}));
  const prevLastChange = prev && prev.last_change ? parseInt(prev.last_change, 10) : 0;
  const lastChange = prevLastChange || Date.now();
  const prevState = prev.state ? String(prev.state) : '';
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

  await syncAgentPauseSegments(username, prevState, 'OFFLINE', prevCamp, now);
  await redis.hSet(`gescall:agent:${username}`, {
    state: 'OFFLINE',
    last_change: String(lastChange),
    shift_day,
    shift_accum_sec: String(shift_accum_sec),
  });
  await redis.hDel(`gescall:agent:${username}`, 'shift_segment_start').catch(() => {});
  await redis.hDel(`gescall:agent:${username}`, 'active_channel_id').catch(() => {});

  await enrichAndEmitDashboard(io, username, {
    state: 'OFFLINE',
    last_change,
    shift_day,
    shift_accum_sec: String(shift_accum_sec),
  });

  const disconnected = await disconnectAgentSockets(io, username);
  return { ok: true, data: { username, disconnectedSockets: disconnected } };
}

module.exports = {
  resolveAgentVoiceChannel,
  createSupervisorSnoop,
  hangupChannelsForUsername,
  applyForceReady,
  applyRemoteLogout,
  enrichAndEmitDashboard,
  getAgentSipRow,
  STASIS_SUPERVISOR_APP,
};
