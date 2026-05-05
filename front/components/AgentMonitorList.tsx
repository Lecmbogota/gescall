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
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  Phone,
  Activity,
  Pause,
  FileText,
  XCircle,
  Ear,
  MessageSquare,
  UserCheck,
  LogOut,
  Loader2,
  MoreHorizontal,
} from 'lucide-react';
import type { Agent, AgentMonitorActionHandlers, AgentStatus } from './AgentMonitor';

interface AgentMonitorListProps {
  agents: Agent[];
  actionHandlers?: AgentMonitorActionHandlers;
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

export function AgentMonitorList({ agents, actionHandlers }: AgentMonitorListProps) {
  const [agentPendingLogout, setAgentPendingLogout] = useState<Agent | null>(null);

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
                {actionHandlers?.canManageSupervisorActions && (
                  <TableHead className="bg-white text-right">Acciones</TableHead>
                )}
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
                    {actionHandlers?.canManageSupervisorActions && (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              {actionHandlers.getLoadingAction(agent.username) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="w-4 h-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={
                                !!actionHandlers.getLoadingAction(agent.username) ||
                                !actionHandlers.canSpyOrWhisper(agent)
                              }
                              onClick={() => actionHandlers.onAction(agent, 'spy')}
                            >
                              <Ear className="w-4 h-4" />
                              Espiar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                !!actionHandlers.getLoadingAction(agent.username) ||
                                !actionHandlers.canSpyOrWhisper(agent)
                              }
                              onClick={() => actionHandlers.onAction(agent, 'whisper')}
                            >
                              <MessageSquare className="w-4 h-4" />
                              Susurrar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!!actionHandlers.getLoadingAction(agent.username)}
                              onClick={() => actionHandlers.onAction(agent, 'force-ready')}
                            >
                              <UserCheck className="w-4 h-4" />
                              Force ready
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={!!actionHandlers.getLoadingAction(agent.username)}
                              onClick={() => setAgentPendingLogout(agent)}
                            >
                              <LogOut className="w-4 h-4" />
                              Remote logout
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </div>

      <AlertDialog open={!!agentPendingLogout} onOpenChange={(open) => !open && setAgentPendingLogout(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar logout remoto</AlertDialogTitle>
            <AlertDialogDescription>
              {agentPendingLogout
                ? `Vas a cerrar la sesión de ${agentPendingLogout.name}. Esta acción puede desconectar su workspace.`
                : 'Esta acción requiere confirmación.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (agentPendingLogout && actionHandlers) {
                  actionHandlers.onAction(agentPendingLogout, 'remote-logout');
                }
                setAgentPendingLogout(null);
              }}
            >
              Confirmar logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
