import { useState, useEffect } from "react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import {
  Phone,
  Users,
  TrendingUp,
  Target,
  ChevronLeft,
  ChevronRight,
  Activity,
  Play,
  Pause,
  Edit,
  Copy,
  Settings,
  BarChart3,
  Download,
  Upload,
  Archive,
  Trash2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { CampaignCallerIdSettings } from "./CampaignCallerIdSettings";

interface Campaign {
  id: string;
  name: string;
  status: "active" | "paused" | "inactive";
  totalLeads: number;
  contactedLeads: number;
  successRate: number;
  dialingMethod: string;
  activeAgents: number;
  lastActivity: string;
  hasCallerId?: boolean;
  hasBlacklist?: boolean;

  autoDialLevel?: string;
}

interface CampaignImmersiveViewProps {
  campaigns: Campaign[];
  onSelectCampaign?: (campaign: Campaign) => void;
}

const getStatusConfig = (
  status: Campaign["status"],
): { label: string; color: string; bgColor: string } => {
  switch (status) {
    case "active":
      return {
        label: "Activa",
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
      };
    case "paused":
      return {
        label: "Pausada",
        color: "text-amber-600",
        bgColor: "bg-amber-50",
      };
    case "inactive":
      return {
        label: "Inactiva",
        color: "text-slate-600",
        bgColor: "bg-slate-50",
      };
  }
};

