import { useState } from 'react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from './ui/hover-card';
import { 
  Phone, 
  Clock, 
  Pause,
  Activity,
  XCircle,
  FileText,
  User,
  PhoneCall,
  Ban,
  AlertCircle,
  Settings,
  Eye,
  Ear,
  MessageSquare,
  Users,
  Monitor,
  Edit,
  Mail,
  MapPin,
  Star,
  Briefcase,
  Languages,
  UserCheck,
} from 'lucide-react';
import { AgentStateChangeDialog } from './AgentStateChangeDialog';
import { AgentScreenViewDialog } from './AgentScreenViewDialog';
import { toast } from 'sonner';
import type { Agent, AgentStatus } from './AgentMonitor';

interface AgentMonitorCardProps {
  agent: Agent;
}

const getStatusConfig = (status: AgentStatus) => {
  switch (status) {
    case 'available':
      return {
        label: 'Disponible',
        color: 'bg-emerald-500',
        textColor: 'text-emerald-700',
        bgColor: 'bg-emerald-50',
        icon: Activity,
      };
    case 'incall':
      return {
        label: 'En Llamada',
        color: 'bg-blue-500',
        textColor: 'text-blue-700',
        bgColor: 'bg-blue-50',
        icon: Phone,
      };
    case 'paused':
      return {
        label: 'En Pausa',
        color: 'bg-amber-500',
        textColor: 'text-amber-700',
        bgColor: 'bg-amber-50',
        icon: Pause,
      };
    case 'disposition':
      return {
        label: 'Disposición',
        color: 'bg-purple-500',
        textColor: 'text-purple-700',
        bgColor: 'bg-purple-50',
        icon: FileText,
      };
    case 'dead':
      return {
        label: 'Desconectado',
        color: 'bg-slate-400',
        textColor: 'text-slate-700',
        bgColor: 'bg-slate-50',
        icon: XCircle,
      };
  }
};

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

