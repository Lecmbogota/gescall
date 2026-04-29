import { useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Skeleton } from './ui/skeleton';
import {
  Users,
  TrendingUp,
  Phone,
  Eye,
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
} from 'lucide-react';
import { CampaignDetailsModal } from './CampaignDetailsModal';
import { toast } from 'sonner';

interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'inactive';
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

interface CampaignCompactViewProps {
  campaigns: Campaign[];
  onSelectCampaign?: (campaign: Campaign) => void;
}

export function CampaignCompactView({ campaigns, onSelectCampaign }: CampaignCompactViewProps) {
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'paused':
        return 'bg-yellow-500';
      case 'inactive':
        return 'bg-slate-400';
      default:
        return 'bg-slate-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Activa';
      case 'paused':
        return 'Pausada';
      case 'inactive':
        return 'Inactiva';
      default:
        return status;
    }
  };

  const handleOpenDetails = (campaign: Campaign) => {
    if (onSelectCampaign) {
      onSelectCampaign(campaign);
    } else {
      setSelectedCampaign(campaign);
      setIsDetailsOpen(true);
    }
  };

  // Función para crear menú contextual por campaña
  const getCampaignMenuItems = (campaign: Campaign) => [
    {
      label: "Ver Detalles",
      icon: <Eye className="w-4 h-4" />,
      action: () => {
        handleOpenDetails(campaign);
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
    <>
      <div className="space-y-3">
        {campaigns.map((campaign) => {
          const progressPercentage =
            (campaign.contactedLeads / campaign.totalLeads) * 100;
          const isLoading = campaign.dialingMethod === 'Cargando...';

          return (
            <div
              key={campaign.id}
              className={`bg-white rounded-lg border p-4 transition-shadow duration-300 ease-out ${isLoading
                ? 'cursor-wait opacity-70'
                : 'hover:shadow-md cursor-pointer'
                }`}
              onClick={() => !isLoading && handleOpenDetails(campaign)}
            >
              <div className="flex items-center justify-between gap-4">
                {/* Name and Status */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {isLoading ? (
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-5 w-40" />
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                      ) : (
                        <>
                          <h3 className="text-slate-900 truncate">{campaign.name}</h3>
                          <Badge className={`${getStatusColor(campaign.status)} text-white flex-shrink-0`}>
                            {getStatusText(campaign.status)}
                          </Badge>
                        </>
                      )}
                    </div>
                    {isLoading ? (
                      <Skeleton className="h-4 w-32 mt-1" />
                    ) : (
                      <div className="flex items-center gap-1 text-slate-500">
                        <Phone className="w-3 h-3" />
                        <span>{campaign.dialingMethod}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6">
                  {/* Progress */}
                  <div className="w-32">
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-500">Progreso</span>
                      <span className="text-slate-900">
                        {isLoading ? (
                          <Skeleton className="h-4 w-8 inline-block" />
                        ) : (
                          `${Math.round(progressPercentage)}%`
                        )}
                      </span>
                    </div>
                    {isLoading ? (
                      <Skeleton className="h-1.5 w-full rounded-full" />
                    ) : (
                      <Progress value={progressPercentage} className="h-1.5" />
                    )}
                  </div>

                  {/* Agents */}
                  <div className="flex items-center gap-2 min-w-[80px]">
                    <div className="bg-blue-100 rounded-lg p-2">
                      <Users className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-slate-500">Agentes</div>
                      {isLoading ? (
                        <Skeleton className="h-4 w-6" />
                      ) : (
                        <div className="text-slate-900">{campaign.activeAgents}</div>
                      )}
                    </div>
                  </div>

                  {/* Success Rate */}
                  <div className="flex items-center gap-2 min-w-[80px]">
                    <div className="bg-green-100 rounded-lg p-2">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <div className="text-slate-500">% Avance</div>
                      {isLoading ? (
                        <Skeleton className="h-4 w-10" />
                      ) : (
                        <div className="text-slate-900">{campaign.successRate}%</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedCampaign && (
        <CampaignDetailsModal
          isOpen={isDetailsOpen}
          onClose={() => {
            setIsDetailsOpen(false);
            setSelectedCampaign(null);
          }}
          campaign={selectedCampaign}
        />
      )}
    </>
  );
}
