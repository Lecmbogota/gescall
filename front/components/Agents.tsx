import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import api from '@/services/api';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Phone, Clock, CheckCircle2, TrendingUp, Activity } from 'lucide-react';
import { StandardPageHeader } from './ui/layout/StandardPageHeader';
import { AgentMonitor } from './AgentMonitor';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';

interface AgentsProps {
  username: string;
}

interface Agent {
  id: number;
  name: string;
  status: string;
  campaign: string;
  calls: number;
  duration: string;
  success: number;
}

export function Agents({ username }: AgentsProps) {
  const [activeTab, setActiveTab] = useState('monitor');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch agents data from Node.js backend (Vicidial API)
  useEffect(() => {
    const fetchAgentsData = async () => {
      try {
        console.log('[Agents] Fetching agents from backend...');
        const result = await api.getLoggedInAgents();

        if (result && Array.isArray(result)) {
          // Transform backend data to Agent format
          const transformedAgents: Agent[] = result.map((agent: any, index: number) => ({
            id: index + 1,
            name: agent.full_name || agent.user || 'Unknown',
            status: agent.status === 'INCALL' ? 'active' : agent.status === 'PAUSED' ? 'break' : 'offline',
            campaign: agent.campaign_id || 'N/A',
            calls: parseInt(agent.calls_today) || 0,
            duration: formatDuration(parseInt(agent.time_on_calls) || 0),
            success: 65, // Placeholder - needs calculation from call statuses
          }));

          setAgents(transformedAgents);
        }

        setLoading(false);
      } catch (err) {
        console.error('[Agents] Error fetching data:', err);
        setLoading(false);
        toast.error('Error al cargar datos de agentes');
        // Use mock data as fallback
        setAgents(mockAgents);
      }
    };

    fetchAgentsData();

    // Refresh every 10 seconds
    const interval = setInterval(fetchAgentsData, 10000);

    return () => clearInterval(interval);
  }, []);

  // Helper function to format duration in seconds to human readable
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const mockAgents: Agent[] = [
    {
      id: 1,
      name: 'Ana García',
      status: 'active',
      campaign: 'Ventas Q4 2025',
      calls: 45,
      duration: '3h 22m',
      success: 68,
    },
    {
      id: 2,
      name: 'Pedro Martínez',
      status: 'active',
      campaign: 'Retención Clientes',
      calls: 38,
      duration: '2h 54m',
      success: 72,
    },
    {
      id: 3,
      name: 'Carlos Ruiz',
      status: 'break',
      campaign: 'Cobranza',
      calls: 12,
      duration: '0h 48m',
      success: 54,
    },
    {
      id: 4,
      name: 'María López',
      status: 'active',
      campaign: 'Ventas Q4 2025',
      calls: 52,
      duration: '4h 10m',
      success: 75,
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'break':
        return 'bg-yellow-500';
      case 'offline':
        return 'bg-slate-400';
      default:
        return 'bg-slate-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'En llamada';
      case 'break':
        return 'En pausa';
      case 'offline':
        return 'Desconectado';
      default:
        return status;
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
            <div className="space-y-6 pb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {agents.map((agent) => (
                  <Card key={agent.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback className="bg-blue-600 text-white">
                              {agent.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <CardTitle className="text-base">{agent.name}</CardTitle>
                            <CardDescription>{agent.campaign}</CardDescription>
                          </div>
                        </div>
                        <Badge className={`${getStatusColor(agent.status)} text-white`}>
                          {getStatusText(agent.status)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="flex flex-col items-center p-3 bg-blue-50 rounded-lg">
                          <Phone className="w-5 h-5 text-blue-600 mb-1" />
                          <p className="text-slate-900">{agent.calls}</p>
                          <p className="text-slate-600 text-xs">Llamadas</p>
                        </div>
                        <div className="flex flex-col items-center p-3 bg-purple-50 rounded-lg">
                          <Clock className="w-5 h-5 text-purple-600 mb-1" />
                          <p className="text-slate-900">{agent.duration}</p>
                          <p className="text-slate-600 text-xs">Tiempo</p>
                        </div>
                        <div className="flex flex-col items-center p-3 bg-green-50 rounded-lg">
                          <TrendingUp className="w-5 h-5 text-green-600 mb-1" />
                          <p className="text-slate-900">{agent.success}%</p>
                          <p className="text-slate-600 text-xs">% Avance</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
