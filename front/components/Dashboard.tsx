import { useState, useEffect, useMemo } from "react";
import { StandardPageHeader } from "./ui/layout/StandardPageHeader";
import { Badge } from "./ui/badge";
import type { CampaignStatusRow, ListCountRow } from "@/types/dashboardCampaign";
import { useAuthStore } from "@/stores/authStore";
import {
  Activity,
  PhoneCall,
  BarChart3,
  Users,
  Clock,
  TrendingUp,
  Phone,
  Settings,
  Edit3,
  ShoppingBag,
  X,
  Trash2,
  RotateCcw,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  LayoutGrid,
  LayoutList,
  Plus,
  StickyNote,
  CheckSquare,
  Link as LinkIcon,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { KPIWidget } from "./widgets/KPIWidget";
import { StatsWidget } from "./widgets/StatsWidget";
import { ListsWidget } from "./widgets/ListsWidget";
import { ActivityWidget } from "./widgets/ActivityWidget";
import { StickyNoteWidget } from "./widgets/StickyNoteWidget";
import { TodoListWidget } from "./widgets/TodoListWidget";
import { QuickLinksWidget } from "./widgets/QuickLinksWidget";
import { ClockWidget } from "./widgets/ClockWidget";
import { CalendarWidget } from "./widgets/CalendarWidget";
import { CampaignsSummaryWidget } from "./widgets/CampaignsSummaryWidget";
import { WidgetMarketplace, WidgetDefinition } from "./WidgetMarketplace";
import { ContextMenu } from "./ContextMenu";
import { Responsive, WidthProvider, Layout } from "react-grid-layout";
import { toast } from "sonner";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardProps {
  username: string;
}

interface WidgetLayout extends Layout {
  i: string;
}

interface WidgetState {
  id: string;
  enabled: boolean;
  isPaid: boolean;
}

export function Dashboard({ username }: DashboardProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);

  // Get user campaigns from auth store
  const { getCampaignIds, getUser, isLogged } = useAuthStore();
  const user = getUser();

  // Datos del dashboard (REST + tiempo real)
  const [campaignsData, setCampaignsData] = useState<CampaignStatusRow[]>([]);
  const [listsCountData, setListsCountData] = useState<ListCountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carga inicial vía API GesCall
  useEffect(() => {
    let isSubscribed = true;

    const loadInitialData = async () => {
      try {
        console.log('[Dashboard] ========== STARTING INITIAL DATA FETCH ==========');
        const userCampaigns = getCampaignIds();

        if (!userCampaigns || userCampaigns.length === 0) {
          console.warn('[Dashboard] No campaigns available for user, skipping data fetch');
          setLoading(false);
          setError('No campaigns assigned to your user');
          return;
        }

        const { default: api } = await import('@/services/api');

        const campaignsResult = await api.getBulkCampaignsStatus(userCampaigns);
        if (isSubscribed) {
          if (campaignsResult.success && campaignsResult.data) {
            setCampaignsData(campaignsResult.data);
          } else {
            console.warn('[Dashboard] ✗ No campaigns data received initially');
            setCampaignsData([]);
          }
        }

        const listsResult = await api.getBulkListsCount(userCampaigns);
        if (isSubscribed) {
          if (listsResult.success && listsResult.data) {
            setListsCountData(listsResult.data);
          } else {
            console.warn('[Dashboard] ✗ No lists data received initially');
            setListsCountData([]);
          }
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        console.error('[Dashboard] Error loading initial data:', err);
        if (isSubscribed) {
          setError(err instanceof Error ? err.message : 'Failed to fetch data');
          setLoading(false);
          setCampaignsData([]);
          setListsCountData([]);
        }
      }
    };

    // 1. Carga inicial de datos estáticos
    loadInitialData();

    // 2. Suscripción a WebSockets para métricas en tiempo real de Redis
    const handleDashboardUpdate = (updateData: any) => {
      if (!isSubscribed) return;
      console.log('[Dashboard] 📡 Real-time Redis update received:', updateData);

      // Si el backend envía las estadísticas como updateData.stats
      if (updateData?.stats) {
        // En un entorno completo, aquí mapearíamos las métricas específicas que llegan.
        // Simulamos una recarga parcial o actualizamos estados según lo que llegue.
        // Para este dashboard, actualizaremos los datos de las iteraciones reactivamente
        // si logramos extraer información sobre campañas de 'updateData.campaigns'
      }

      if (updateData?.campaigns && Array.isArray(updateData.campaigns)) {
        // Mapear los datos que vienen del WebSocket de Redis al formato del frontend
        const updatedCampaigns = updateData.campaigns.map((c: any) => ({
          campaign_id: c.campaign_id,
          campaign_name: c.campaign_name,
          estado: c.active === 'Y' ? 'Activa' : 'Inactiva',
          active: c.active,
          hopper_level: c.hopper_level,
          auto_dial_level: c.auto_dial_level
        }));
        setCampaignsData(updatedCampaigns);
      }
    };

    import('@/services/socket').then(({ default: socketService }) => {
      socketService.connect();
      socketService.subscribeToDashboard(handleDashboardUpdate);
    });

    return () => {
      isSubscribed = false;
      import('@/services/socket').then(({ default: socketService }) => {
        socketService.unsubscribeFromDashboard(handleDashboardUpdate);
      });
    };
  }, []);

  // Generar datos para gráficos de fondo
  const generateChartData = (
    points: number,
    trend: "up" | "down" | "stable" = "up"
  ) => {
    const data = [];
    let value = 30;
    for (let i = 0; i < points; i++) {
      if (trend === "up") {
        value += Math.random() * 10 + 2;
      } else if (trend === "down") {
        value += Math.random() * 5 - 3;
      } else {
        value += Math.random() * 6 - 3;
      }
      value = Math.max(20, Math.min(100, value));
      data.push({ value });
    }
    return data;
  };

  // Formato para widgets a partir de listas por campaña
  const listsData = useMemo(() => {
    return listsCountData.map((item) => ({
      id: item.campaign_id,
      name: item.campaign_id,
      total: item.cantidad_listas, // Number of lists per campaign
      contacted: 0, // Will need progress query to get actual contacted
      progress: 0, // Will need progress query to calculate
      campaign_id: item.campaign_id,
    }));
  }, [listsCountData]);

  // Calculate metrics from campaigns data
  const activeCampaigns = useMemo(() => {
    // Check 'estado' field which can be 'Activa', 'Pausada', 'Inactiva'
    return campaignsData.filter(c =>
      c.estado === 'Activa' || c.active === 'Y'
    ).length;
  }, [campaignsData]);

  const totalLists = useMemo(() => {
    // Sum cantidad_listas from all campaigns
    return listsCountData.reduce((sum, item) => sum + (item.cantidad_listas || 0), 0);
  }, [listsCountData]);

  const totalLeads = useMemo(() => {
    const fromApi = listsCountData.reduce((acc, item) => acc + (Number(item.lead_count) || 0), 0);
    if (fromApi > 0) return fromApi;
    return totalLists * 100;
  }, [listsCountData, totalLists]);

  const totalHopperLevel = useMemo(() => {
    return campaignsData.reduce((sum, campaign) => sum + (campaign.hopper_level || 0), 0);
  }, [campaignsData]);

  const avgAutoDialLevel = useMemo(() => {
    if (campaignsData.length === 0) return 0;
    const total = campaignsData.reduce((sum, campaign) => {
      let level = Number(campaign.auto_dial_level) || 0;
      // Sanitize: ignore crazy values like 1.47e+38 or negatives
      if (level > 100 || level < 0) {
        level = 0;
      }
      return sum + level;
    }, 0);
    // Return with 1 decimal place max
    const avg = total / campaignsData.length;
    return Math.round(avg * 10) / 10;
  }, [campaignsData]);

  // Calculate dialing level percentage based on hopper level
  const maxHopperCapacity = 1000; // Adjust based on your system capacity
  const dialingLevel = maxHopperCapacity > 0
    ? Math.min(100, Math.round((totalHopperLevel / maxHopperCapacity) * 100))
    : 0;

  // Real-time call metrics
  const currentCalls = {
    inProgress: totalHopperLevel,
    waiting: campaignsData.reduce((sum, c) => sum + (c.hopper_level || 0), 0),
    completed: 0, // Will need dial_log query
    failed: 0, // Will need dial_log query
  };

  // Definición de todos los widgets disponibles (solo con datos reales)
  const allWidgets: WidgetDefinition[] = [
    {
      id: "hopper-level",
      name: "Nivel de Hopper",
      description: "Leads en cola para ser marcados (hopper_level)",
      category: "kpi",
      isPaid: false,
      icon: Activity,
      defaultSize: { w: 3, h: 2 },
      installed: true,
      rating: 4.8,
    },
    {
      id: "auto-dial-level",
      name: "Nivel de Auto-Marcado",
      description: "Nivel promedio de auto marcado de campañas activas",
      category: "kpi",
      isPaid: false,
      icon: PhoneCall,
      defaultSize: { w: 3, h: 2 },
      installed: true,
      rating: 4.9,
    },
    {
      id: "active-campaigns",
      name: "Campañas Activas",
      description: "Número de campañas actualmente activas",
      category: "kpi",
      isPaid: false,
      icon: BarChart3,
      defaultSize: { w: 3, h: 2 },
      installed: true,
      rating: 4.7,
    },
    {
      id: "total-lists",
      name: "Listas Totales",
      description: "Total de listas en las campañas",
      category: "kpi",
      isPaid: false,
      icon: LayoutList,
      defaultSize: { w: 3, h: 2 },
      installed: true,
      rating: 4.6,
    },
    {
      id: "total-leads",
      name: "Total de Leads",
      description: "Suma total de leads en todas las listas",
      category: "kpi",
      isPaid: false,
      icon: Users,
      defaultSize: { w: 3, h: 2 },
      installed: true,
      rating: 4.5,
    },
    {
      id: "campaigns-table",
      name: "Estado de Campañas",
      description: "Tabla con el estado detallado de cada campaña",
      category: "list",
      isPaid: false,
      icon: BarChart3,
      defaultSize: { w: 12, h: 4 },
      installed: true,
      rating: 4.9,
    },
    {
      id: "lists-table",
      name: "Listas por Campaña",
      description: "Tabla con todas las listas y su conteo de leads",
      category: "list",
      isPaid: false,
      icon: LayoutList,
      defaultSize: { w: 12, h: 4 },
      installed: true,
      rating: 4.7,
    },
    // Widgets de pago (ejemplos)
    {
      id: "advanced-analytics",
      name: "Analítica Avanzada",
      description: "Gráficos avanzados con predicciones y tendencias",
      category: "chart",
      isPaid: true,
      price: 29.99,
      icon: TrendingUp,
      defaultSize: { w: 6, h: 4 },
      installed: false,
      rating: 4.9,
    },
    {
      id: "ai-insights",
      name: "Insights con IA",
      description: "Recomendaciones inteligentes basadas en IA",
      category: "chart",
      isPaid: true,
      price: 49.99,
      icon: Activity,
      defaultSize: { w: 6, h: 3 },
      installed: false,
      rating: 5.0,
    },
    {
      id: "heat-maps",
      name: "Mapas de Calor",
      description: "Visualización de actividad por hora y día",
      category: "chart",
      isPaid: true,
      price: 19.99,
      icon: BarChart3,
      defaultSize: { w: 6, h: 3 },
      installed: false,
      rating: 4.7,
    },
    // Nuevos widgets de productividad
    {
      id: "sticky-note",
      name: "Nota Adhesiva",
      description: "Toma notas rápidas en tu dashboard",
      category: "productivity" as const,
      isPaid: false,
      icon: StickyNote,
      defaultSize: { w: 3, h: 3 },
      installed: false,
      rating: 4.6,
    },
    {
      id: "todo-list",
      name: "Lista de Tareas",
      description: "Gestiona tus tareas pendientes",
      category: "productivity" as const,
      isPaid: false,
      icon: CheckSquare,
      defaultSize: { w: 4, h: 4 },
      installed: false,
      rating: 4.8,
    },
    {
      id: "quick-links",
      name: "Enlaces Rápidos",
      description: "Accesos directos a recursos importantes",
      category: "utility" as const,
      isPaid: false,
      icon: LinkIcon,
      defaultSize: { w: 4, h: 3 },
      installed: false,
      rating: 4.5,
    },
    {
      id: "clock-widget",
      name: "Reloj Mundial",
      description: "Reloj en tiempo real con zona horaria",
      category: "utility" as const,
      isPaid: false,
      icon: Clock,
      defaultSize: { w: 3, h: 2 },
      installed: false,
      rating: 4.7,
    },
    {
      id: "calendar-widget",
      name: "Calendario",
      description: "Calendario mensual con eventos",
      category: "utility" as const,
      isPaid: false,
      icon: Calendar,
      defaultSize: { w: 4, h: 4 },
      installed: false,
      rating: 4.9,
    },
    {
      id: "campaigns-summary",
      name: "Resumen de Campañas",
      description: "Vista consolidada con métricas de todas tus campañas",
      category: "chart" as const,
      isPaid: false,
      icon: BarChart3,
      defaultSize: { w: 6, h: 4 },
      installed: false,
      rating: 4.9,
    },
  ];

  const [widgets, setWidgets] = useState<WidgetState[]>(() => {
    const saved = localStorage.getItem("dashboardWidgets");
    let savedWidgets: WidgetState[] = [];

    if (saved) {
      savedWidgets = JSON.parse(saved);
    }

    // Lista de widgets que deben estar habilitados por defecto
    // Solo estos 4 widgets están activos inicialmente
    const defaultEnabledWidgets = [
      "active-campaigns",  // Campañas Activas
      "total-lists",       // Listas Totales
      "lists-table",       // Listas por Campaña
      "sticky-note"        // Nota Rápida
    ];

    // Sincronizar con allWidgets - agregar nuevos widgets que no están en el estado guardado
    const syncedWidgets = allWidgets.map((w) => {
      const existingWidget = savedWidgets.find((sw) => sw.id === w.id);
      if (existingWidget) {
        return existingWidget;
      }
      // Nuevo widget - habilitado solo si está en la lista de widgets por defecto
      return {
        id: w.id,
        enabled: defaultEnabledWidgets.includes(w.id),
        isPaid: w.isPaid,
      };
    });

    return syncedWidgets;
  });

  const [layouts, setLayouts] = useState<{ lg: WidgetLayout[] }>(() => {
    const saved = localStorage.getItem("dashboardLayouts");
    if (saved) {
      return JSON.parse(saved);
    }
    // Layout por defecto - solo los 4 widgets habilitados
    return {
      lg: [
        { i: "active-campaigns", x: 0, y: 0, w: 3, h: 2 },
        { i: "total-lists", x: 3, y: 0, w: 3, h: 2 },
        { i: "sticky-note", x: 6, y: 0, w: 6, h: 3 },
        { i: "lists-table", x: 0, y: 3, w: 12, h: 4 },
      ],
    };
  });

  useEffect(() => {
    localStorage.setItem("dashboardWidgets", JSON.stringify(widgets));
  }, [widgets]);

  useEffect(() => {
    localStorage.setItem("dashboardLayouts", JSON.stringify(layouts));
  }, [layouts]);

  const handleLayoutChange = (currentLayout: Layout[], allLayouts: any) => {
    setLayouts(allLayouts);
  };

  const handleInstallWidget = (widgetId: string) => {
    const widget = allWidgets.find((w) => w.id === widgetId);
    if (!widget) return;

    // Activar el widget
    setWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, enabled: true } : w))
    );

    // Añadir al layout si no existe
    setLayouts((prev) => {
      const exists = prev.lg.some((item) => item.i === widgetId);
      if (!exists) {
        const maxY = Math.max(...prev.lg.map((item) => item.y + item.h), 0);
        return {
          lg: [
            ...prev.lg,
            {
              i: widgetId,
              x: 0,
              y: maxY,
              w: widget.defaultSize.w,
              h: widget.defaultSize.h,
            },
          ],
        };
      }
      return prev;
    });

    // Actualizar installed en allWidgets (esto es solo para el estado local)
    const widgetIndex = allWidgets.findIndex((w) => w.id === widgetId);
    if (widgetIndex !== -1) {
      allWidgets[widgetIndex].installed = true;
    }

    // Notificar al usuario
    toast.success(`Widget instalado: ${widget.name}`);
  };

  const handleUninstallWidget = (widgetId: string) => {
    const widget = allWidgets.find((w) => w.id === widgetId);

    setWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, enabled: false } : w))
    );

    const widgetIndex = allWidgets.findIndex((w) => w.id === widgetId);
    if (widgetIndex !== -1) {
      allWidgets[widgetIndex].installed = false;
    }

    // Notificar al usuario
    if (widget) {
      toast.success(`Widget desinstalado: ${widget.name}`);
    }
  };

  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
  };

  const removeWidget = (widgetId: string) => {
    handleUninstallWidget(widgetId);
  };

  const resetLayout = () => {
    localStorage.removeItem("dashboardLayouts");
    setLayouts({
      lg: [
        { i: "active-campaigns", x: 0, y: 0, w: 3, h: 2 },
        { i: "total-lists", x: 3, y: 0, w: 3, h: 2 },
        { i: "sticky-note", x: 6, y: 0, w: 6, h: 3 },
        { i: "lists-table", x: 0, y: 3, w: 12, h: 4 },
      ],
    });
    toast.success("Layout restablecido a valores por defecto");
  };

  const resetAllWidgets = () => {
    // Lista de widgets que deben estar habilitados por defecto
    const defaultEnabledWidgets = [
      "active-campaigns",  // Campañas Activas
      "total-lists",       // Listas Totales
      "lists-table",       // Listas por Campaña
      "sticky-note"        // Nota Rápida
    ];

    localStorage.removeItem("dashboardWidgets");
    setWidgets(
      allWidgets.map((w) => ({
        id: w.id,
        enabled: defaultEnabledWidgets.includes(w.id),
        isPaid: w.isPaid,
      }))
    );
    toast.success("Widgets restablecidos a valores por defecto");
  };

  // Menú contextual para el dashboard
  const dashboardMenuItems = [
    {
      label: isEditMode ? "Desactivar Edición" : "Activar Edición",
      icon: isEditMode ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />,
      action: toggleEditMode,
    },
    {
      label: "Marketplace de Widgets",
      icon: <ShoppingBag className="w-4 h-4" />,
      action: () => setMarketplaceOpen(true),
      separator: true,
    },
    {
      label: "Restaurar Layout",
      icon: <RotateCcw className="w-4 h-4" />,
      action: resetLayout,
      separator: true,
    },
    {
      label: "Restablecer Widgets",
      icon: <Trash2 className="w-4 h-4" />,
      action: resetAllWidgets,
      variant: "danger" as const,
    },
  ];

  // Función para crear menú contextual de widget
  const getWidgetMenuItems = (widgetId: string) => {
    const widget = allWidgets.find((w) => w.id === widgetId);
    if (!widget) return [];

    return [
      {
        label: "Configurar Widget",
        icon: <Settings className="w-4 h-4" />,
        action: () => {
          toast.info(`Configurar widget: ${widget.name}`);
        },
      },
      {
        label: "Desactivar Widget",
        icon: <EyeOff className="w-4 h-4" />,
        action: () => {
          removeWidget(widgetId);
          toast.success(`Widget desactivado: ${widget.name}`);
        },
        separator: true,
        variant: "danger" as const,
      },
    ];
  };

  // Actualizar installed basado en widgets enabled
  const updatedWidgets = useMemo(() => {
    return allWidgets.map((w) => ({
      ...w,
      installed: widgets.find((ws) => ws.id === w.id)?.enabled || false,
    }));
  }, [widgets]);

  const renderWidget = (widgetId: string) => {
    const widget = allWidgets.find((w) => w.id === widgetId);
    if (!widget) {
      console.warn(`Widget not found: ${widgetId}`);
      return null;
    }

    const widgetState = widgets.find((w) => w.id === widgetId);
    if (!widgetState?.enabled) {
      return null;
    }

    let content = null;

    switch (widgetId) {
      case "hopper-level":
        content = (
          <KPIWidget
            title="Nivel de Hopper"
            value={totalHopperLevel.toString()}
            subtitle={`Leads en cola para marcar`}
            icon={Activity}
            color="text-green-600"
            bgColor="bg-green-100"
            progress={dialingLevel}
            chartData={generateChartData(24, "up")}
            chartColor="#16a34a"
          />
        );
        break;
      case "auto-dial-level":
        content = (
          <KPIWidget
            title="Nivel Auto-Marcado"
            value={avgAutoDialLevel.toString()}
            subtitle={`Promedio de ${campaignsData.length} campañas`}
            icon={PhoneCall}
            color="text-purple-600"
            bgColor="bg-purple-100"
            chartData={generateChartData(24, "stable")}
            chartColor="#9333ea"
          />
        );
        break;
      case "active-campaigns":
        content = (
          <KPIWidget
            title="Campañas Activas"
            value={activeCampaigns.toString()}
            subtitle={`${campaignsData.length} campañas totales`}
            icon={BarChart3}
            color="text-orange-600"
            bgColor="bg-orange-100"
            chartData={generateChartData(24, "up")}
            chartColor="#ea580c"
          />
        );
        break;
      case "total-lists":
        content = (
          <KPIWidget
            title="Listas Totales"
            value={totalLists.toString()}
            subtitle={`En ${campaignsData.length} campañas`}
            icon={LayoutList}
            color="text-cyan-600"
            bgColor="bg-cyan-100"
            chartData={generateChartData(24, "stable")}
            chartColor="#0891b2"
          />
        );
        break;
      case "total-leads":
        content = (
          <KPIWidget
            title="Total de Leads"
            value={totalLeads.toLocaleString()}
            subtitle={`En ${totalLists} listas`}
            icon={Users}
            color="text-indigo-600"
            bgColor="bg-indigo-100"
            chartData={generateChartData(24, "up")}
            chartColor="#4f46e5"
          />
        );
        break;
      case "campaigns-table":
        content = (
          <div className="h-full w-full bg-white rounded-lg border border-slate-200 p-4 overflow-auto">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-slate-600" />
              Estado de Campañas
            </h3>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : campaignsData.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-500">
                No hay datos de campañas disponibles
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-medium text-slate-700">ID</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700">Nombre</th>
                      <th className="text-center py-2 px-3 font-medium text-slate-700">Estado</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-700">Listas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignsData.map((campaign, idx) => {
                      // Find lists count for this campaign
                      const listsCount = listsCountData.find(l => l.campaign_id === campaign.campaign_id);
                      return (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-900 font-mono text-xs">{campaign.campaign_id}</td>
                          <td className="py-2 px-3 text-slate-900">{campaign.campaign_name}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${campaign.estado === 'Activa'
                              ? 'bg-green-100 text-green-700'
                              : campaign.estado === 'Pausada'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-slate-100 text-slate-700'
                              }`}>
                              {campaign.estado || (campaign.active === 'Y' ? 'Activa' : 'Inactiva')}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-slate-900 font-medium">
                            {listsCount?.cantidad_listas || 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
        break;
      case "lists-table":
        content = (
          <div className="h-full w-full bg-white rounded-lg border border-slate-200 p-4 overflow-auto">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <LayoutList className="w-5 h-5 text-slate-600" />
              Listas por Campaña
            </h3>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : listsCountData.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-500">
                No hay datos de listas disponibles
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-medium text-slate-700">Campaña</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700">Nombre Campaña</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-700">Cantidad de Listas</th>
                      <th className="text-center py-2 px-3 font-medium text-slate-700">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listsCountData.map((item, idx) => {
                      // Find campaign name from campaignsData
                      const campaign = campaignsData.find(c => c.campaign_id === item.campaign_id);
                      return (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-900 font-mono text-xs">{item.campaign_id}</td>
                          <td className="py-2 px-3 text-slate-900">{campaign?.campaign_name || item.campaign_id}</td>
                          <td className="py-2 px-3 text-right text-slate-900 font-medium">
                            {(item.cantidad_listas || 0).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${campaign?.estado === 'Activa' ? 'bg-green-100 text-green-700' :
                              campaign?.estado === 'Pausada' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                              {campaign?.estado || 'N/A'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
        break;
      case "sticky-note":
        content = (
          <StickyNoteWidget
            id={widgetId}
            color="yellow"
            onSave={(id, note) => {
              console.log("Nota guardada:", id, note);
            }}
          />
        );
        break;
      case "todo-list":
        content = (
          <TodoListWidget
            id={widgetId}
            onUpdate={(id, todos) => {
              console.log("Tareas actualizadas:", id, todos);
            }}
          />
        );
        break;
      case "quick-links":
        content = <QuickLinksWidget id={widgetId} />;
        break;
      case "clock-widget":
        content = (
          <ClockWidget showDate={true} showSeconds={true} />
        );
        break;
      case "calendar-widget":
        content = <CalendarWidget events={[]} />;
        break;
      case "campaigns-summary":
        content = <CampaignsSummaryWidget />;
        break;
      default:
        content = (
          <div className="h-full flex items-center justify-center bg-slate-100 rounded-lg border-2 border-dashed border-slate-300">
            <p className="text-slate-500">Widget: {widget.name}</p>
          </div>
        );
    }

    // Solo agregar menú contextual si está en modo edición
    if (isEditMode) {
      return (
        <ContextMenu items={getWidgetMenuItems(widgetId)}>
          <div className="h-full w-full relative group">
            {content}
            {/* Edit mode indicator */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-out z-10 pointer-events-none">
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs rounded-md shadow-lg">
                <Edit3 className="w-3 h-3" />
                <span>Editar</span>
              </div>
            </div>
          </div>
        </ContextMenu>
      );
    }

    return (
      <div className="h-full w-full relative group">
        {content}
      </div>
    );
  };

  const enabledWidgets = widgets.filter((w) => w.enabled);

  // Filtrar el layout para solo incluir widgets habilitados
  const activeLayout = useMemo(() => {
    const enabledIds = new Set(enabledWidgets.map((w) => w.id));
    return {
      lg: layouts.lg.filter((item) => enabledIds.has(item.i)),
    };
  }, [layouts, enabledWidgets]);

  return (
    <ContextMenu items={dashboardMenuItems}>
      <div className="flex flex-col h-full p-6">
        <StandardPageHeader title="Dashboard" username={username} />

        {/* Info de modo edición */}
        {isEditMode && (
          <div className="flex-shrink-0 mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Edit3 className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-blue-900">
                  Modo de edición activado
                </p>
                <p className="text-blue-600 text-sm">
                  Arrastra los widgets para reorganizar, redimensiona desde las esquinas,
                  o usa clic derecho sobre cualquier widget para más opciones
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Grid de Widgets - Scrollable Area */}
        <div className="flex-1 overflow-auto min-h-0">
          {enabledWidgets.length === 0 ? (
            // Empty State
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <div className="mb-6 inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-300">
                  <LayoutGrid className="w-12 h-12 text-slate-400" />
                </div>
                <h3 className="text-slate-700 mb-3">
                  No hay widgets activos
                </h3>
                <p className="text-slate-500 mb-8">
                  Agrega widgets desde el marketplace para comenzar a visualizar tus datos y métricas del call center
                </p>
                <button
                  onClick={() => setMarketplaceOpen(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 ease-out shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40"
                >
                  <Plus className="w-5 h-5" />
                  Explorar Widgets
                </button>
              </div>
            </div>
          ) : (
            // Widgets Grid
            <div className={`pb-6 ${isEditMode ? 'edit-mode-active' : 'edit-mode-inactive'}`}>
              <ResponsiveGridLayout
                className="layout"
                layouts={activeLayout}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={80}
                onLayoutChange={handleLayoutChange}
                isDraggable={isEditMode}
                isResizable={isEditMode}
                draggableHandle={isEditMode ? undefined : ".no-drag"}
                margin={[16, 16]}
                containerPadding={[0, 0]}
              >
                {activeLayout.lg.map((item) => (
                  <div key={item.i} className="widget-container">
                    {renderWidget(item.i)}
                  </div>
                ))}
              </ResponsiveGridLayout>
            </div>
          )}
        </div>

        {/* Marketplace Modal */}
        <WidgetMarketplace
          open={marketplaceOpen}
          onOpenChange={setMarketplaceOpen}
          availableWidgets={updatedWidgets}
          onInstallWidget={handleInstallWidget}
          onUninstallWidget={handleUninstallWidget}
        />
      </div>
    </ContextMenu>
  );
}
