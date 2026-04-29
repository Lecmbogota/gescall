const database = require('../config/database');

/**
 * Mantiene activas las entradas en vicidial_live_agents para usuarios con remote agents activos
 * Esto hace que los usuarios aparezcan como disponibles en el reporte en tiempo real
 */
async function keepRemoteAgentsAlive() {
  try {
    // Obtener todos los remote agents activos
    const remoteAgents = await database.query(
      `SELECT DISTINCT user_start, campaign_id, server_ip, conf_exten 
       FROM vicidial_remote_agents 
       WHERE status = 'ACTIVE' 
       AND user_start IS NOT NULL`
    );

    for (const agent of remoteAgents) {
      try {
        // Verificar si existe entrada en live_agents
        const existing = await database.query(
          'SELECT live_agent_id FROM vicidial_live_agents WHERE user = ? LIMIT 1',
          [agent.user_start]
        );

        if (existing.length > 0) {
          // Actualizar entrada existente
          await database.query(
            `
            UPDATE vicidial_live_agents 
            SET 
              status = 'READY',
              campaign_id = ?,
              server_ip = ?,
              conf_exten = ?,
              last_update_time = CURRENT_TIMESTAMP
            WHERE user = ?
            `,
            [agent.campaign_id, agent.server_ip, agent.conf_exten, agent.user_start]
          );
        } else {
          // Crear nueva entrada
          await database.query(
            `
            INSERT INTO vicidial_live_agents 
            (user, server_ip, conf_exten, status, campaign_id, lead_id, random_id, user_level)
            VALUES (?, ?, ?, 'READY', ?, 0, ?, 1)
            `,
            [
              agent.user_start,
              agent.server_ip,
              agent.conf_exten,
              agent.campaign_id,
              Math.floor(Math.random() * 99999999),
            ]
          );
        }
      } catch (err) {
        console.error(`[KeepRemoteAgentsAlive] Error actualizando agente ${agent.user_start}:`, err.message);
      }
    }

    // Eliminar entradas de usuarios que ya no tienen remote agents activos
    const allLiveAgents = await database.query(
      `SELECT user FROM vicidial_live_agents WHERE user LIKE 'API%'`
    );

    for (const liveAgent of allLiveAgents) {
      const hasActiveRemoteAgent = await database.query(
        `SELECT COUNT(*) as count 
         FROM vicidial_remote_agents 
         WHERE user_start = ? AND status = 'ACTIVE'`,
        [liveAgent.user]
      );

      if (hasActiveRemoteAgent[0].count === 0) {
        // El remote agent ya no está activo, eliminar entrada
        await database.query(
          'DELETE FROM vicidial_live_agents WHERE user = ?',
          [liveAgent.user]
        );
      }
    }
  } catch (error) {
    console.error('[KeepRemoteAgentsAlive] Error general:', error.message);
  }
}

module.exports = { keepRemoteAgentsAlive };
