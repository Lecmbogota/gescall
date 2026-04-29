import { useAuthStore } from '../stores/authStore';
import { Badge } from './ui/badge';
import { Shield, Users, PhoneCall, Clock } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatToGlobalTimezone } from '@/lib/dateUtils';

export function UserSession() {
  const { session } = useAuthStore();
  const timezone = useSettingsStore(state => state.timezone);

  if (!session) {
    return null;
  }

  const { user, permissions, agentStatus, loggedInAgent } = session;

  return (
    <div className="p-4 bg-white rounded-lg border border-slate-200 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {user.name || user.id}
          </h3>
          <p className="text-sm text-slate-500">
            Usuario: {user.id}
          </p>
          {user.email && (
            <p className="text-sm text-slate-500">
              Email: {user.email}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Badge variant={permissions.active ? 'default' : 'outline'}>
            {permissions.active ? 'Activo' : 'Inactivo'}
          </Badge>

          {permissions.user_level !== null && permissions.user_level >= 9 && (
            <Badge variant="default" className="bg-purple-100 text-purple-700">
              <Shield className="w-3 h-3 mr-1" />
              Admin
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-500 flex items-center gap-1">
            <Users className="w-4 h-4" />
            Grupo
          </p>
          <p className="font-medium text-slate-900">
            {permissions.user_group || 'N/A'}
          </p>
        </div>

        <div>
          <p className="text-slate-500 flex items-center gap-1">
            <Shield className="w-4 h-4" />
            Nivel
          </p>
          <p className="font-medium text-slate-900">
            {permissions.user_level !== null ? permissions.user_level : 'N/A'}
          </p>
        </div>

        <div>
          <p className="text-slate-500 flex items-center gap-1">
            <PhoneCall className="w-4 h-4" />
            Campañas
          </p>
          <p className="font-medium text-slate-900">
            {permissions.campaigns.length}
          </p>
        </div>

        <div>
          <p className="text-slate-500">In-Groups</p>
          <p className="font-medium text-slate-900">
            {permissions.ingroups.length}
          </p>
        </div>
      </div>

      {agentStatus && (
        <div className="pt-4 border-t border-slate-200">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">
            Estado del Agente
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-500">Estado</p>
              <p className="font-medium text-slate-900">
                {agentStatus.status || 'N/A'}
              </p>
            </div>

            <div>
              <p className="text-slate-500">Campaña</p>
              <p className="font-medium text-slate-900">
                {agentStatus.campaign_id || 'N/A'}
              </p>
            </div>

            {agentStatus.calls_today && (
              <div>
                <p className="text-slate-500">Llamadas Hoy</p>
                <p className="font-medium text-slate-900">
                  {agentStatus.calls_today}
                </p>
              </div>
            )}

            {agentStatus.login_time && (
              <div>
                <p className="text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Login
                </p>
                <p className="font-medium text-slate-900">
                  {formatToGlobalTimezone(agentStatus.login_time, timezone, 'HH:mm:ss')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {loggedInAgent && (
        <div className="pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700">
              Sesión Activa
            </h4>
            <Badge variant="default" className="bg-green-100 text-green-700">
              En Línea
            </Badge>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-500">Campaña</p>
              <p className="font-medium text-slate-900">
                {loggedInAgent.campaign_id}
              </p>
            </div>

            <div>
              <p className="text-slate-500">Estado</p>
              <p className="font-medium text-slate-900">
                {loggedInAgent.status}
              </p>
            </div>

            {loggedInAgent.sub_status && (
              <div>
                <p className="text-slate-500">Sub-Estado</p>
                <p className="font-medium text-slate-900">
                  {loggedInAgent.sub_status}
                </p>
              </div>
            )}

            {loggedInAgent.calls_today && (
              <div>
                <p className="text-slate-500">Llamadas</p>
                <p className="font-medium text-slate-900">
                  {loggedInAgent.calls_today}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {permissions.campaigns.length > 0 && (
        <div className="pt-4 border-t border-slate-200">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">
            Campañas Permitidas
          </h4>
          <div className="flex flex-wrap gap-1">
            {permissions.campaigns.map((campaign) => (
              <Badge key={campaign} variant="outline" className="text-xs">
                {campaign}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
