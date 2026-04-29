import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { 
  Phone,
  Clock,
  TrendingUp,
  Activity,
  Pause,
  FileText,
  XCircle,
  Eye,
  PhoneCall,
  Ban,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Agent, AgentStatus } from './AgentMonitor';

interface AgentMonitorHeatmapProps {
  agents: Agent[];
}

const getStatusConfig = (status: AgentStatus) => {
  switch (status) {
    case 'available':
      return {
        label: 'Disponible',
        color: 'bg-emerald-500',
        borderColor: 'border-emerald-500',
        textColor: 'text-emerald-700',
        icon: Activity,
      };
    case 'incall':
      return {
        label: 'En Llamada',
        color: 'bg-blue-500',
        borderColor: 'border-blue-500',
        textColor: 'text-blue-700',
        icon: Phone,
      };
    case 'paused':
      return {
        label: 'En Pausa',
        color: 'bg-amber-500',
        borderColor: 'border-amber-500',
        textColor: 'text-amber-700',
        icon: Pause,
      };
    case 'disposition':
      return {
        label: 'Disposición',
        color: 'bg-purple-500',
        borderColor: 'border-purple-500',
        textColor: 'text-purple-700',
        icon: FileText,
      };
    case 'dead':
      return {
        label: 'Desconectado',
        color: 'bg-slate-400',
        borderColor: 'border-slate-400',
        textColor: 'text-slate-700',
        icon: XCircle,
      };
  }
};

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

const getEfficiencyColor = (talkTime: number, loginTime: number): string => {
  if (loginTime === 0) return 'bg-slate-100';
  const efficiency = (talkTime / loginTime) * 100;
  
  if (efficiency >= 70) return 'bg-green-100 border-green-300';
  if (efficiency >= 50) return 'bg-yellow-100 border-yellow-300';
  if (efficiency >= 30) return 'bg-orange-100 border-orange-300';
  return 'bg-red-100 border-red-300';
};

const calculateEfficiency = (talkTime: number, loginTime: number): number => {
  if (loginTime === 0) return 0;
  return Math.round((talkTime / loginTime) * 100);
};

export function AgentMonitorHeatmap({ agents }: AgentMonitorHeatmapProps) {
  // Agrupar por campaña
  const agentsByCampaign = agents.reduce((acc, agent) => {
    const campaign = agent.campaign || 'Sin campaña';
    if (!acc[campaign]) {
      acc[campaign] = [];
    }
    acc[campaign].push(agent);
    return acc;
  }, {} as Record<string, Agent[]>);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getAgentMenuItems = (agent: Agent) => [
    {
      label: 'Ver Detalles',
      icon: <Eye className="w-4 h-4" />,
      action: () => {
        toast.info(`Ver detalles de ${agent.name}`);
      },
    },
    {
      label: 'Llamar a Agente',
      icon: <PhoneCall className="w-4 h-4" />,
      action: () => {
        toast.success(`Llamando a ${agent.name} (${agent.extension})`);
      },
      separator: true,
    },
    {
      label: 'Forzar Pausa',
      icon: <Pause className="w-4 h-4" />,
      action: () => {
        toast.warning(`Pausando agente ${agent.name}`);
      },
    },
    {
      label: 'Desconectar Agente',
      icon: <Ban className="w-4 h-4" />,
      action: () => {
        toast.error(`Desconectando agente ${agent.name}`);
      },
      variant: 'danger' as const,
      separator: true,
    },
    {
      label: 'Configurar Agente',
      icon: <Settings className="w-4 h-4" />,
      action: () => {
        toast.info(`Configurando ${agent.name}`);
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Leyenda */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Mapa de Calor - Eficiencia por Agente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border-2 border-green-300 rounded"></div>
              <span className="text-slate-600">≥70% Eficiencia</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-100 border-2 border-yellow-300 rounded"></div>
              <span className="text-slate-600">50-69% Eficiencia</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-100 border-2 border-orange-300 rounded"></div>
              <span className="text-slate-600">30-49% Eficiencia</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 border-2 border-red-300 rounded"></div>
              <span className="text-slate-600">&lt;30% Eficiencia</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agrupado por campaña */}
      {Object.entries(agentsByCampaign).map(([campaign, campaignAgents]) => (
        <Card key={campaign}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{campaign}</span>
              <Badge variant="outline">
                {campaignAgents.length} agente{campaignAgents.length !== 1 ? 's' : ''}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {campaignAgents.map((agent) => {
                const statusConfig = getStatusConfig(agent.status);
                const StatusIcon = statusConfig.icon;
                const efficiency = calculateEfficiency(
                  agent.todayStats.talkTime,
                  agent.todayStats.loginTime
                );
                const efficiencyColor = getEfficiencyColor(
                  agent.todayStats.talkTime,
                  agent.todayStats.loginTime
                );

                return (
                  <div
                    key={agent.id}
                    className={`
                      ${efficiencyColor}
                      border-2 rounded-lg p-3 cursor-pointer
                      hover:shadow-md transition-all duration-200
                      relative overflow-hidden
                    `}
                  >
                      {/* Status indicator */}
                      <div className="absolute top-2 right-2">
                        <div className={`w-3 h-3 rounded-full ${statusConfig.color} animate-pulse`}></div>
                      </div>

                      {/* Agent Info */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-shrink-0">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={agent.avatar} alt={agent.name} />
                              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs">
                                {getInitials(agent.name)}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-900 truncate pr-4">
                              {agent.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              Ext. {agent.extension}
                            </div>
                          </div>
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className={`w-3 h-3 ${statusConfig.textColor}`} />
                          <span className={`text-xs ${statusConfig.textColor}`}>
                            {statusConfig.label}
                          </span>
                        </div>

                        {/* Efficiency */}
                        <div className="pt-2 border-t border-slate-200">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-600">
                              Eficiencia:
                            </span>
                            <span className="text-xs text-slate-900">
                              {efficiency}%
                            </span>
                          </div>
                        </div>

                        {/* Calls */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span className="text-xs text-slate-600">
                              Llamadas:
                            </span>
                          </div>
                          <span className="text-xs text-slate-900">
                            {agent.todayStats.calls}
                          </span>
                        </div>

                        {/* Talk Time */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span className="text-xs text-slate-600">
                              Hablado:
                            </span>
                          </div>
                          <span className="text-xs text-slate-900">
                            {formatTime(agent.todayStats.talkTime)}
                          </span>
                        </div>

                        {/* Current call indicator */}
                        {agent.currentCall && (
                          <div className="pt-2 border-t border-blue-200">
                            <div className="flex items-center gap-1 text-blue-600">
                              <Phone className="w-3 h-3 animate-pulse" />
                              <span className="text-xs">
                                {formatTime(agent.currentCall.duration)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
