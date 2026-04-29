import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import api from "@/services/api";
import { useSettingsStore } from "@/stores/settingsStore";
import { formatForBackendAPI, formatToGlobalTimezone } from "@/lib/dateUtils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Separator } from "./ui/separator";
import { ScrollArea } from "./ui/scroll-area";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  Phone,
  TrendingUp,
  Clock,
  BarChart3,
  Upload,
  List,
  CheckCircle2,
  Download,
  Search,
  Filter,
  PhoneOff,
  Calendar,
  FileSpreadsheet,
  Play,
  Pause,
  Loader2,
  Power,
  Zap,
  Repeat,
  Save,
  Activity,
  Settings,
} from "lucide-react";
import { UploadWizardContent } from "./UploadWizardContent";
import { toast } from "sonner";
import { DateRangePicker } from 'react-date-range';
import { es } from 'date-fns/locale';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { CampaignCallerIdSettings } from './CampaignCallerIdSettings';
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { CallerIDPoolsManager } from './CallerIDPoolsManager';

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
  autoDialLevel?: string;
  maxRetries?: number;
}

interface CampaignDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign;
}

interface DialLogRecord {
  call_date: string;
  phone_number: string;
  status: string;
  list_id: number;
  list_name: string;
  list_description: string;
  campaign_id: string;
}

// dateUtils.ts replaces formatDateForAPI

// Helper function to get today's date range

