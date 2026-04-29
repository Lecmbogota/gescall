import { useState, useEffect } from "react";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Search,
  LayoutGrid,
  List,
  Activity,
  Phone,
  Pause,
  Clock,
  TrendingUp,
  Users,
  RefreshCw,
  Download,
  Settings,
} from "lucide-react";
import { Badge } from "./ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { UserGreeting } from "./UserGreeting";
import { AgentMonitorCard } from "./AgentMonitorCard";
import { AgentMonitorList } from "./AgentMonitorList";
import { AgentMonitorHeatmap } from "./AgentMonitorHeatmap";
import { toast } from "sonner";

export type AgentStatus =
  | "available"
  | "incall"
  | "paused"
  | "disposition"
  | "dead";

export interface Agent {
  id: string;
  name: string;
  extension: string;
  avatar?: string;
  email?: string;
  status: AgentStatus;
  campaign: string;
  timeInStatus: number; // en segundos
  currentCall?: {
    phoneNumber: string;
    leadId: string;
    duration: number;
    campaignName: string;
  };
  todayStats: {
    calls: number;
    talkTime: number; // en segundos
    pauseTime: number;
    loginTime: number;
  };
  pauseCode?: string;
  lastActivity: string;
  // Información adicional para el hover card
  additionalInfo?: {
    campaigns: string[];
    channels: string[];
    skillLevel: number; // 1-5
    location: string;
    shift: string;
    languages: string[];
    supervisor: string;
  };
}

interface AgentMonitorProps {
  username: string;
}

