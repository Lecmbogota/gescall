/**
 * Registra segmentos de pausa para reportes (misma lógica que sockets/index agent:state:update).
 */
const pgDatabase = require('../config/pgDatabase');

/**
 * @param {string} username
 * @param {string} prevState
 * @param {string} newState
 * @param {string|null} campaignIdRaw
 * @param {number} eventTimeMs
 */
async function syncAgentPauseSegments(username, prevState, newState, campaignIdRaw, eventTimeMs) {
  /** Pausas que se registran en BD para reportes. */
  function isLoggedPauseState(s) {
    const u = String(s || '').toUpperCase();
    return u === 'NOT_READY' || u.startsWith('NOT_READY_') || u === 'PAUSED' || u === 'BREAK';
  }

  try {
    const campaignId =
      campaignIdRaw != null && String(campaignIdRaw).trim() !== '' ? String(campaignIdRaw) : null;
    const p = String(prevState || '').toUpperCase();
    const n = String(newState || '').toUpperCase();
    const prevPause = isLoggedPauseState(p);
    const newPause = isLoggedPauseState(n);
    const iso = new Date(eventTimeMs).toISOString();

    const closeLatestOpen = async () => {
      await pgDatabase.query(
        `UPDATE gescall_agent_pause_segments s
           SET ended_at = $1::timestamptz,
               duration_sec = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ($1::timestamptz - started_at)))::int)
           WHERE segment_id = (
             SELECT segment_id FROM gescall_agent_pause_segments
             WHERE agent_username = $2 AND ended_at IS NULL
             ORDER BY segment_id DESC
             LIMIT 1
           )`,
        [iso, username]
      );
    };

    const openSegment = async (code) => {
      await pgDatabase.query(
        `INSERT INTO gescall_agent_pause_segments (agent_username, pause_code, campaign_id, started_at)
           VALUES ($1, $2, $3, $4::timestamptz)`,
        [username, code, campaignId, iso]
      );
    };

    if (prevPause && (!newPause || p !== n)) {
      await closeLatestOpen();
    }
    if (newPause && (!prevPause || p !== n)) {
      await openSegment(n);
    }
  } catch (e) {
    console.error('[agentPauseSegmentsSync]', e.message);
  }
}

module.exports = { syncAgentPauseSegments };
