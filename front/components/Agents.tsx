import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Activity, TrendingUp, Loader2 } from 'lucide-react';
import { StandardPageHeader } from './ui/layout/StandardPageHeader';
import { AgentMonitor } from './AgentMonitor';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import api from '@/services/api';
import socketService from '@/services/socket';

interface AgentsProps {
  username: string;
}

interface Agent {
  user_id: number;
  username: string;
  full_name: string;
  sip_extension: string | null;
  agent_state: string;
  last_change: number | null;
  extension_status: string;
  campaigns: { id: string; name: string }[];
  campaign_ids: string[];
}

export function Agents({ username }: AgentsProps) {
  const [activeTab, setActiveTab] = useState('monitor');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch agents data from Node.js backend
  useEffect(() => {
    const fetchAgentsData = async () => {
      try {
        const result = await api.getLoggedInAgents();

        if (result.success && Array.isArray(result.data)) {
          setAgents(prev => {
            if (prev.length === 0) return result.data;
            // Merge: update existing agents, add new ones
            const map = new Map(prev.map(a => [a.user_id, a]));
            for (const fresh of result.data) {
              map.set(fresh.user_id, fresh);
            }
            return Array.from(map.values());
          });
          setLoading(false);
        }
      } catch (err) {
        // Silent on polling errors, keep existing data
      }
    };

    fetchAgentsData();

    // Poll HTTP every 15s as fallback (reduced from 10s since WebSocket is primary)
    const interval = setInterval(fetchAgentsData, 15000);

    return () => clearInterval(interval);
  }, []);

  // Real-time WebSocket updates for agent state + SIP extension status
  useEffect(() => {
    const handleRealtimeUpdate = (data: any) => {
      if (!data) return;

      // Single agent state change (includes extension_status)
      if (data.agent_update) {
        const upd = data.agent_update;
        console.log('[Agents WS] agent_update:', upd.username, upd.state, 'ext:', upd.extension_status);
        setAgents(prev => prev.map(agent => {
          if (agent.username === upd.username) {
            return {
              ...agent,
              agent_state: upd.state || agent.agent_state,
              last_change: parseInt(upd.last_change || 0),
              extension_status: upd.extension_status || agent.extension_status
            };
          }
          return agent;
        }));
      }

      // Bulk extensions status from periodic 30s tick
      if (data.extensions && typeof data.extensions === 'object') {
        const keys = Object.keys(data.extensions);
        if (keys.length > 0) console.log('[Agents WS] extensions:', keys.length, 'keys');
        setAgents(prev => prev.map(agent => {
          const extStatus = data.extensions[agent.username];
          if (extStatus) {
            return { ...agent, extension_status: extStatus };
          }
          return agent;
        }));
      }

      // Bulk agents state from periodic 5s tick
      if (Array.isArray(data.agents) && data.agents.length > 0) {
        console.log('[Agents WS] bulk agents:', data.agents.length);
        setAgents(prev => prev.map(agent => {
          const upd = data.agents.find((a: any) => a.username === agent.username);
          if (upd) {
            return {
              ...agent,
              agent_state: upd.state || agent.agent_state,
              last_change: parseInt(upd.last_change || upd.lastChange || 0)
            };
          }
          return agent;
        }));
      }
    };

    console.log('[Agents] Subscribing to WebSocket dashboard:realtime:update');
    socketService.connect();
    socketService.on('dashboard:realtime:update', handleRealtimeUpdate as any);

    return () => {
      console.log('[Agents] Unsubscribing from WebSocket');
      socketService.off('dashboard:realtime:update', handleRealtimeUpdate as any);
    };
  }, []);

  // Helper function to format duration in seconds to human readable
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Format timestamp for "last seen"
  const formatLastChange = (ts: number | null): string => {
    if (!ts) return '-';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)}m`;
    return `Hace ${Math.floor(diff / 3600000)}h`;
  };

  // Map agent_state to user-friendly display
  const getAgentStateInfo = (state: string) => {
    switch (state) {
      case 'READY': case 'WAITING': return { label: 'DISPONIBLE', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' };
      case 'ON_CALL': case 'INCALL': return { label: 'EN LLAMADA', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' };
      case 'ACW': case 'WRAPUP': return { label: 'CIERRE', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' };
      case 'PAUSED': case 'BREAK': case 'NOT_READY': return { label: 'EN PAUSA', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' };
      case 'RINGING': return { label: 'TIMBRANDO', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' };
      case 'DIALING': return { label: 'MARCANDO', color: 'bg-cyan-100 text-cyan-700', dot: 'bg-cyan-500' };
      case 'OFFLINE': return { label: 'DESCONECTADO', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' };
      default: return { label: state || 'DESCONECTADO', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' };
    }
  };

  const getExtensionStatusColor = (status: string) => {
    switch (status) {
      case 'Online': return 'bg-emerald-500';
      case 'Offline': return 'bg-slate-400';
      default: return 'bg-slate-300';
    }
  };

  return (
    <div className="flex flex-col h-full p-6">
      {/* Header con Tabs - Static */}
      <StandardPageHeader
        title="Agentes"
        username={username}
        description={activeTab === 'monitor'
          ? 'Monitoreo en tiempo real del estado de todos los agentes'
          : 'Vista de rendimiento y estadísticas de agentes'
        }
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="monitor" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Monitor en Tiempo Real
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Rendimiento
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </StandardPageHeader>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-hidden min-h-0">
        <Tabs value={activeTab} className="h-full">
          <TabsContent value="monitor" className="h-full mt-0">
            <AgentMonitor username={username} />
          </TabsContent>

          <TabsContent value="performance" className="h-full mt-0 overflow-auto">
            {loading ? (
              <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center p-12 text-slate-400 italic">
                No hay agentes registrados en el sistema
              </div>
            ) : (
              <div className="space-y-2 pb-6">
                {/* Table view: shows all agents with real status */}
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                      <tr>
                        <th className="px-6 py-3">Agente</th>
                        <th className="px-6 py-3">Extensión</th>
                        <th className="px-6 py-3">Estado Agente</th>
                        <th className="px-6 py-3">SIP</th>
                        <th className="px-6 py-3">Campañas</th>
                        <th className="px-6 py-3">Última Actividad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {agents.map((agent) => {
                        const stateInfo = getAgentStateInfo(agent.agent_state);
                        return (
                          <tr key={agent.user_id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                                  <span className="text-[11px] font-semibold text-slate-600">
                                    {(agent.full_name || agent.username).substring(0, 2).toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-slate-800 text-xs">{agent.full_name || agent.username}</p>
                                  <p className="text-[10px] text-slate-400">@{agent.username}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              {agent.sip_extension ? (
                                <code className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">{agent.sip_extension}</code>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider ${stateInfo.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${stateInfo.dot}`}></span>
                                {stateInfo.label}
                              </span>
                            </td>
                            <td className="px-6 py-3.5">
                              <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${agent.extension_status === 'Online' ? 'text-emerald-600' : 'text-slate-400'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${getExtensionStatusColor(agent.extension_status)}`}></span>
                                {agent.extension_status === 'N/A' ? 'Sin ext.' : agent.extension_status}
                              </span>
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="flex flex-wrap gap-1">
                                {agent.campaigns.length > 0 ? agent.campaigns.map(c => (
                                  <span key={c.id} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded truncate max-w-[120px]" title={c.name}>
                                    {c.name || c.id}
                                  </span>
                                )) : (
                                  <span className="text-xs text-slate-400 italic">Sin asignar</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-3.5 text-[10px] text-slate-500">
                              {formatLastChange(agent.last_change)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