// Mock data - En producción esto vendría del WebSocket
const mockAgents: Agent[] = [
  {
    id: "AGT001",
    name: "María González",
    extension: "8001",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop",
    email: "maria.gonzalez@gescall.com",
    status: "incall",
    campaign: "Ventas Q4 2025",
    timeInStatus: 342,
    currentCall: {
      phoneNumber: "+34 612 345 678",
      leadId: "LEAD-1234",
      duration: 342,
      campaignName: "Ventas Q4 2025",
    },
    todayStats: {
      calls: 47,
      talkTime: 8420,
      pauseTime: 1200,
      loginTime: 25200,
    },
    lastActivity: new Date().toISOString(),
    additionalInfo: {
      campaigns: ["Ventas Q4 2025", "Retención Premium", "Upselling"],
      channels: ["Telefónico", "Email", "WhatsApp"],
      skillLevel: 5,
      location: "Madrid, España",
      shift: "Mañana (09:00 - 17:00)",
      languages: ["Español", "Inglés"],
      supervisor: "Juan Pérez",
    },
  },
  {
    id: "AGT002",
    name: "Carlos Rodríguez",
    extension: "8002",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
    email: "carlos.rodriguez@gescall.com",
    status: "available",
    campaign: "Retención Clientes",
    timeInStatus: 15,
    todayStats: {
      calls: 52,
      talkTime: 9180,
      pauseTime: 900,
      loginTime: 24600,
    },
    lastActivity: new Date().toISOString(),
    additionalInfo: {
      campaigns: ["Retención Clientes", "Soporte Técnico"],
      channels: ["Telefónico", "Chat"],
      skillLevel: 4,
      location: "Barcelona, España",
      shift: "Tarde (14:00 - 22:00)",
      languages: ["Español", "Catalán", "Inglés"],
      supervisor: "Ana Martín",
    },
  },
  {
    id: "AGT003",
    name: "Ana Martínez",
    extension: "8003",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop",
    email: "ana.martinez@gescall.com",
    status: "paused",
    campaign: "Ventas Q4 2025",
    timeInStatus: 480,
    pauseCode: "BREAK",
    todayStats: {
      calls: 38,
      talkTime: 6840,
      pauseTime: 2100,
      loginTime: 21600,
    },
    lastActivity: new Date().toISOString(),
    additionalInfo: {
      campaigns: ["Ventas Q4 2025", "Cobranza"],
      channels: ["Telefónico", "SMS"],
      skillLevel: 3,
      location: "Valencia, España",
      shift: "Mañana (09:00 - 17:00)",
      languages: ["Español"],
      supervisor: "Juan Pérez",
    },
  },
  {
    id: "AGT004",
    name: "Juan López",
    extension: "8004",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop",
    email: "juan.lopez@gescall.com",
    status: "disposition",
    campaign: "Cobranza",
    timeInStatus: 45,
    todayStats: {
      calls: 41,
      talkTime: 7260,
      pauseTime: 600,
      loginTime: 23400,
    },
    lastActivity: new Date().toISOString(),
    additionalInfo: {
      campaigns: ["Cobranza", "Recuperación"],
      channels: ["Telefónico"],
      skillLevel: 4,
      location: "Sevilla, España",
      shift: "Tarde (14:00 - 22:00)",
      languages: ["Español"],
      supervisor: "Ana Martín",
    },
  },
  {
    id: "AGT005",
    name: "Laura Sánchez",
    extension: "8005",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop",
    email: "laura.sanchez@gescall.com",
    status: "incall",
    campaign: "Ventas Q4 2025",
    timeInStatus: 127,
    currentCall: {
      phoneNumber: "+34 623 456 789",
      leadId: "LEAD-5678",
      duration: 127,
      campaignName: "Ventas Q4 2025",
    },
    todayStats: {
      calls: 45,
      talkTime: 8100,
      pauseTime: 1500,
      loginTime: 24000,
    },
    lastActivity: new Date().toISOString(),
    additionalInfo: {
      campaigns: ["Ventas Q4 2025", "Cross-selling"],
      channels: ["Telefónico", "Email", "WhatsApp", "Chat"],
      skillLevel: 5,
      location: "Madrid, España",
      shift: "Mañana (09:00 - 17:00)",
      languages: ["Español", "Inglés", "Francés"],
      supervisor: "Juan Pérez",
    },
  },
  {
    id: "AGT006",
    name: "Pedro Fernández",
    extension: "8006",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop",
    email: "pedro.fernandez@gescall.com",
    status: "available",
    campaign: "Retención Clientes",
    timeInStatus: 8,
    todayStats: {
      calls: 49,
      talkTime: 8760,
      pauseTime: 1800,
      loginTime: 25800,
    },
    lastActivity: new Date().toISOString(),
    additionalInfo: {
      campaigns: ["Retención Clientes", "Atención al Cliente"],
      channels: ["Telefónico", "Chat", "Email"],
      skillLevel: 3,
      location: "Bilbao, España",
      shift: "Noche (22:00 - 06:00)",
      languages: ["Español", "Euskera"],
      supervisor: "Ana Martín",
    },
  },
  {
    id: "AGT007",
    name: "Sofía García",
    extension: "8007",
    avatar: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&h=400&fit=crop",
    email: "sofia.garcia@gescall.com",
    status: "dead",
    campaign: "N/A",
    timeInStatus: 3600,
    todayStats: {
      calls: 0,
      talkTime: 0,
      pauseTime: 0,
      loginTime: 0,
    },
    lastActivity: new Date(Date.now() - 3600000).toISOString(),
    additionalInfo: {
      campaigns: ["Encuestas", "Calidad"],
      channels: ["Telefónico", "Email"],
      skillLevel: 2,
      location: "Zaragoza, España",
      shift: "Mañana (09:00 - 17:00)",
      languages: ["Español"],
      supervisor: "Juan Pérez",
    },
  },
  {
    id: "AGT008",
    name: "Miguel Torres",
    extension: "8008",
    avatar: "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=400&h=400&fit=crop",
    email: "miguel.torres@gescall.com",
    status: "incall",
    campaign: "Encuestas Satisfacción",
    timeInStatus: 215,
    currentCall: {
      phoneNumber: "+34 634 567 890",
      leadId: "LEAD-9012",
      duration: 215,
      campaignName: "Encuestas Satisfacción",
    },
    todayStats: {
      calls: 56,
      talkTime: 10080,
      pauseTime: 600,
      loginTime: 26400,
    },
    lastActivity: new Date().toISOString(),
    additionalInfo: {
      campaigns: ["Encuestas Satisfacción", "NPS", "CSAT"],
      channels: ["Telefónico", "SMS", "Email"],
      skillLevel: 4,
      location: "Málaga, España",
      shift: "Tarde (14:00 - 22:00)",
      languages: ["Español", "Inglés"],
      supervisor: "Ana Martín",
    },
  },
];

