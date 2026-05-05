/**
 * Permisos supervisor/admin para acciones sobre agentes (mismo criterio que agentWorkspace supervisor).
 */
const pg = require('../config/pgDatabase');

/** Supervisores: is_system o rol con manage_agent_workspace o admin (retrocompat). */
async function canManageSupervisorAgentActions(req) {
    if (!req.user) return false;
    if (req.user.is_system === true || req.user.is_system === 'true') return true;

    // Fallback defensivo: algunos tokens traen role/role_name pero no permisos sincronizados.
    const roleName = String(req.user.role || req.user.role_name || '').trim().toUpperCase();
    if (roleName.includes('ADMIN') || roleName.includes('SUPERVISOR') || roleName === 'SUPER-ADMIN') {
        return true;
    }

    const roleId = req.user.role_id != null ? Number(req.user.role_id) : NaN;
    if (!Number.isFinite(roleId)) return false;
    const { rows } = await pg.query(
        `SELECT 1 FROM gescall_role_permissions
         WHERE role_id = $1 AND permission IN ('manage_agent_workspace', 'admin')
         LIMIT 1`,
        [roleId]
    );
    return rows.length > 0;
}

module.exports = { canManageSupervisorAgentActions };
