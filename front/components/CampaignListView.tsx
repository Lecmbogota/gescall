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
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Skeleton } from './ui/skeleton';
import {
  MoreHorizontal,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
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
  campaign_type?: string;
  autoDialLevel?: string;
}

interface CampaignListViewProps {
  campaigns: Campaign[];
  onSelectCampaign?: (campaign: Campaign) => void;
}

export function CampaignListView({ campaigns, onSelectCampaign }: CampaignListViewProps) {
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffMins < 1440) return `Hace ${Math.floor(diffMins / 60)} hrs`;
    return `Hace ${Math.floor(diffMins / 1440)} días`;
  };

  const handleOpenDetails = (campaign: Campaign, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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
        setSelectedCampaign(campaign);
        setIsDetailsOpen(true);
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
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
              <TableRow>
                <TableHead className="bg-white">Campaña</TableHead>
                <TableHead className="bg-white">Tipo</TableHead>
                <TableHead className="bg-white">Progreso</TableHead>
                <TableHead className="bg-white">Avance</TableHead>
                <TableHead className="bg-white">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => {
                const progressPercentage =
                  (campaign.contactedLeads / campaign.totalLeads) * 100;
                const isLoading = campaign.dialingMethod === 'Cargando...';

                return (
                  <TableRow
                    key={campaign.id}
                    className={`transition-colors duration-200 ease-out ${isLoading
                      ? 'cursor-wait'
                      : 'cursor-pointer hover:bg-slate-50'
                      }`}
                    onClick={() => !isLoading && handleOpenDetails(campaign)}
                  >
                    <TableCell>
                      <div>
                        {isLoading ? (
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        ) : (
                          <>
                            <div className="text-slate-900">{campaign.name}</div>
                            <div className="text-slate-500">ID: {campaign.id}</div>
                          </>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {isLoading ? (
                        <Skeleton className="h-5 w-20 rounded-full" />
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs font-medium">
                          {campaign.campaign_type === 'INBOUND' ? 'INBOUND' :
                           campaign.campaign_type === 'OUTBOUND_PREDICTIVE' ? 'PREDICTIVO' :
                           campaign.campaign_type === 'OUTBOUND_PROGRESSIVE' ? 'PROGRESIVO' : 'BLASTER'}
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      {isLoading ? (
                        <div className="w-40">
                          <Skeleton className="h-3 w-24 mb-2" />
                          <Skeleton className="h-2 w-full rounded-full" />
                        </div>
                      ) : (
                        <div className="w-40">
                          <div className="flex justify-between mb-1">
                            <span className="text-slate-600">
                              {campaign.contactedLeads} / {campaign.totalLeads}
                            </span>
                          </div>
                          <Progress value={progressPercentage} className="h-2" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {isLoading ? (
                        <Skeleton className="h-4 w-12" />
                      ) : (
                        <div className="text-slate-900">{campaign.successRate}%</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {isLoading ? (
                        <Skeleton className="h-5 w-16 rounded-full" />
                      ) : (
                        <Badge className={`${getStatusColor(campaign.status)} text-white`}>
                          {getStatusText(campaign.status)}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
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