export function CampaignDetailsModal({
  isOpen,
  onClose,
  campaign,
}: CampaignDetailsModalProps) {
  const timezone = useSettingsStore((state) => state.timezone);
  const [activeTab, setActiveTab] = useState("reports");
  const [campaignStatus, setCampaignStatus] = useState(campaign.status);
  const [isToggling, setIsToggling] = useState(false);
  const [dialLevel, setDialLevel] = useState(campaign.autoDialLevel || "1.0");
  const [maxRetries, setMaxRetries] = useState<number>(campaign.maxRetries ?? 3);
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Sync status when campaign prop changes or modal opens
  useEffect(() => {
    setCampaignStatus(campaign.status);
    setDialLevel(campaign.autoDialLevel || "1.0");
    setMaxRetries(campaign.maxRetries ?? 3);
  }, [campaign.status, campaign.id, campaign.autoDialLevel, campaign.maxRetries, isOpen]);

  const handleSaveGeneralSettings = async () => {
    setSavingGeneral(true);
    try {
      await Promise.all([
        api.updateCampaignDialLevel(campaign.id, dialLevel),
        api.updateCampaignRetries(campaign.id, maxRetries)
      ]);
      toast.success("Configuración general guardada correctamente");
    } catch (error: any) {
      toast.error(error.message || "Error al guardar configuración");
    } finally {
      setSavingGeneral(false);
    }
  };

  // Date filter state - default to today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [dateRange, setDateRange] = useState([
    {
      startDate: today,
      endDate: today,
      key: 'selection'
    }
  ]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Dial log data state
  const [dialLogData, setDialLogData] = useState<DialLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null);

  // Report filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [listFilter, setListFilter] = useState("all");

  // Infinite scroll state
  const [displayedRecords, setDisplayedRecords] = useState(100);
  const recordsPerPage = 100;

  // Upload wizard state for Lists tab
  const [showUploadWizard, setShowUploadWizard] =
    useState(false);

  // Lists state
  const [campaignLists, setCampaignLists] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  // Selected list leads state
  const [selectedList, setSelectedList] = useState<any | null>(null);
  const [listLeads, setListLeads] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsOffset, setLeadsOffset] = useState(0);
  const leadsLimit = 50;

  // Helper function to get all dates between start and end
  const getDatesBetween = (start: Date, end: Date): Date[] => {
    const dates: Date[] = [];
    const currentDate = new Date(start);
    currentDate.setHours(0, 0, 0, 0);

    const endDate = new Date(end);
    endDate.setHours(0, 0, 0, 0);

    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  };

  // Function to fetch dial log data (triggered by button click)
  const fetchDialLog = async () => {
    setLoading(true);
    setError(null);
    try {
      const startDate = dateRange[0].startDate;
      const endDate = dateRange[0].endDate;

      // Get all dates in the range
      const dates = getDatesBetween(startDate, endDate);
      const totalDays = dates.length;

      console.log(`[CampaignDetailsModal] Fetching dial log for ${campaign.id}`);
      console.log(`[CampaignDetailsModal] Date range: ${formatForBackendAPI(startDate, timezone)} - ${formatForBackendAPI(endDate, timezone)}`);
      console.log(`[CampaignDetailsModal] Total days: ${totalDays}`);

      if (totalDays === 1) {
        // Single day query
        const startDatetime = `${formatForBackendAPI(startDate, timezone)} 00:00:00`;
        const endDatetime = `${formatForBackendAPI(endDate, timezone)} 23:59:59`;

        const response = await api.getCampaignDialLog(
          campaign.id,
          startDatetime,
          endDatetime
        );

        if (response.success && response.data) {
          console.log(`[CampaignDetailsModal] Received ${response.data.length} records`);
          setDialLogData(response.data);
        } else {
          console.warn("[CampaignDetailsModal] No data received");
          setDialLogData([]);
        }
      } else {
        // Multiple days - query each day separately with progress tracking
        console.log(`[CampaignDetailsModal] Splitting into ${totalDays} day queries`);
        setLoadingProgress({ current: 0, total: totalDays });

        const allResults: DialLogRecord[] = [];

        // Process days sequentially to avoid overwhelming the server
        for (let i = 0; i < dates.length; i++) {
          const date = dates[i];
          const dayStart = `${formatForBackendAPI(date, timezone)} 00:00:00`;
          const dayEnd = `${formatForBackendAPI(date, timezone)} 23:59:59`;

          console.log(`[CampaignDetailsModal] Fetching day: ${formatForBackendAPI(date, timezone)}`);

          try {
            const response = await api.getCampaignDialLog(
              campaign.id,
              dayStart,
              dayEnd
            );

            if (response.success && response.data) {
              console.log(`[CampaignDetailsModal] Day ${formatForBackendAPI(date, timezone)}: ${response.data.length} records`);

              // Append results efficiently without causing stack overflow
              allResults.push(...response.data);

              // Update progress and data incrementally
              setLoadingProgress({ current: i + 1, total: totalDays });
              setDialLogData([...allResults]); // Show incremental results
            }
          } catch (err) {
            console.error(`[CampaignDetailsModal] Error fetching day ${formatForBackendAPI(date, timezone)}:`, err);
          }
        }

        console.log(`[CampaignDetailsModal] Combined total: ${allResults.length} records`);

        // Clear progress indicator
        setLoadingProgress(null);
      }
    } catch (err) {
      console.error("[CampaignDetailsModal] Error fetching dial log:", err);
      setError(err instanceof Error ? err.message : "Error al cargar datos");
      toast.error("Error al cargar el reporte de llamadas");
    } finally {
      setLoading(false);
    }
  };

  // Function to export directly to CSV (without fetching to display)
  const handleExportDirect = async () => {
    await fetchDialLog();
    // After data is fetched, trigger download
    if (dialLogData.length > 0) {
      handleDownloadReport();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "paused":
        return "bg-yellow-500";
      case "inactive":
        return "bg-slate-400";
      default:
        return "bg-slate-400";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Activa";
      case "paused":
        return "Pausada";
      case "inactive":
        return "Inactiva";
      default:
        return status;
    }
  };

  // Function to fetch campaign lists
  const fetchCampaignLists = async () => {
    setLoadingLists(true);
    try {
      console.log(`[CampaignDetailsModal] Fetching lists for campaign ${campaign.id}`);
      const response = await api.getCampaignLists(campaign.id);

      if (response.success && response.data) {
        console.log(`[CampaignDetailsModal] Received ${response.data.length} lists`);
        setCampaignLists(response.data);
      } else {
        console.warn("[CampaignDetailsModal] No lists data received");
        setCampaignLists([]);
      }
    } catch (err) {
      console.error("[CampaignDetailsModal] Error fetching campaign lists:", err);
      toast.error("Error al cargar las listas de la campaña");
      setCampaignLists([]);
    } finally {
      setLoadingLists(false);
    }
  };

  // Function to fetch leads for a specific list
  const fetchListLeads = async (list: any, offset = 0) => {
    console.log("[CampaignDetailsModal] fetchListLeads called with list:", list);
    setSelectedList(list);
    setLoadingLeads(true);
    setLeadsOffset(offset);
    try {
      const response = await api.getListLeads(list.list_id.toString(), leadsLimit, offset);
      if (response.success) {
        setListLeads(response.data || []);
        setLeadsTotal(response.total || 0);
      } else {
        toast.error("Error al cargar los leads de la lista");
        setListLeads([]);
      }
    } catch (err) {
      console.error("[CampaignDetailsModal] Error fetching list leads:", err);
      toast.error("Error al cargar los leads");
      setListLeads([]);
    } finally {
      setLoadingLeads(false);
    }
  };

  const closeListLeadsModal = () => {
    setSelectedList(null);
    setListLeads([]);
    setLeadsOffset(0);
    setLeadsTotal(0);
  };

  // Filter dial log records for reports
  const filteredRecords = dialLogData.filter((record) => {
    const matchesSearch =
      record.phone_number.includes(searchTerm) ||
      (record.list_name && record.list_name.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus =
      statusFilter === "all" || record.status === statusFilter;
    const matchesList =
      listFilter === "all" || record.list_name === listFilter;

    return matchesSearch && matchesStatus && matchesList;
  });

  // Infinite scroll calculations
  const visibleRecords = filteredRecords.slice(0, displayedRecords);
  const hasMore = displayedRecords < filteredRecords.length;

  // Reset displayed records when filters change
  useEffect(() => {
    setDisplayedRecords(100);
  }, [searchTerm, statusFilter, listFilter]);

  // Fetch lists when modal opens or tab changes to lists
  useEffect(() => {
    if (isOpen && activeTab === "lists") {
      fetchCampaignLists();
    }
  }, [isOpen, activeTab, campaign.id]);

  // Handle scroll event for infinite loading
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = target;

    // Load more when scrolled to bottom (with 100px threshold)
    if (scrollHeight - scrollTop <= clientHeight + 100 && hasMore && !loading) {
      setDisplayedRecords(prev => prev + recordsPerPage);
    }
  };

  // Get unique statuses and lists for filters
  const uniqueStatuses = Array.from(new Set(dialLogData.map(r => r.status))).sort();
  const uniqueLists = Array.from(new Set(dialLogData.map(r => r.list_name))).filter(Boolean).sort();
  // Vicidial status color mapping
  const getDialStatusColor = (status: string) => {
    // Success statuses
    if (["SALE", "PU", "PM", "XFER"].includes(status)) return "bg-green-500";
    // Callback/scheduled
    if (["CB", "CALLBK", "CBHOLD"].includes(status)) return "bg-blue-500";
    // No answer
    if (["NA", "AA", "N", "NP", "NI"].includes(status)) return "bg-yellow-500";
    // Busy/Drop
    if (["B", "DROP", "XDROP", "AB", "PDROP"].includes(status)) return "bg-orange-500";
    // DNC/Failed/Filtered
    if (["DNC", "DC", "ADC", "DNCC", "WLFLTR", "ERI"].includes(status)) return "bg-red-500";
    // New/Pending
    if (["NEW", "QUEUE"].includes(status)) return "bg-slate-400";
    // Voicemail/Machine
    if (["AM", "AL", "AFAX"].includes(status)) return "bg-purple-500";
    // Default
    return "bg-slate-500";
  };

  // Translate Vicidial status codes to Spanish
  const translateLeadStatus = (status: string): { label: string; description: string } => {
    const statusMap: Record<string, { label: string; description: string }> = {
      // Nuevos/Pendientes
      'NEW': { label: 'Nuevo', description: 'Sin intentar' },
      'QUEUE': { label: 'En Cola', description: 'Esperando en cola' },
      'NI': { label: 'No Interesado', description: 'No mostró interés' },

      // Éxito
      'SALE': { label: 'Venta', description: 'Venta realizada' },
      'PU': { label: 'Pickup', description: 'Llamada contestada' },
      'PM': { label: 'PM', description: 'Pickup con mensaje' },
      'XFER': { label: 'Transferido', description: 'Llamada transferida' },

      // Callbacks
      'CB': { label: 'Callback', description: 'Programado para rellamar' },
      'CALLBK': { label: 'Callback', description: 'Callback pendiente' },
      'CBHOLD': { label: 'CB Hold', description: 'Callback en espera' },

      // Sin respuesta
      'NA': { label: 'No Contesta', description: 'No contestó la llamada' },
      'AA': { label: 'Auto No Contesta', description: 'Timeout automático' },
      'N': { label: 'No Answer', description: 'Sin respuesta' },
      'NP': { label: 'No Party', description: 'No hay persona disponible' },

      // Ocupado/Drop
      'B': { label: 'Ocupado', description: 'Línea ocupada' },
      'AB': { label: 'Auto Ocupado', description: 'Ocupado automático' },
      'DROP': { label: 'Cortada (Sistema)', description: 'Llamada cortada por sistema (sin agente)' },
      'XDROP': { label: 'Cortada (Exceso)', description: 'Cortada por exceder límite de drops' },
      'PDROP': { label: 'Perdida (Sistema)', description: 'Perdida por marcador predictivo (sin agente)' },

      // Buzón/Máquina
      'AM': { label: 'Buzón de Voz', description: 'Contestadora automática' },
      'AL': { label: 'Buzón Largo', description: 'Mensaje largo detectado' },
      'AFAX': { label: 'Fax', description: 'Línea de fax detectada' },

      // DNC/Bloqueados
      'DNC': { label: 'No Llamar', description: 'Solicitó no ser llamado' },
      'DC': { label: 'Desconectado', description: 'Número desconectado' },
      'ADC': { label: 'Auto Desc.', description: 'Desconectado automático' },
      'DNCC': { label: 'Blacklist', description: 'En lista negra' },
      'WLFLTR': { label: 'Filtrado', description: 'Filtrado por lista blanca' },
      'ERI': { label: 'Error', description: 'Error en número inválido' },

      // Otros
      'A': { label: 'Contestado', description: 'Llamada contestada' },
      'INCALL': { label: 'En Llamada', description: 'Llamada en progreso' },
      'DEAD': { label: 'Inválido', description: 'Número inválido' },
      'DISPO': { label: 'Disposition', description: 'Pendiente de disposición' },
    };

    const upperStatus = (status || 'NEW').toUpperCase();
    return statusMap[upperStatus] || { label: status || 'Nuevo', description: 'Estado desconocido' };
  };

  const handleDownloadReport = () => {
    const headers = [
      "Fecha/Hora",
      "Teléfono",
      "Estado",
      "ID Lista",
      "Nombre Lista",
      "Descripción Lista",
      "Campaign ID",
    ];

    const rows = filteredRecords.map((record) => [
      formatToGlobalTimezone(record.call_date, timezone),
      record.phone_number,
      record.status,
      record.list_id.toString(),
      record.list_name || "",
      record.list_description || "",
      record.campaign_id,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${cell}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const startDate = dateRange[0].startDate;
    const endDate = dateRange[0].endDate;
    a.download = `reporte_dial_log_${campaign.name.replace(/\s+/g, "_")}_${formatForBackendAPI(startDate, timezone)}_${formatForBackendAPI(endDate, timezone)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast.success(
      `Reporte descargado: ${filteredRecords.length} registros`,
    );
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setListFilter("all");
  };

  const handleUploadCancel = () => {
    setShowUploadWizard(false);
  };

  const handleUploadSuccess = () => {
    setShowUploadWizard(false);
    // Refetch lists from API
    fetchCampaignLists();
    toast.success(
      "Lista cargada exitosamente. Actualizando...",
    );
  };

  const handleToggleCampaign = async () => {
    setIsToggling(true);
    try {
      if (campaignStatus === 'active') {
        await api.stopCampaign(campaign.id);
        setCampaignStatus('paused');
        toast.success(`Campaña ${campaign.name} detenida`);
      } else {
        await api.startCampaign(campaign.id);
        setCampaignStatus('active');
        toast.success(`Campaña ${campaign.name} iniciada`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado de campaña');
    } finally {
      setIsToggling(false);
    }
  };

  const handleToggleListStatus = async (list: any) => {
    const newStatus = list.active === 'Y' ? 'N' : 'Y';
    // Optimistic update
    setCampaignLists(prev => prev.map(l =>
      l.list_id === list.list_id ? { ...l, active: newStatus } : l
    ));

    try {
      await api.updateListStatus(list.list_id.toString(), newStatus);
      toast.success(`Lista ${newStatus === 'Y' ? 'activada' : 'desactivada'} correctamente`);
    } catch (error) {
      // Revert on error
      setCampaignLists(prev => prev.map(l =>
        l.list_id === list.list_id ? { ...l, active: list.active } : l
      ));
      toast.error("Error al actualizar estado de la lista");
      console.error(error);
    }
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteCampaign = async () => {
    setIsDeleting(true);
    try {
      await api.deleteCampaign(campaign.id);
      toast.success(`Campaña ${campaign.name} inactivada exitosamente`);
      setShowDeleteConfirm(false);
      onClose();
      // Si la UI principal escucha los cambios deberia de recargar. 
      // Por defecto window.location.reload() o llamar a un callback onDeleted
      window.setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      toast.error(error.message || 'Error al inactivar campaña');
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-[96vw] w-[96vw] max-h-[96vh] h-[96vh] p-0">
          {/* Header fijo */}
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <DialogTitle className="text-2xl truncate">
                    {campaign.name}
                  </DialogTitle>
                  <Badge
                    className={`shrink-0 ${campaignStatus === 'active'
                      ? 'bg-green-500 hover:bg-green-600'
                      : campaignStatus === 'paused'
                        ? 'bg-amber-500 hover:bg-amber-600'
                        : 'bg-slate-400 hover:bg-slate-500'
                      } text-white`}
                  >
                    {campaignStatus === 'active' ? 'Activa' : campaignStatus === 'paused' ? 'Pausada' : 'Inactiva'}
                  </Badge>
                </div>
                <DialogDescription className="hidden">
                  Monitor de campaña
                </DialogDescription>
              </div>
              <div className="flex items-center gap-3 ml-4 shrink-0">
                <Button
                  variant={campaignStatus === 'active' ? 'outline' : 'default'}
                  size="default"
                  onClick={handleToggleCampaign}
                  disabled={isToggling}
                  className={`gap-2 min-w-[120px] ${campaignStatus === 'active'
                    ? 'border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                >
                  {isToggling ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : campaignStatus === 'active' ? (
                    <><Pause className="w-4 h-4" /> Detener</>
                  ) : (
                    <><Play className="w-4 h-4" /> Iniciar</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="gap-2 border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  title="Inactivar Campaña"
                >
                  <Power className="w-4 h-4 text-slate-500" /> Inactivar
                </Button>
              </div>
            </div>
          </DialogHeader>

          <Separator />

          {/* Tabs con scroll */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1"
          >
            <div className="px-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="reports" className="gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Reportes
                </TabsTrigger>
                <TabsTrigger value="lists" className="gap-2">
                  <List className="w-4 h-4" />
                  Listas
                </TabsTrigger>
                <TabsTrigger value="callerid" className="gap-2">
                  <Phone className="w-4 h-4" />
                  CallerID
                </TabsTrigger>
                <TabsTrigger value="config" className="gap-2">
                  <Settings className="w-4 h-4" />
                  Ajustes
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Contenido con scroll */}
            <ScrollArea className="h-[calc(96vh-200px)]">
              <div className="px-6 pb-6">
                {/* Tab: Reportes */}
                <TabsContent
                  value="reports"
                  className="mt-4 space-y-4"
                >
                  {/* Filters */}
                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-3 relative z-50">
                        {/* Date range picker */}
                        <div className="flex items-end gap-3">
                          <div className="relative">
                            <Label className="mb-1.5 block">
                              Rango de Fechas
                            </Label>
                            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-72 justify-start text-left font-normal"
                                >
                                  <Calendar className="mr-2 h-4 w-4" />
                                  {formatForBackendAPI(dateRange[0].startDate, timezone)} - {formatForBackendAPI(dateRange[0].endDate, timezone)}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start" style={{ zIndex: 9999 }}>
                                <DateRangePicker
                                  ranges={dateRange}
                                  onChange={(item: any) => setDateRange([item.selection])}
                                  locale={es}
                                  dateDisplayFormat="yyyy-MM-dd"
                                />
                                <div className="p-2 border-t flex justify-end bg-slate-50">
                                  <Button
                                    size="sm"
                                    onClick={() => setShowDatePicker(false)}
                                  >
                                    Cerrar
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>

                          <Button
                            onClick={fetchDialLog}
                            disabled={loading}
                            className="gap-2"
                          >
                            <Search className="w-4 h-4" />
                            Consultar
                          </Button>

                          <Button
                            onClick={handleExportDirect}
                            disabled={loading}
                            variant="outline"
                            className="gap-2"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            Exportar
                          </Button>

                          <div className="flex-1" />

                          {loading && (
                            <div className="text-slate-600 text-sm">
                              {loadingProgress ? (
                                <>
                                  Cargando día {loadingProgress.current} de {loadingProgress.total}... ({dialLogData.length.toLocaleString()} registros)
                                </>
                              ) : (
                                "Cargando datos..."
                              )}
                            </div>
                          )}
                        </div>

                        {/* Search and filters */}
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <Label htmlFor="search" className="mb-1.5 block">
                              Buscar
                            </Label>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <Input
                                id="search"
                                placeholder="Teléfono o lista..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                              />
                            </div>
                          </div>

                          <div className="w-48">
                            <Label htmlFor="statusFilter" className="mb-1.5 block">
                              Estado
                            </Label>
                            <Select
                              value={statusFilter}
                              onValueChange={setStatusFilter}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                {uniqueStatuses.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {status}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="w-48">
                            <Label htmlFor="listFilter" className="mb-1.5 block">
                              Lista
                            </Label>
                            <Select
                              value={listFilter}
                              onValueChange={setListFilter}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todas</SelectItem>
                                {uniqueLists.map((listName) => (
                                  <SelectItem key={listName} value={listName}>
                                    {listName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <Button
                            variant="outline"
                            onClick={handleClearFilters}
                            className="gap-2"
                          >
                            <Filter className="w-4 h-4" />
                            Limpiar
                          </Button>

                          <Button
                            onClick={handleDownloadReport}
                            className="gap-2"
                            disabled={loading || filteredRecords.length === 0}
                          >
                            <Download className="w-4 h-4" />
                            Descargar
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Table */}
                  <Card>
                    <CardContent className="p-0">
                      <div
                        className="max-h-[500px] overflow-auto relative"
                        onScroll={handleScroll}
                      >
                        <Table>
                          <TableHeader className="sticky top-0 bg-white shadow-sm" style={{ zIndex: 10 }}>
                            <TableRow>
                              <TableHead className="bg-white">Fecha/Hora</TableHead>
                              <TableHead className="bg-white">Teléfono</TableHead>
                              <TableHead className="bg-white">Estado</TableHead>
                              <TableHead className="bg-white">Lista</TableHead>
                              <TableHead className="bg-white">Descripción Lista</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {loading && dialLogData.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={5}
                                  className="text-center py-8 text-slate-500"
                                >
                                  Cargando datos...
                                </TableCell>
                              </TableRow>
                            ) : error ? (
                              <TableRow>
                                <TableCell
                                  colSpan={5}
                                  className="text-center py-8 text-red-500"
                                >
                                  Error: {error}
                                </TableCell>
                              </TableRow>
                            ) : filteredRecords.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={5}
                                  className="text-center py-8 text-slate-500"
                                >
                                  {dialLogData.length === 0
                                    ? "No hay registros para este rango de fechas"
                                    : "No se encontraron registros con los filtros aplicados"}
                                </TableCell>
                              </TableRow>
                            ) : (
                              <>
                                {visibleRecords.map((record, idx) => (
                                  <TableRow key={`${record.call_date}-${record.phone_number}-${idx}`}>
                                    <TableCell className="font-mono text-sm">
                                      {formatToGlobalTimezone(record.call_date, timezone)}
                                    </TableCell>
                                    <TableCell className="font-mono">
                                      {record.phone_number}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        className={`${getDialStatusColor(record.status)} text-white cursor-help`}
                                        title={translateLeadStatus(record.status).description}
                                      >
                                        {translateLeadStatus(record.status).label}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      {record.list_name || "-"}
                                    </TableCell>
                                    <TableCell className="text-slate-600">
                                      {record.list_description || "-"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                                {hasMore && (
                                  <TableRow>
                                    <TableCell
                                      colSpan={5}
                                      className="text-center py-4 text-slate-500 text-sm"
                                    >
                                      Desplázate hacia abajo para cargar más registros...
                                    </TableCell>
                                  </TableRow>
                                )}
                              </>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Footer Info */}
                  <div className="flex items-center justify-between">
                    <p className="text-slate-600">
                      Mostrando {Math.min(displayedRecords, filteredRecords.length).toLocaleString()} de{" "}
                      {filteredRecords.length.toLocaleString()} registros filtrados
                      {filteredRecords.length !== dialLogData.length && (
                        <span className="text-slate-500"> ({dialLogData.length.toLocaleString()} total)</span>
                      )}
                    </p>
                    {dialLogData.length > 0 && (
                      <p className="text-slate-500 text-sm">
                        Rango: {formatForBackendAPI(dateRange[0].startDate, timezone)} - {formatForBackendAPI(dateRange[0].endDate, timezone)}
                      </p>
                    )}
                  </div>
                </TabsContent>

                {/* Tab: Listas */}
                <TabsContent value="lists" className="mt-4">
                  {showUploadWizard ? (
                    <Card>
                      <CardContent className="p-6">
                        <UploadWizardContent
                          campaignName={campaign.name}
                          campaignId={campaign.id}
                          onCancel={handleUploadCancel}
                          onSuccess={handleUploadSuccess}
                        />
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle>Listas de Leads</CardTitle>
                              <CardDescription>
                                Administra las listas asociadas a
                                esta campaña
                              </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                className="gap-2"
                                onClick={() =>
                                  setShowUploadWizard(true)
                                }
                              >
                                <Upload className="w-4 h-4" />
                                Cargar Leads
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {loadingLists ? (
                            <div className="flex justify-center items-center py-12">
                              <div className="text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                                <p className="text-slate-500">Cargando listas...</p>
                              </div>
                            </div>
                          ) : campaignLists.length === 0 ? (
                            <div className="text-center py-12">
                              <List className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                              <p className="text-slate-500">No hay listas asociadas a esta campaña</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {campaignLists.map((list) => (
                                <div
                                  key={list.list_id}
                                  className="border rounded-lg overflow-hidden"
                                >
                                  {/* List Header */}
                                  <div className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                      <div className="p-3 bg-purple-100 rounded-lg">
                                        <List className="w-5 h-5 text-purple-600" />
                                      </div>
                                      <div>
                                        <h4 className="text-slate-900 font-medium">
                                          {list.list_name}
                                        </h4>
                                        <p className="text-slate-500 text-sm">
                                          {list.total_leads?.toLocaleString() || 0}{" "}
                                          leads total
                                        </p>
                                        {list.list_description && (
                                          <p className="text-slate-400 text-xs mt-1">
                                            {list.list_description}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="text-right mr-4">
                                        <div className="text-xs text-slate-500">
                                          Nuevos: <span className="font-medium text-slate-900">{list.leads_new?.toLocaleString() || 0}</span>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                          Contactados: <span className="font-medium text-slate-900">{list.leads_contacted?.toLocaleString() || 0}</span>
                                        </div>
                                      </div>
                                      <Button
                                        variant={list.active === "Y" ? "default" : "secondary"}
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleListStatus(list);
                                        }}
                                        className={`gap-2 h-7 ${list.active === "Y"
                                          ? "bg-green-600 hover:bg-green-700"
                                          : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                                          }`}
                                      >
                                        <Power className="w-3 h-3" />
                                        {list.active === "Y" ? "Activa" : "Inactiva"}
                                      </Button>
                                      <Button
                                        variant={selectedList?.list_id === list.list_id ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => {
                                          if (selectedList?.list_id === list.list_id) {
                                            closeListLeadsModal();
                                          } else {
                                            fetchListLeads(list);
                                          }
                                        }}
                                      >
                                        {selectedList?.list_id === list.list_id ? "Ocultar" : "Ver Detalles"}
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Accordion: Leads Panel */}
                                  {selectedList?.list_id === list.list_id && (
                                    <div className="bg-slate-50 border-t p-4">
                                      {loadingLeads ? (
                                        <div className="flex justify-center items-center py-6">
                                          <div className="text-center">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto mb-2"></div>
                                            <p className="text-slate-500 text-sm">Cargando leads...</p>
                                          </div>
                                        </div>
                                      ) : listLeads.length === 0 ? (
                                        <div className="text-center py-6">
                                          <p className="text-slate-500 text-sm">No hay leads en esta lista</p>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="max-h-[300px] overflow-auto bg-white rounded border">
                                            <Table>
                                              <TableHeader className="sticky top-0 bg-white">
                                                <TableRow>
                                                  <TableHead>Teléfono</TableHead>
                                                  <TableHead>Vendor Code</TableHead>
                                                  <TableHead>Estado</TableHead>
                                                  <TableHead>Nombre</TableHead>
                                                  <TableHead>Llamadas</TableHead>
                                                  <TableHead>Última Llamada</TableHead>
                                                </TableRow>
                                              </TableHeader>
                                              <TableBody>
                                                {listLeads.map((lead) => (
                                                  <TableRow key={lead.lead_id}>
                                                    <TableCell className="font-mono">{lead.phone_number}</TableCell>
                                                    <TableCell>{lead.vendor_lead_code || "-"}</TableCell>
                                                    <TableCell>
                                                      <Badge
                                                        className={`${getDialStatusColor(lead.status)} text-white cursor-help`}
                                                        title={translateLeadStatus(lead.status).description}
                                                      >
                                                        {translateLeadStatus(lead.status).label}
                                                      </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                      {lead.first_name || lead.last_name
                                                        ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
                                                        : "-"}
                                                    </TableCell>
                                                    <TableCell>{lead.called_count || 0}</TableCell>
                                                    <TableCell className="text-sm text-slate-500">
                                                      {lead.last_local_call_time || "-"}
                                                    </TableCell>
                                                  </TableRow>
                                                ))}
                                              </TableBody>
                                            </Table>
                                          </div>

                                          {/* Pagination */}
                                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              disabled={leadsOffset === 0 || loadingLeads}
                                              onClick={() => fetchListLeads(selectedList, Math.max(0, leadsOffset - leadsLimit))}
                                            >
                                              Anterior
                                            </Button>
                                            <span className="text-sm text-slate-600">
                                              {leadsTotal.toLocaleString()} leads - Página {Math.floor(leadsOffset / leadsLimit) + 1} de {Math.ceil(leadsTotal / leadsLimit) || 1}
                                            </span>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              disabled={leadsOffset + leadsLimit >= leadsTotal || loadingLeads}
                                              onClick={() => fetchListLeads(selectedList, leadsOffset + leadsLimit)}
                                            >
                                              Siguiente
                                            </Button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}
                </TabsContent>

                {/* Tab: CallerID */}
                <TabsContent value="callerid" className="mt-4">
                  <CampaignCallerIdSettings campaignId={campaign.id} />
                </TabsContent>

                <TabsContent value="config" className="mt-4">
                  <div className="space-y-6">
                    {/* Seccion General - Grid de 2 Columnas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Card: Nivel de Marcado */}
                      <Card className="shadow-sm border-slate-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                              <Zap className="w-5 h-5" />
                            </div>
                            <div>
                              <CardTitle className="text-base">Nivel de Auto-Marcación</CardTitle>
                              <CardDescription className="text-xs">Velocidad y Ratio del marcador</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="dialLevelModal" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ratio de Marcación</Label>
                            <Select value={dialLevel?.toString() || "1.0"} onValueChange={setDialLevel}>
                              <SelectTrigger id="dialLevelModal" className="font-mono text-lg h-10 w-full bg-white">
                                <SelectValue placeholder="Ratio" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl shadow-xl border-slate-100">
                                {[1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0].map((ratio) => (
                                  <SelectItem key={ratio} value={ratio.toFixed(1)}>
                                    {ratio.toFixed(2).replace('.', ',')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-[11px] text-slate-500 leading-relaxed italic mt-2">
                              Llamadas simultáneas por cada agente disponible.
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Card: Reintentos */}
                      <Card className="shadow-sm border-slate-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                              <Repeat className="w-5 h-5" />
                            </div>
                            <div>
                              <CardTitle className="text-base">Límite de Reintentos</CardTitle>
                              <CardDescription className="text-xs">Máximo de intentos por contacto</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="maxRetriesModal" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Intentos Máximos</Label>
                            <Input
                              id="maxRetriesModal"
                              type="number"
                              min="0"
                              max="10"
                              value={maxRetries}
                              onChange={(e) => setMaxRetries(parseInt(e.target.value) || 0)}
                              placeholder="Ej. 3"
                              className="font-mono text-lg"
                            />
                            <p className="text-[11px] text-slate-500 leading-relaxed italic">
                              Veces que se llamará a un número que no contesta o falla.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Botón de Guardado General */}
                    <div className="flex items-center justify-end pt-2">
                      <Button
                        onClick={handleSaveGeneralSettings}
                        disabled={savingGeneral || (dialLevel === campaign.autoDialLevel && maxRetries === (campaign.maxRetries ?? 3))}
                        className="gap-2 min-w-[200px] h-11 rounded-xl shadow-lg shadow-blue-500/10"
                      >
                        {savingGeneral ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {savingGeneral ? "Guardando..." : "Guardar Ajustes Generales"}
                      </Button>
                    </div>

                    {/* Separador Visual */}
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-slate-100"></span>
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-4 text-slate-400 font-medium tracking-widest">Avanzado</span>
                      </div>
                    </div>

                    {/* Seccion Avanzada: Pools */}
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <CallerIDPoolsManager />
                    </div>
                  </div>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inactivar Campaña</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas inactivar la campaña <strong>{campaign.name}</strong>?
              <br /><br />
              Esta acción detendrá la campaña (si estaba activa) y la ocultará del panel principal.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteCampaign}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Inactivar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}