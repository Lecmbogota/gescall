import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { 
  Phone, 
  Activity,
  Pause,
  FileText,
  XCircle,
  Eye,
  PhoneCall,
  Ban,
  Settings,
  Ear,
  MessageSquare,
  Users,
  Monitor,
  Edit,
} from 'lucide-react';
import { AgentStateChangeDialog } from './AgentStateChangeDialog';
import { AgentScreenViewDialog } from './AgentScreenViewDialog';
import { toast } from 'sonner';
import type { Agent, AgentStatus } from './AgentMonitor';

interface AgentMonitorListProps {
  agents: Agent[];
}

const getStatusConfig = (status: AgentStatus) => {
  switch (status) {
    case 'available':
      return {
        label: 'Disponible',
        color: 'bg-emerald-500',
        icon: Activity,
      };
    case 'incall':
      return {
        label: 'En Llamada',
        color: 'bg-blue-500',
        icon: Phone,
      };
    case 'paused':
      return {
        label: 'En Pausa',
        color: 'bg-amber-500',
        icon: Pause,
      };
    case 'disposition':
      return {
        label: 'Disposición',
        color: 'bg-purple-500',
        icon: FileText,
      };
    case 'dead':
      return {
        label: 'Desconectado',
        color: 'bg-slate-400',
        icon: XCircle,
      };
  }
};

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

export function AgentMonitorList({ agents }: AgentMonitorListProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isStateChangeDialogOpen, setIsStateChangeDialogOpen] = useState(false);
  const [isScreenViewDialogOpen, setIsScreenViewDialogOpen] = useState(false);

  const handleStateChange = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsStateChangeDialogOpen(true);
  };

  const handleScreenView = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsScreenViewDialogOpen(true);
  };

  const handleStateChangeConfirm = (newStatus: AgentStatus, pauseCode?: string, reason?: string) => {
    if (selectedAgent) {
      toast.success(
        `Estado de ${selectedAgent.name} cambiado a ${newStatus}${pauseCode ? ` (${pauseCode})` : ''}${reason ? ` - ${reason}` : ''}`
      );
    }
  };

  const getAgentMenuItems = (agent: Agent) => {
    const isInCall = agent.status === 'incall';
    
    return [
      {
        label: 'Ver Detalles',
        icon: <Eye className="w-4 h-4" />,
        action: () => {
          toast.info(`Ver detalles de ${agent.name}`);
        },
      },
      {
        label: 'Ver Pantalla',
        icon: <Monitor className="w-4 h-4" />,
        action: () => handleScreenView(agent),
        separator: true,
      },
      // Opciones de supervisión de llamadas (solo si está en llamada)
      ...(isInCall ? [
        {
          label: 'Espiar Llamada',
          icon: <Ear className="w-4 h-4" />,
          action: () => {
            toast.success(`Espiando llamada de ${agent.name}`, {
              description: 'Escuchando sin que el agente ni el cliente lo sepan',
            });
          },
        },
        {
          label: 'Susurrar a Agente',
          icon: <MessageSquare className="w-4 h-4" />,
          action: () => {
            toast.success(`Susurrando a ${agent.name}`, {
              description: 'Solo el agente puede escucharte',
            });
          },
        },
        {
          label: 'Intervenir en Llamada',
          icon: <Users className="w-4 h-4" />,
          action: () => {
            toast.success(`Interviniendo en llamada de ${agent.name}`, {
              description: 'Ahora puedes hablar con el agente y el cliente',
            });
          },
          separator: true,
        },
      ] : []),
      {
        label: 'Cambiar Estado',
        icon: <Edit className="w-4 h-4" />,
        action: () => {
          if (isInCall) {
            toast.error('No se puede cambiar el estado mientras está en llamada');
          } else {
            handleStateChange(agent);
          }
        },
        disabled: isInCall,
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
          if (isInCall) {
            toast.error('No se puede pausar mientras está en llamada');
          } else {
            toast.warning(`Pausando agente ${agent.name}`);
          }
        },
        disabled: isInCall,
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
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
              <TableRow>
                <TableHead className="bg-white">Agente</TableHead>
                <TableHead className="bg-white">Estado</TableHead>
                <TableHead className="bg-white">Campaña</TableHead>
                <TableHead className="bg-white">Tiempo en Estado</TableHead>
                <TableHead className="bg-white">Llamada Actual</TableHead>
                <TableHead className="bg-white text-right">Llamadas Hoy</TableHead>
                <TableHead className="bg-white text-right">Tiempo Hablado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {agents.map((agent) => {
              const statusConfig = getStatusConfig(agent.status);
              const StatusIcon = statusConfig.icon;

              return (
                <TableRow key={agent.id} className="cursor-pointer hover:bg-slate-50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="w-9 h-9">
                            <AvatarImage src={agent.avatar} alt={agent.name} />
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs">
                              {getInitials(agent.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${statusConfig.color}`} />
                        </div>
                        <div>
                          <div className="text-slate-900">{agent.name}</div>
                          <div className="text-sm text-slate-500">
                            Ext. {agent.extension}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusConfig.color} text-white`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-slate-700">{agent.campaign}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-slate-900 font-mono">
                        {formatTime(agent.timeInStatus)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {agent.currentCall ? (
                        <div>
                          <div className="text-slate-900">
                            {agent.currentCall.phoneNumber}
                          </div>
                          <div className="text-sm text-blue-600 font-mono">
                            {formatTime(agent.currentCall.duration)}
                          </div>
                        </div>
                      ) : agent.status === 'paused' && agent.pauseCode ? (
                        <div className="text-amber-600 text-sm">
                          {agent.pauseCode}
                        </div>
                      ) : (
                        <div className="text-slate-400">-</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-slate-900">{agent.todayStats.calls}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-slate-900 font-mono">
                        {formatTime(agent.todayStats.talkTime)}
                      </div>
                    </TableCell>
                  </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Dialogs */}
      {selectedAgent && (
        <>
          <AgentStateChangeDialog
            isOpen={isStateChangeDialogOpen}
            onClose={() => {
              setIsStateChangeDialogOpen(false);
              setSelectedAgent(null);
            }}
            agentName={selectedAgent.name}
            currentStatus={selectedAgent.status}
            onConfirm={handleStateChangeConfirm}
          />

          <AgentScreenViewDialog
            isOpen={isScreenViewDialogOpen}
            onClose={() => {
              setIsScreenViewDialogOpen(false);
              setSelectedAgent(null);
            }}
            agentName={selectedAgent.name}
            agentExtension={selectedAgent.extension}
          />
        </>
      )}
    </>
  );
}