export function AgentMonitor({ username }: AgentMonitorProps) {
  const [agents, setAgents] = useState<Agent[]>(mockAgents);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [viewMode, setViewMode] = useState<
    "grid" | "list" | "heatmap"
  >("grid");
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);

  // Simular actualización en tiempo real
  useEffect(() => {
    if (!isAutoRefresh) return;

    const interval = setInterval(() => {
      setAgents((prevAgents) =>
        prevAgents.map((agent) => ({
          ...agent,
          timeInStatus: agent.timeInStatus + 1,
          currentCall: agent.currentCall
            ? {
                ...agent.currentCall,
                duration: agent.currentCall.duration + 1,
              }
            : undefined,
        })),
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [isAutoRefresh]);

  const filteredAgents = agents.filter((agent) => {
    const matchesSearch =
      agent.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      agent.extension.includes(searchTerm);
    const matchesStatus =
      statusFilter === "all" || agent.status === statusFilter;
    const matchesCampaign =
      campaignFilter === "all" ||
      agent.campaign === campaignFilter;
    return matchesSearch && matchesStatus && matchesCampaign;
  });

  // Obtener campañas únicas
  const campaigns = Array.from(
    new Set(agents.map((a) => a.campaign)),
  ).filter((c) => c !== "N/A");

  // Estadísticas generales
  const stats = {
    total: agents.length,
    available: agents.filter((a) => a.status === "available")
      .length,
    incall: agents.filter((a) => a.status === "incall").length,
    paused: agents.filter((a) => a.status === "paused").length,
    offline: agents.filter((a) => a.status === "dead").length,
  };

  // Menú contextual
  const monitorMenuItems = [
    {
      label: isAutoRefresh
        ? "Pausar Actualización"
        : "Reanudar Actualización",
      icon: isAutoRefresh ? (
        <Pause className="w-4 h-4" />
      ) : (
        <Activity className="w-4 h-4" />
      ),
      action: () => {
        setIsAutoRefresh(!isAutoRefresh);
        toast.success(
          isAutoRefresh
            ? "Actualización automática pausada"
            : "Actualización automática reanudada",
        );
      },
    },
    {
      label: "Forzar Actualización",
      icon: <RefreshCw className="w-4 h-4" />,
      action: () => {
        toast.success("Datos actualizados");
      },
      separator: true,
    },
    {
      label: "Exportar Estado Actual",
      icon: <Download className="w-4 h-4" />,
      action: () => {
        toast.success("Exportando estado de agentes...");
      },
    },
    {
      label: "Configuración Monitor",
      icon: <Settings className="w-4 h-4" />,
      action: () => {
        toast.info("Abriendo configuración del monitor");
      },
    },
  ];

  return (
    <div className="flex flex-col h-full">
        {/* Stats Cards - Static */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 flex-shrink-0 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-600 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl text-slate-900">
                {stats.total}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-emerald-600 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Disponibles
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl text-emerald-600">
                {stats.available}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-blue-600 flex items-center gap-2">
                <Phone className="w-4 h-4" />
                En Llamada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl text-blue-600">
                {stats.incall}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-amber-600 flex items-center gap-2">
                <Pause className="w-4 h-4" />
                En Pausa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl text-amber-600">
                {stats.paused}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-500 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Desconectados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl text-slate-500">
                {stats.offline}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and View Switcher - Static */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between flex-shrink-0 mb-6 relative z-30">
          <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar agente o extensión..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Todos los estados
                </SelectItem>
                <SelectItem value="available">
                  Disponibles
                </SelectItem>
                <SelectItem value="incall">
                  En llamada
                </SelectItem>
                <SelectItem value="paused">En pausa</SelectItem>
                <SelectItem value="disposition">
                  En disposición
                </SelectItem>
                <SelectItem value="dead">
                  Desconectados
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={campaignFilter}
              onValueChange={setCampaignFilter}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Todas las campañas
                </SelectItem>
                {campaigns.map((campaign) => (
                  <SelectItem key={campaign} value={campaign}>
                    {campaign}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as any)}
            className="w-auto"
          >
            <TabsList>
              <TabsTrigger
                value="grid"
                className="px-3"
                aria-label="Vista de tarjetas"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="sr-only">Tarjetas</span>
              </TabsTrigger>

              <TabsTrigger
                value="list"
                className="px-3"
                aria-label="Vista de lista"
              >
                <List className="w-4 h-4" />
                <span className="sr-only">Lista</span>
              </TabsTrigger>

              <TabsTrigger
                value="heatmap"
                className="px-3"
                aria-label="Mapa de calor"
              >
                <TrendingUp className="w-4 h-4" />
                <span className="sr-only">Mapa de calor</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Agent Views - Scrollable Area */}
        <div className="flex-1 overflow-auto min-h-0">
          {viewMode === "grid" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
              {filteredAgents.map((agent) => (
                <AgentMonitorCard
                  key={agent.id}
                  agent={agent}
                />
              ))}
            </div>
          )}

          {viewMode === "list" && (
            <div className="pb-6">
              <AgentMonitorList agents={filteredAgents} />
            </div>
          )}

          {viewMode === "heatmap" && (
            <div className="pb-6">
              <AgentMonitorHeatmap agents={filteredAgents} />
            </div>
          )}

          {filteredAgents.length === 0 && (
            <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed">
              <Users className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">
                No se encontraron agentes
              </p>
            </div>
          )}
        </div>

        {/* Auto-refresh indicator */}
        {isAutoRefresh && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-pulse">
            <Activity className="w-4 h-4" />
            <span className="text-sm">
              Actualización automática activa
            </span>
          </div>
        )}
    </div>
  );
}