export function CampaignImmersiveView({
  campaigns,
  onSelectCampaign,
}: CampaignImmersiveViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const ROTATION_INTERVAL = 5000; // 5 segundos

  // Auto-rotate effect
  useEffect(() => {
    if (!isAutoRotating || campaigns.length <= 1) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentIndex((prev) =>
        prev < campaigns.length - 1 ? prev + 1 : 0,
      );
    }, ROTATION_INTERVAL);

    return () => clearInterval(interval);
  }, [isAutoRotating, campaigns.length]);

  if (campaigns.length === 0) {
    return null;
  }

  const campaign = campaigns[currentIndex];
  const statusConfig = getStatusConfig(campaign.status);
  const contactedPercentage =
    (campaign.contactedLeads / campaign.totalLeads) * 100;

  const handlePrevious = () => {
    setCurrentIndex((prev) =>
      prev > 0 ? prev - 1 : campaigns.length - 1,
    );
    setIsAutoRotating(false); // Pause auto-rotation on manual navigation
  };

  const handleNext = () => {
    setCurrentIndex((prev) =>
      prev < campaigns.length - 1 ? prev + 1 : 0,
    );
    setIsAutoRotating(false); // Pause auto-rotation on manual navigation
  };

  const toggleAutoRotation = () => {
    setIsAutoRotating((prev) => !prev);
  };

  // Menú contextual para la campaña actual
  const campaignMenuItems = [
    {
      label: "Ver Detalles",
      icon: <Eye className="w-4 h-4" />,
      action: () => {
        toast.info(`Ver detalles de: ${campaign.name}`);
      },
    },
    {
      label: campaign.status === "active" ? "Pausar Campaña" : "Reanudar Campaña",
      icon: campaign.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />,
      action: () => {
        const action = campaign.status === "active" ? "pausada" : "reanudada";
        toast.success(`Campaña ${action}: ${campaign.name}`);
      },
      separator: true,
    },
    {
      label: "Editar Campaña",
      icon: <Edit className="w-4 h-4" />,
      action: () => {
        toast.info(`Editando: ${campaign.name}`);
      },
    },
    {
      label: "Duplicar Campaña",
      icon: <Copy className="w-4 h-4" />,
      action: () => {
        toast.success(`Campaña duplicada: ${campaign.name} (copia)`);
      },
    },
    {
      label: "Configuración",
      icon: <Settings className="w-4 h-4" />,
      action: () => {
        toast.info(`Configurando: ${campaign.name}`);
      },
      separator: true,
    },
    {
      label: "Ver Reportes",
      icon: <BarChart3 className="w-4 h-4" />,
      action: () => {
        toast.info(`Abriendo reportes de: ${campaign.name}`);
      },
    },
    {
      label: "Exportar Datos",
      icon: <Download className="w-4 h-4" />,
      action: () => {
        toast.success(`Exportando datos de: ${campaign.name}`);
      },
    },
    {
      label: "Importar Leads",
      icon: <Upload className="w-4 h-4" />,
      action: () => {
        toast.info(`Importando leads a: ${campaign.name}`);
      },
      separator: true,
    },
    {
      label: "Archivar",
      icon: <Archive className="w-4 h-4" />,
      action: () => {
        toast.success(`Campaña archivada: ${campaign.name}`);
      },
    },
    {
      label: "Eliminar",
      icon: <Trash2 className="w-4 h-4" />,
      action: () => {
        toast.error(`Campaña eliminada: ${campaign.name}`);
      },
      variant: "danger" as const,
    },
  ];

  return (
    <div className="flex flex-col h-full pb-6">
      {/* Immersive Campaign View */}
      <div className="flex-1 overflow-auto min-h-0">
        <div className="max-w-7xl mx-auto">
          {/* Header Card */}
          <Card className="mb-6 border-2 shadow-lg bg-gradient-to-br from-white to-slate-50">
            <CardContent className="p-8">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-slate-900 text-3xl">
                      {campaign.name}
                    </h2>
                    <Badge
                      className={`${statusConfig.bgColor} ${statusConfig.color}`}
                    >
                      {statusConfig.label}
                    </Badge>
                  </div>
                  <p className="text-slate-600 text-lg">
                    Método de marcación:{" "}
                    {campaign.dialingMethod}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg">
                    <Activity className="w-5 h-5 text-blue-600" />
                    <span className="text-blue-900">
                      {campaign.activeAgents} agentes activos
                    </span>
                  </div>
                  {onSelectCampaign && (
                    <Button
                      onClick={() => onSelectCampaign(campaign)}
                      className="gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      Ver Detalles
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700">
                    Progreso de contacto
                  </span>
                  <span className="text-slate-900">
                    {contactedPercentage.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  value={contactedPercentage}
                  className="h-3"
                />
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>
                    {campaign.contactedLeads.toLocaleString()}{" "}
                    contactados
                  </span>
                  <span>
                    {campaign.totalLeads.toLocaleString()} total
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Total Leads Metric */}
            <Card className="border-2 shadow-md hover:shadow-xl transition-shadow bg-gradient-to-br from-blue-50 to-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-blue-100 rounded-xl">
                    <Target className="w-8 h-8 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-600 mb-1">
                      Total de Leads
                    </p>
                    <p className="text-slate-900 text-3xl">
                      {campaign.totalLeads.toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contacted Leads Metric */}
            <Card className="border-2 shadow-md hover:shadow-xl transition-shadow bg-gradient-to-br from-emerald-50 to-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-emerald-100 rounded-xl">
                    <Phone className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-600 mb-1">
                      Contactados
                    </p>
                    <p className="text-slate-900 text-3xl">
                      {campaign.contactedLeads.toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Success Rate Metric */}
            <Card className="border-2 shadow-md hover:shadow-xl transition-shadow bg-gradient-to-br from-purple-50 to-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-purple-100 rounded-xl">
                    <TrendingUp className="w-8 h-8 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-600 mb-1">
                      Tasa de % Avance
                    </p>
                    <p className="text-slate-900 text-3xl">
                      {campaign.successRate}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Additional Info Card */}
          <Card className="border-2 shadow-md bg-gradient-to-br from-slate-50 to-white">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-100 rounded-lg">
                    <Users className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-slate-600 mb-1">
                      Agentes Activos
                    </p>
                    <p className="text-slate-900 text-2xl">
                      {campaign.activeAgents}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <Phone className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-slate-600 mb-1">
                      Método de Marcación
                    </p>
                    <p className="text-slate-900 text-xl">
                      {campaign.dialingMethod}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CallerID Local Presence Settings */}
          <div className="mt-6">
            <CampaignCallerIdSettings campaignId={campaign.id} />
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevious}
              disabled={campaigns.length <= 1}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg">
              <span className="text-slate-600">
                {currentIndex + 1} / {campaigns.length}
              </span>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={toggleAutoRotation}
              title={
                isAutoRotating
                  ? "Pausar rotación automática"
                  : "Activar rotación automática"
              }
            >
              {isAutoRotating ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={handleNext}
              disabled={campaigns.length <= 1}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