export function AgentMonitorCard({ agent }: AgentMonitorCardProps) {
  const statusConfig = getStatusConfig(agent.status);
  const StatusIcon = statusConfig.icon;
  
  const [isStateChangeDialogOpen, setIsStateChangeDialogOpen] = useState(false);
  const [isScreenViewDialogOpen, setIsScreenViewDialogOpen] = useState(false);

  const handleStateChange = (newStatus: AgentStatus, pauseCode?: string, reason?: string) => {
    toast.success(
      `Estado de ${agent.name} cambiado a ${newStatus}${pauseCode ? ` (${pauseCode})` : ''}${reason ? ` - ${reason}` : ''}`
    );
    // Aquí iría la llamada a la API para cambiar el estado
  };

  const isInCall = agent.status === 'incall';

  const agentMenuItems = [
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
      action: () => {
        setIsScreenViewDialogOpen(true);
      },
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
        disabled: false,
      },
      {
        label: 'Susurrar a Agente',
        icon: <MessageSquare className="w-4 h-4" />,
        action: () => {
          toast.success(`Susurrando a ${agent.name}`, {
            description: 'Solo el agente puede escucharte',
          });
        },
        disabled: false,
      },
      {
        label: 'Intervenir en Llamada',
        icon: <Users className="w-4 h-4" />,
        action: () => {
          toast.success(`Interviniendo en llamada de ${agent.name}`, {
            description: 'Ahora puedes hablar con el agente y el cliente',
          });
        },
        disabled: false,
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
          setIsStateChangeDialogOpen(true);
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

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const cardContent = (
    <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="relative">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={agent.avatar} alt={agent.name} />
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                      {getInitials(agent.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${statusConfig.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-slate-900 truncate">{agent.name}</h3>
                  <p className="text-sm text-slate-500">Ext. {agent.extension}</p>
                </div>
              </div>
              <Badge className={`${statusConfig.color} text-white flex-shrink-0`}>
                {statusConfig.label}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* Campaign */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Campaña:</span>
              <span className="text-sm text-slate-900 truncate max-w-[60%]" title={agent.campaign}>
                {agent.campaign}
              </span>
            </div>

            {/* Time in Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Tiempo en estado:</span>
              <span className={`text-sm ${statusConfig.textColor}`}>
                {formatTime(agent.timeInStatus)}
              </span>
            </div>

            {/* Current Call Info */}
            {agent.currentCall && (
              <div className={`${statusConfig.bgColor} rounded-lg p-3 space-y-2`}>
                <div className="flex items-center gap-2">
                  <Phone className={`w-4 h-4 ${statusConfig.textColor}`} />
                  <span className="text-sm text-slate-900">
                    Llamada en curso
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">Número:</span>
                    <span className="text-xs text-slate-900">
                      {agent.currentCall.phoneNumber}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">Duración:</span>
                    <span className={`text-xs ${statusConfig.textColor}`}>
                      {formatTime(agent.currentCall.duration)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Pause Code */}
            {agent.status === 'paused' && agent.pauseCode && (
              <div className={`${statusConfig.bgColor} rounded-lg p-3`}>
                <div className="flex items-center gap-2">
                  <Pause className={`w-4 h-4 ${statusConfig.textColor}`} />
                  <span className="text-sm text-slate-900">
                    Código: {agent.pauseCode}
                  </span>
                </div>
              </div>
            )}

            {/* Today's Stats */}
            <div className="pt-3 border-t space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Llamadas hoy:</span>
                <span className="text-xs text-slate-900">
                  {agent.todayStats.calls}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Tiempo en llamadas:</span>
                <span className="text-xs text-slate-900">
                  {formatTime(agent.todayStats.talkTime)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Tiempo en pausa:</span>
                <span className="text-xs text-slate-900">
                  {formatTime(agent.todayStats.pauseTime)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
  );

  return (
    <>
      {agent.additionalInfo ? (
        <HoverCard openDelay={300}>
          <HoverCardTrigger asChild>
            {cardContent}
          </HoverCardTrigger>
          <HoverCardContent className="w-80" side="top">
            <div className="space-y-4">
              {/* Header con Avatar y Nombre */}
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={agent.avatar} alt={agent.name} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                    {getInitials(agent.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h4 className="text-slate-900">{agent.name}</h4>
                  {agent.email && (
                    <div className="flex items-center gap-1 text-xs text-slate-600">
                      <Mail className="w-3 h-3" />
                      {agent.email}
                    </div>
                  )}
                </div>
              </div>

              {/* Nivel de Habilidad */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Nivel de Habilidad</span>
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3 h-3 ${
                          i < agent.additionalInfo!.skillLevel
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Campañas */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Briefcase className="w-4 h-4" />
                  <span>Campañas Asignadas</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {agent.additionalInfo.campaigns.map((campaign, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {campaign}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Canales */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Phone className="w-4 h-4" />
                  <span>Canales Habilitados</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {agent.additionalInfo.channels.map((channel, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {channel}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Idiomas */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Languages className="w-4 h-4" />
                  <span>Idiomas</span>
                </div>
                <p className="text-sm text-slate-700">
                  {agent.additionalInfo.languages.join(', ')}
                </p>
              </div>

              {/* Ubicación y Turno */}
              <div className="grid grid-cols-1 gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-600">
                  <MapPin className="w-3 h-3" />
                  <span>{agent.additionalInfo.location}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Clock className="w-3 h-3" />
                  <span>{agent.additionalInfo.shift}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <UserCheck className="w-3 h-3" />
                  <span>Supervisor: {agent.additionalInfo.supervisor}</span>
                </div>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      ) : (
        cardContent
      )}

      {/* Dialogs */}
      <AgentStateChangeDialog
        isOpen={isStateChangeDialogOpen}
        onClose={() => setIsStateChangeDialogOpen(false)}
        agentName={agent.name}
        currentStatus={agent.status}
        onConfirm={handleStateChange}
      />

      <AgentScreenViewDialog
        isOpen={isScreenViewDialogOpen}
        onClose={() => setIsScreenViewDialogOpen(false)}
        agentName={agent.name}
        agentExtension={agent.extension}
      />
    </>
  );
}
