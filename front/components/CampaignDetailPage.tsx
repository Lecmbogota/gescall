import { useState, useEffect, useMemo, useRef } from "react";
import api from "@/services/api";
import { io } from "socket.io-client";
import { AreaChart, Area, Tooltip as RechartsTooltip, ResponsiveContainer, YAxis } from "recharts";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "./ui/tabs";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Switch } from "./ui/switch";

import { Skeleton } from "./ui/skeleton";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "./ui/context-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "./ui/tooltip";
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
    BarChart3,
    Upload,
    List,
    Download,
    Search,
    Filter,
    Calendar,
    FileSpreadsheet,
    Play,
    Pause,
    Loader2,
    Power,
    Zap,
    Repeat,
    Save,
    LayoutGrid,
    Activity,
    Sparkles,
    RefreshCw,
    PlayCircle,
    PauseCircle,
    ArrowLeft,
    Clock,
    RefreshCcw,
    Settings,
    PhoneOff,
    PhoneCall,
    PhoneForwarded,
    PhoneMissed,
    XCircle,
    CheckCircle,
    Network,
    Database,
    Trash2,
    Plus,
    Columns,
    ArrowUp,
    ArrowDown,
    GripVertical,
    User,
    ChevronDown,
    ChevronUp,
    ArrowRight,
    X
} from "lucide-react";
import { UploadWizardContent } from "./UploadWizardContent";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "./ui/dialog";
import { Checkbox } from "./ui/checkbox";
import { DateRangePicker } from 'react-date-range';
import { es } from 'date-fns/locale';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { CampaignCallerIdSettings } from './CampaignCallerIdSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { getDetailDisplayStatus, translateLeadStatus } from "@/utils/callStatusUtils";
import socketService from "@/services/socket";
import { CallerIDPoolsManager } from './CallerIDPoolsManager';
import { InboundDidsManager } from './InboundDidsManager';
import { useSettingsStore } from "@/stores/settingsStore";
import { formatForBackendAPI, formatToGlobalTimezone } from "@/lib/dateUtils";

const formatDuration = (seconds?: number) => {
    if (!seconds) return '00:00:00';
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

const getStatusIcon = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes('cortada') || l.includes('caida') || l.includes('drop')) return <PhoneOff className="w-3.5 h-3.5" />;
    if (l.includes('contestada') || l.includes('hablando')) return <PhoneCall className="w-3.5 h-3.5" />;
    if (l.includes('transferida') || l.includes('xfer')) return <PhoneForwarded className="w-3.5 h-3.5" />;
    if (l.includes('completada') || l.includes('venta') || l.includes('exito')) return <CheckCircle className="w-3.5 h-3.5" />;
    if (l.includes('no contesta') || l.includes('buzon')) return <PhoneMissed className="w-3.5 h-3.5" />;
    if (l.includes('rechazada') || l.includes('error')) return <XCircle className="w-3.5 h-3.5" />;
    return <Phone className="w-3.5 h-3.5" />;
};

const getStatusColorStyles = (origColor: string) => {
    switch (origColor) {
        case 'bg-red-500': return 'bg-red-50/50 border-red-100/50 text-red-600';
        case 'bg-green-500': return 'bg-emerald-50/50 border-emerald-100/50 text-emerald-600';
        case 'bg-blue-500': return 'bg-blue-50/50 border-blue-100/50 text-blue-600';
        case 'bg-amber-500': return 'bg-amber-50/50 border-amber-100/50 text-amber-600';
        case 'bg-purple-500': return 'bg-purple-50/50 border-purple-100/50 text-purple-600';
        case 'bg-slate-500': return 'bg-slate-50/50 border-slate-200/50 text-slate-600';
        default: return 'bg-slate-50/50 border-slate-200/50 text-slate-600';
    }
};

const getHexColor = (origColor: string) => {
    switch (origColor) {
        case 'bg-red-400':
        case 'bg-red-500': return '#ef4444';
        case 'bg-green-500':
        case 'bg-emerald-600': return '#10b981';
        case 'bg-blue-500':
        case 'bg-sky-500': return '#3b82f6';
        case 'bg-amber-500':
        case 'bg-orange-500':
        case 'bg-yellow-500': return '#f59e0b';
        case 'bg-purple-500': return '#8b5cf6';
        case 'bg-indigo-400': return '#6366f1';
        case 'bg-slate-500':
        default: return '#64748b';
    }
};

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
    leadStructureSchema?: { name: string; required: boolean; is_phone?: boolean }[];
    ttsTemplates?: { id: string; name: string; content: string }[];
    retrySettings?: Record<string, number>;
    altPhoneEnabled?: boolean;
    campaign_type?: string;
    trunk_id?: string | null;
}

interface CampaignDetailPageProps {
    campaign: Campaign;
    onBack: () => void;
    username: string;
    userLevel: number;
    onUpdateCampaign?: () => void;
}

interface DialLogRecord {
    call_date: string;
    phone_number: string;
    status: string;
    list_id: number;
    list_name: string;
    list_description: string;
    campaign_id: string;
    caller_id?: string;  // Pool CallerID from gescall_call_log
    original_callerid?: string;  // Original Vicidial callerid (V108...)
    caller_code?: string;  // Legacy field for backward compat
    outbound_cid?: string;  // Legacy field
    call_status?: string;  // DIALING, ANSWER, HANGUP, etc.
    dtmf_pressed?: string;  // DTMF from gescall_call_log
    dtmf_response?: string;  // Legacy DTMF field
    lead_status?: string;  // Lead status from vicidial_list
    length_in_sec?: number; // Call duration in seconds
    agent?: string; // User agent assigned to the call
    vendor_lead_code?: string; // Vendor lead code from vicidial_list
    call_duration?: number; // Call duration in seconds from gescall_call_log
    tts_vars?: any; // Dynamic columns
    attempt_number?: number;
    called_count?: number;
}

interface TableColumnConfig {
    id: string;
    label: string;
    visible: boolean;
    isSystem: boolean;
}

// dateUtils.ts replaces formatDateForAPI

export function CampaignDetailPage({
    campaign,
    onBack,
    username,
    userLevel,
    onUpdateCampaign,
}: CampaignDetailPageProps) {
    const timezone = useSettingsStore((state) => state.timezone);
    const [activeTab, setActiveTab] = useState(campaign.campaign_type === 'BLASTER' ? "reports" : "monitor");
    const [campaignStatus, setCampaignStatus] = useState(campaign.status);
    const [isToggling, setIsToggling] = useState(false);
    const [dialLevel, setDialLevel] = useState(campaign.autoDialLevel || "1.0");
    const [maxRetries, setMaxRetries] = useState<number>(campaign.maxRetries ?? 3);
    const [retryGroups, setRetryGroups] = useState({
        Rechazada: { enabled: (campaign.retrySettings?.HANGUP ?? 30) >= 0, minutes: Math.max((campaign.retrySettings?.HANGUP ?? 30), 1) },
        Ocupado: { enabled: (campaign.retrySettings?.BUSY ?? 30) >= 0, minutes: Math.max((campaign.retrySettings?.BUSY ?? 30), 1) },
        Buzon: { enabled: (campaign.retrySettings?.AM ?? 30) >= 0, minutes: Math.max((campaign.retrySettings?.AM ?? 30), 1) },
        Cortada: { enabled: (campaign.retrySettings?.DROP ?? 30) >= 0, minutes: Math.max((campaign.retrySettings?.DROP ?? 30), 1) },
        NoContesta: { enabled: (campaign.retrySettings?.NA ?? 30) >= 0, minutes: Math.max((campaign.retrySettings?.NA ?? 30), 1) },
        FalloTecnico: { enabled: (campaign.retrySettings?.FAILED ?? 30) >= 0, minutes: Math.max((campaign.retrySettings?.FAILED ?? 30), 1) }
    });
    const [savingGeneral, setSavingGeneral] = useState(false);
    const [realtimeStats, setRealtimeStats] = useState<any[]>([]);
    const [cpsAvailability, setCpsAvailability] = useState<{total_cps: number, used_cps: number, available_cps: number} | null>(null);
    const [activeSince, setActiveSince] = useState<string | null>(null);
    const [activeTimer, setActiveTimer] = useState<string>('00:00:00');
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
    const [selectedTrunkId, setSelectedTrunkId] = useState<string>(campaign.trunk_id || '__none__');
    const [availableTrunks, setAvailableTrunks] = useState<any[]>([]);

    // Fetch trunks list
    useEffect(() => {
        api.getTrunks().then((resp: any) => {
            if (Array.isArray(resp)) {
                setAvailableTrunks(resp);
            }
        }).catch(() => {});
    }, []);

    // Structure Schema State
    const [structureSchema, setStructureSchema] = useState<{name: string; required: boolean; is_phone?: boolean}[]>(
        campaign.leadStructureSchema || [
            {name: "telefono", required: true, is_phone: true},
            {name: "speech", required: false}
        ]
    );
    const [isSavingStructure, setIsSavingStructure] = useState(false);
    const [newColumnName, setNewColumnName] = useState("");
    const [newColumnRequired, setNewColumnRequired] = useState(false);
    const [newColumnIsPhone, setNewColumnIsPhone] = useState(false);
    const [altPhoneEnabled, setAltPhoneEnabled] = useState(campaign.altPhoneEnabled || false);

    // Dynamic Columns State
    const [tableColumns, setTableColumns] = useState<TableColumnConfig[]>(() => {
        const defaultConfigs: TableColumnConfig[] = [
            { id: 'sys_hora', label: 'Hora', visible: true, isSystem: true },
            { id: 'sys_fecha', label: 'Fecha', visible: true, isSystem: true },
            { id: 'sys_estado', label: 'Estado', visible: true, isSystem: true },
            { id: 'sys_duracion', label: 'Duración', visible: true, isSystem: true },
            { id: 'sys_intentos', label: 'Reintentos', visible: true, isSystem: true },
            { id: 'sys_dtmf', label: 'DTMF', visible: true, isSystem: true },
            { id: 'sys_lista', label: 'Lista', visible: true, isSystem: true },
            { id: 'sys_desc', label: 'Descripción Lista', visible: true, isSystem: true },
            { id: 'sys_callerid', label: 'CallerID', visible: true, isSystem: true },
        ];
        
        const dynConfigs: TableColumnConfig[] = (campaign.leadStructureSchema || [
            {name: "telefono", required: true},
            {name: "speech", required: false}
        ]).map(col => ({
            id: `dyn_${col.name}`,
            label: col.name.replace(/_/g, ' '),
            visible: true,
            isSystem: false
        }));

        const mergedBase = [...defaultConfigs, ...dynConfigs];
        try {
            const saved = localStorage.getItem(`gescall_cols_${campaign.id}`);
            if (saved) {
                const parsed = JSON.parse(saved) as TableColumnConfig[];
                return mergedBase.map(baseCol => {
                    const found = parsed.find(p => p.id === baseCol.id);
                    if (found) {
                        return { ...baseCol, visible: found.visible };
                    }
                    return baseCol;
                }).sort((a, b) => {
                    const idxA = parsed.findIndex(p => p.id === a.id);
                    const idxB = parsed.findIndex(p => p.id === b.id);
                    if (idxA === -1 && idxB === -1) return 0;
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                });
            }
        } catch(e) {}

        return mergedBase;
    });

    useEffect(() => {
        localStorage.setItem(`gescall_cols_${campaign.id}`, JSON.stringify(tableColumns));
    }, [tableColumns, campaign.id]);

    const toggleColumnVisibility = (id: string) => {
        setTableColumns(prev => prev.map(col => col.id === id ? { ...col, visible: !col.visible } : col));
    };

    const dragItemIndex = useRef<number | null>(null);
    const dragOverItemIndex = useRef<number | null>(null);

    const handleDragStart = (index: number) => {
        dragItemIndex.current = index;
    };

    const handleDragEnter = (index: number) => {
        dragOverItemIndex.current = index;
    };

    const handleDragEnd = () => {
        if (dragItemIndex.current !== null && dragOverItemIndex.current !== null) {
            if (dragItemIndex.current !== dragOverItemIndex.current) {
                setTableColumns(prev => {
                    const newCols = [...prev];
                    const draggedItem = newCols.splice(dragItemIndex.current!, 1)[0];
                    newCols.splice(dragOverItemIndex.current!, 0, draggedItem);
                    return newCols;
                });
            }
        }
        dragItemIndex.current = null;
        dragOverItemIndex.current = null;
    };

    useEffect(() => {
        // Subscribe to real-time stats
        socketService.subscribeToCampaign(campaign.id, (stats) => {
            if (stats && Array.isArray(stats)) {
                setRealtimeStats(stats);
            }
        });

        return () => {
            socketService.unsubscribeFromCampaign(campaign.id);
        };
    }, [campaign.id]);

    // Sync status when campaign prop changes
    useEffect(() => {
        setCampaignStatus(campaign.status);
        setDialLevel(campaign.autoDialLevel || "1.0");
        setMaxRetries(campaign.maxRetries ?? 3);
        setTtsTemplates(campaign.ttsTemplates || []);
    }, [campaign.status, campaign.id, campaign.autoDialLevel, campaign.maxRetries, campaign.ttsTemplates]);

    useEffect(() => {
        const fetchCps = async () => {
            try {
                const res = await api.getCpsAvailability();
                if (res && res.data) setCpsAvailability(res.data);
            } catch (err) {
                console.error("Error fetching CPS availability:", err);
            }
        };
        fetchCps();
        // Set an interval to refresh
        const interval = setInterval(fetchCps, 10000);
        return () => clearInterval(interval);
    }, [campaign.id]);

    const hasConfigChanges = useMemo(() => {
        if (dialLevel.toString() !== (campaign.autoDialLevel?.toString() || "1.0")) return true;
        if (maxRetries !== (campaign.maxRetries ?? 3)) return true;
        
        const origHangup = campaign.retrySettings?.HANGUP ?? 30;
        if (retryGroups.Rechazada.enabled !== (origHangup >= 0)) return true;
        if (retryGroups.Rechazada.minutes !== Math.max(origHangup, 1)) return true;
        
        const origBusy = campaign.retrySettings?.BUSY ?? 30;
        if (retryGroups.Ocupado.enabled !== (origBusy >= 0)) return true;
        if (retryGroups.Ocupado.minutes !== Math.max(origBusy, 1)) return true;
        
        const origAm = campaign.retrySettings?.AM ?? 30;
        if (retryGroups.Buzon.enabled !== (origAm >= 0)) return true;
        if (retryGroups.Buzon.minutes !== Math.max(origAm, 1)) return true;
        
        const origDrop = campaign.retrySettings?.DROP ?? 30;
        if (retryGroups.Cortada.enabled !== (origDrop >= 0)) return true;
        if (retryGroups.Cortada.minutes !== Math.max(origDrop, 1)) return true;
        
        const origNa = campaign.retrySettings?.NA ?? 30;
        if (retryGroups.NoContesta.enabled !== (origNa >= 0)) return true;
        if (retryGroups.NoContesta.minutes !== Math.max(origNa, 1)) return true;
        
        const origFailed = campaign.retrySettings?.FAILED ?? 30;
        if (retryGroups.FalloTecnico.enabled !== (origFailed >= 0)) return true;
        if (retryGroups.FalloTecnico.minutes !== Math.max(origFailed, 1)) return true;

        if ((selectedTrunkId === '__none__' ? '' : selectedTrunkId) !== (campaign.trunk_id || '')) return true;
        
        return false;
    }, [dialLevel, maxRetries, retryGroups, selectedTrunkId, campaign.autoDialLevel, campaign.maxRetries, campaign.retrySettings, campaign.trunk_id]);

    const handleSaveGeneralSettings = async () => {
        setSavingGeneral(true);
        try {
            const getVal = (group: { enabled: boolean, minutes: number }) => group.enabled ? group.minutes : -1;
            const expandedRetrySettings = {
                'HANGUP': getVal(retryGroups.Rechazada),
                'B': getVal(retryGroups.Ocupado), 'BUSY': getVal(retryGroups.Ocupado), 'AB': getVal(retryGroups.Ocupado), 'CONGESTION': getVal(retryGroups.Ocupado),
                'AM': getVal(retryGroups.Buzon), 'AL': getVal(retryGroups.Buzon),
                'DROP': getVal(retryGroups.Cortada), 'PDROP': getVal(retryGroups.Cortada), 'XDROP': getVal(retryGroups.Cortada),
                'NA': getVal(retryGroups.NoContesta), 'N': getVal(retryGroups.NoContesta), 'AA': getVal(retryGroups.NoContesta), 'RINGING': getVal(retryGroups.NoContesta), 'DIALING': getVal(retryGroups.NoContesta),
                'FAILED': getVal(retryGroups.FalloTecnico)
            };

            await Promise.all([
                api.updateCampaignDialLevel(campaign.id, dialLevel),
                api.updateCampaignRetries(campaign.id, maxRetries),
                api.updateCampaignRetrySettings(campaign.id, expandedRetrySettings),
                api.updateCampaignTrunk(campaign.id, selectedTrunkId === '__none__' ? null : selectedTrunkId)
            ]);
            toast.success("Configuración general guardada correctamente");
            if (onUpdateCampaign) onUpdateCampaign();
        } catch (error: any) {
            toast.error(error.message || "Error al guardar configuración");
        } finally {
            setSavingGeneral(false);
        }
    };

    const handleSaveStructure = async () => {
        setIsSavingStructure(true);
        try {
            await Promise.all([
                api.updateCampaignStructure(campaign.id, structureSchema),
                api.updateCampaignAltPhone(campaign.id, altPhoneEnabled)
            ]);
            toast.success("Estructura de campaña guardada correctamente.");
            if (onUpdateCampaign) onUpdateCampaign();
        } catch (error: any) {
            toast.error(error.message || "Error al guardar estructura");
        } finally {
            setIsSavingStructure(false);
        }
    };

    const handleAddColumn = () => {
        const colName = newColumnName.trim().toLowerCase();
        if (!colName) return;
        if (structureSchema.find(s => s.name === colName)) {
            toast.error("La columna ya existe");
            return;
        }
        setStructureSchema([...structureSchema, { name: colName, required: newColumnRequired, is_phone: newColumnIsPhone }]);
        setNewColumnName("");
        setNewColumnRequired(false);
        setNewColumnIsPhone(false);
    };

    const handleRemoveColumn = (colName: string) => {
        if (colName === "telefono") {
            toast.error("La columna telefono es estrictamente obligatoria");
            return;
        }
        setStructureSchema(structureSchema.filter(s => s.name !== colName));
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

    // Sparkline Time Range Selection (1h, 1d, 7d, 30d)
    const [sparklineRange, setSparklineRange] = useState<'1h' | '1d' | '7d' | '30d'>('1d');

    // Dial log data state
    const [dialLogData, setDialLogData] = useState<DialLogRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null);

    // Report filters state
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [listFilter, setListFilter] = useState("all");

    // Lists filters state
    const [listSearchTerm, setListSearchTerm] = useState("");
    const [listStatusFilter, setListStatusFilter] = useState("all");

    // Infinite scroll state
    const [displayedRecords, setDisplayedRecords] = useState(100);
    const recordsPerPage = 100;

    // Upload wizard state for Lists tab
    const [showUploadWizard, setShowUploadWizard] = useState(false);

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

    // Recycle modal state
    const [showRecycleModal, setShowRecycleModal] = useState(false);
    const [listToRecycle, setListToRecycle] = useState<any | null>(null);
    const [statusCounts, setStatusCounts] = useState<{ status: string; count: number }[]>([]);
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
    const [loadingStatuses, setLoadingStatuses] = useState(false);
    const [isRecycling, setIsRecycling] = useState(false);

    // TTS Templates state
    const [ttsTemplates, setTtsTemplates] = useState<{ id: string; name: string; content: string }[]>(
        campaign.ttsTemplates || []
    );
    const [selectedTtsTemplate, setSelectedTtsTemplate] = useState<{ id: string; name: string; content: string } | null>(null);
    const [isSavingTts, setIsSavingTts] = useState(false);

    // Agents state
    const [campaignAgents, setCampaignAgents] = useState<string[]>([]);
    const [agentSearchTerm, setAgentSearchTerm] = useState("");
    const [allAgents, setAllAgents] = useState<{username: string, name: string}[]>([]);
    const [loadingAgents, setLoadingAgents] = useState(false);
    const [savingAgents, setSavingAgents] = useState(false);

    // Vicidial status color mapping
    const getDialStatusColor = (status: string) => {
        if (["SALE", "PU", "PM", "XFER"].includes(status)) return "bg-green-500";
        if (["CB", "CALLBK", "CBHOLD"].includes(status)) return "bg-blue-500";
        if (["NA", "AA", "N", "NP", "NI"].includes(status)) return "bg-yellow-500";
        if (["B", "DROP", "XDROP", "AB", "PDROP"].includes(status)) return "bg-orange-500";
        if (["DNC", "DC", "ADC", "DNCC", "WLFLTR", "ERI"].includes(status)) return "bg-red-500";
        if (["NEW", "QUEUE"].includes(status)) return "bg-slate-400";
        if (["AM", "AL", "AFAX"].includes(status)) return "bg-purple-500";
        return "bg-slate-500";
    };

    // Centralized status display — imported from shared utility
    const getDisplayStatus = (record: DialLogRecord) => {
        const dtmf = record.dtmf_pressed || record.dtmf_response;
        const callStatus = record.call_status;
        const leadStatus = record.lead_status || record.status;
        return getDetailDisplayStatus(callStatus, dtmf, leadStatus);
    };


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

            const dates = getDatesBetween(startDate, endDate);
            const totalDays = dates.length;

            if (totalDays === 1) {
                const startDatetime = `${formatForBackendAPI(startDate, timezone)} 00:00:00`;
                const endDatetime = `${formatForBackendAPI(endDate, timezone)} 23:59:59`;

                // Use new /call-log endpoint for correct pool CallerID
                const response = await api.getCampaignCallLog(
                    campaign.id,
                    startDatetime,
                    endDatetime
                );

                if (response.success && response.data) {
                    // Sort by date (newest first)
                    const sortedData = [...response.data].sort((a, b) =>
                        new Date(b.call_date).getTime() - new Date(a.call_date).getTime()
                    );
                    setDialLogData(sortedData);
                } else {
                    setDialLogData([]);
                }
            } else {
                setLoadingProgress({ current: 0, total: totalDays });
                const allResults: DialLogRecord[] = [];

                for (let i = 0; i < dates.length; i++) {
                    const date = dates[i];
                    const dayStart = `${formatForBackendAPI(date, timezone)} 00:00:00`;
                    const dayEnd = `${formatForBackendAPI(date, timezone)} 23:59:59`;

                    try {
                        // Use new /call-log endpoint for correct pool CallerID
                        const response = await api.getCampaignCallLog(
                            campaign.id,
                            dayStart,
                            dayEnd
                        );

                        if (response.success && response.data) {
                            allResults.push(...response.data);
                            setLoadingProgress({ current: i + 1, total: totalDays });
                            // Sort accumulated results
                            const sortedResults = [...allResults].sort((a, b) =>
                                new Date(b.call_date).getTime() - new Date(a.call_date).getTime()
                            );
                            setDialLogData(sortedResults);
                        }
                    } catch (err) {
                        console.error(`Error fetching day ${formatForBackendAPI(date, timezone)}:`, err);
                    }
                }
                setLoadingProgress(null);
            }
        } catch (err) {
            console.error("Error fetching dial log:", err);
            setError(err instanceof Error ? err.message : "Error al cargar datos");
            toast.error("Error al cargar el reporte de llamadas");
        } finally {
            setLoading(false);
        }
    };

    // Function to handle the manual fetch request
    const handleFetchDialLog = () => {
        fetchDialLog();
        fetchCampaignLists(); // Sync sidebar progress!
    };

    // Function to fetch campaign lists
    const fetchCampaignLists = async () => {
        setLoadingLists(true);
        try {
            const response = await api.getCampaignLists(campaign.id);
            if (response.success && response.data) {
                setCampaignLists(response.data);
            } else {
                setCampaignLists([]);
            }
        } catch (err) {
            console.error("Error fetching campaign lists:", err);
            toast.error("Error al cargar las listas de la campaña");
            setCampaignLists([]);
        } finally {
            setLoadingLists(false);
        }
    };

    // Function to fetch leads for a specific list
    const fetchListLeads = async (list: any, offset = 0) => {
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
            console.error("Error fetching list leads:", err);
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
        // Use display status label for filtering (Transferido, Contestada, Rechazada, No Contesta)
        const displayStatus = getDisplayStatus(record).label;
        const matchesStatus =
            statusFilter === "all" || displayStatus === statusFilter;
        const matchesList =
            listFilter === "all" || record.list_name === listFilter;

        return matchesSearch && matchesStatus && matchesList;
    });

    const filteredLists = useMemo(() => {
        return campaignLists.filter((list) => {
            const matchesSearch =
                list.list_name?.toLowerCase().includes(listSearchTerm.toLowerCase()) ||
                list.list_id?.toString().includes(listSearchTerm);
            
            let matchesStatus = true;
            if (listStatusFilter === "activa") matchesStatus = list.active === "Y";
            if (listStatusFilter === "inactiva") matchesStatus = list.active !== "Y";

            return matchesSearch && matchesStatus;
        });
    }, [campaignLists, listSearchTerm, listStatusFilter]);

    // Infinite scroll calculations
    const visibleRecords = filteredRecords.slice(0, displayedRecords);
    const hasMore = displayedRecords < filteredRecords.length;

    // Reset displayed records when filters change
    useEffect(() => {
        setDisplayedRecords(100);
    }, [searchTerm, statusFilter, listFilter]);

    // Function to fetch agents
    const fetchAgents = async () => {
        setLoadingAgents(true);
        try {
            const promises: Promise<any>[] = [
                api.getUsers(),
                api.getCampaignAgents(campaign.id)
            ];
            // Fetch agent real-time status for all applicable campaigns
            if (campaign.campaign_type !== 'BLASTER') {
                promises.push(api.getCampaignAgentStatuses(campaign.id));
            }
            const [usersRes, campAgentsRes, statusRes] = await Promise.all(promises);

            let statuses = [];
            if (statusRes && statusRes.success) {
                statuses = statusRes.agents;
            }

            if (usersRes.success) {
                const agents = (usersRes.data || []).filter((u: any) => u.active === 'Y' || u.active === true || u.active === 't');
                setAllAgents(agents.map((u: any) => {
                    const statusObj = statuses.find((s: any) => s.username === u.username);
                    return { 
                        username: u.username, 
                        name: u.full_name || u.username,
                        state: statusObj ? statusObj.state : 'OFFLINE',
                        lastChange: statusObj ? statusObj.lastChange : 0
                    };
                }));
            }
            if (campAgentsRes.success) {
                setCampaignAgents(campAgentsRes.agents || []);
            }
        } catch (err) {
            console.error("Error fetching agents:", err);
            toast.error("Error al cargar los agentes");
        } finally {
            setLoadingAgents(false);
        }
    };

    const handleSaveAgents = async () => {
        setSavingAgents(true);
        try {
            const res = await api.assignCampaignAgents(campaign.id, campaignAgents);
            if (res.success) {
                toast.success("Agentes actualizados correctamente");
                if (onUpdateCampaign) onUpdateCampaign();
            } else {
                toast.error("Error al actualizar agentes");
            }
        } catch (err: any) {
            toast.error(err.message || "Error al actualizar agentes");
        } finally {
            setSavingAgents(false);
        }
    };

    const toggleAgentAssignment = (username: string) => {
        setCampaignAgents(prev => 
            prev.includes(username) 
                ? prev.filter(u => u !== username)
                : [...prev, username]
        );
    };

    // Auto-fetch components data when campaign opens
    useEffect(() => {
        const fetchBaseStats = async () => {
            try {
                const response = await api.getCampaignStats(campaign.id);
                if (response.success && response.data && response.data.active_since) {
                    setActiveSince(response.data.active_since);
                }
            } catch (e) {}
        };
        fetchBaseStats();
        fetchCampaignLists();
        fetchDialLog();
        fetchAgents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [campaign.id]);

    // Listen for real-time agent status updates via WebSocket
    useEffect(() => {
        if (campaign.campaign_type !== 'INBOUND') return;
        
        // Connect to the base URL
        const backendUrl = import.meta.env.VITE_API_URL 
            ? import.meta.env.VITE_API_URL.replace(/\/api$/, '') 
            : window.location.origin;

        const socket = io(backendUrl, {
            transports: ['websocket'],
            autoConnect: true,
        });

        socket.on('dashboard:realtime:update', (data: any) => {
            if (data && data.agent_update) {
                setAllAgents(prev => prev.map(agent => {
                    if (agent.username === data.agent_update.username) {
                        return { 
                            ...agent, 
                            state: data.agent_update.state, 
                            lastChange: parseInt(data.agent_update.last_change || '0') 
                        };
                    }
                    return agent;
                }));
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [campaign.campaign_type]);

    // Calculate agent duration in real-time
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (campaign.campaign_type !== 'INBOUND') return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [campaign.campaign_type]);

    // Timer calculation loop
    useEffect(() => {
        if (campaignStatus !== 'active' || !activeSince) {
            setActiveTimer('00:00:00');
            return;
        }
        
        const updateTimer = () => {
            const start = new Date(activeSince).getTime();
            const now = new Date().getTime();
            const diffSecs = Math.floor((now - start) / 1000);
            
            if (diffSecs < 0) {
                setActiveTimer('00:00:00');
                return;
            }
            
            const hours = Math.floor(diffSecs / 3600);
            const minutes = Math.floor((diffSecs % 3600) / 60);
            const seconds = diffSecs % 60;
            
            setActiveTimer(
                `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
            );
        };
        
        updateTimer(); // run immediately
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [activeSince, campaignStatus]);

    // Handle scroll event for infinite loading
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLDivElement;
        const { scrollTop, scrollHeight, clientHeight } = target;

        if (scrollHeight - scrollTop <= clientHeight + 100 && hasMore && !loading) {
            setDisplayedRecords(prev => prev + recordsPerPage);
        }
    };

    // Get unique display statuses and lists for filters
    // Use getDisplayStatus to show consistent labels (Transferido, Contestada, Rechazada, No Contesta)
    const uniqueStatuses = Array.from(new Set(dialLogData.map(r => getDisplayStatus(r).label))).sort();
    const uniqueLists = Array.from(new Set(dialLogData.map(r => r.list_name))).filter(Boolean).sort();

    // Calculate status summary from the current dialLogData (before filtering)
    // Or from filteredRecords, depending on whether we want it to react to filters.
    // The user's screenshot shows it above the filters, so usually these summarize the current date range's    // Get unique status counts
    const statusSummary = useMemo(() => {
        // Find reference date (most recent call) or fallback to now
        const now = new Date();
        let referenceDate = now;
        if (dialLogData.length > 0) {
            const latestDateStr = dialLogData.reduce((latest, record) => {
                const dateStr = record.call_date || "";
                return dateStr > latest ? dateStr : latest;
            }, "");
            if (latestDateStr) {
                referenceDate = new Date(latestDateStr);
            }
        }

        // Grouping data based on sparklineRange
        const statsData: Record<string, { name: string; count: number }[]> = {};

        // Initialize structures based on range
        const initializeStructure = () => {
            const data: { name: string; count: number }[] = [];
            if (sparklineRange === '1h') {
                // Last 60 minutes
                for (let i = 59; i >= 0; i--) {
                    const d = new Date(referenceDate.getTime() - i * 60000);
                    data.push({ name: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, count: 0 });
                }
            } else if (sparklineRange === '1d') {
                // Last 24 hours
                for (let i = 23; i >= 0; i--) {
                    const d = new Date(referenceDate.getTime() - i * 3600000);
                    data.push({ name: `${String(d.getHours()).padStart(2, '0')}:00`, count: 0 });
                }
            } else {
                // 7d or 30d -> group by day
                const days = sparklineRange === '7d' ? 7 : 30;
                for (let i = days - 1; i >= 0; i--) {
                    const d = new Date(referenceDate.getTime() - i * 86400000);
                    data.push({ name: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, count: 0 });
                }
            }
            return data;
        };

        // Pre-populate standard statuses to ensure they always show up
        const standardStatuses = [
            { callStatus: 'ANSWER', dtmf: null, status: 'ANSWER' }, // Contestada
            { callStatus: 'COMPLET', dtmf: null, status: 'COMPLET' }, // Completado
            { callStatus: 'HANGUP', dtmf: null, status: 'HANGUP' }, // Rechazada
            { callStatus: 'NA', dtmf: null, status: 'NA' }, // No Contesta
            { callStatus: 'XFER', dtmf: null, status: 'XFER' }, // Transferido
            { callStatus: 'DROP', dtmf: null, status: 'DROP' }, // Cortada
            { callStatus: 'B', dtmf: null, status: 'B' }, // Ocupado
            { callStatus: 'AM', dtmf: null, status: 'AM' }, // Buzón
            { callStatus: 'FAILED', dtmf: null, status: 'FAILED' }, // Fallida
            { callStatus: 'DNC', dtmf: null, status: 'DNC' }, // No Llamar
            { callStatus: 'SALE', dtmf: null, status: 'SALE' }, // Venta
        ];

        standardStatuses.forEach(st => {
            const mockRecord = { call_status: st.callStatus, dtmf_pressed: st.dtmf, status: st.status } as any;
            const statusLabel = getDisplayStatus(mockRecord).label;
            if (!statsData[statusLabel]) {
                statsData[statusLabel] = initializeStructure();
            }
        });

        // Populate baseline arrays for all unique statuses found in real data
        dialLogData.forEach((record) => {
            const statusLabel = getDisplayStatus(record).label;
            if (!statsData[statusLabel]) {
                statsData[statusLabel] = initializeStructure();
            }

            if (record.call_date) {
                const callDate = new Date(record.call_date);
                const timeDiffMs = referenceDate.getTime() - callDate.getTime();

                // If the call is newer than referenceDate (e.g. slight clock drift), just place it in the latest bucket
                const diffMsBounded = Math.max(0, timeDiffMs);
                let targetIndex = -1;

                if (sparklineRange === '1h') {
                    // diff in minutes
                    const diffMins = Math.floor(diffMsBounded / 60000);
                    if (diffMins >= 0 && diffMins < 60) {
                        targetIndex = 59 - diffMins;
                    }
                } else if (sparklineRange === '1d') {
                    // diff in hours
                    const diffHours = Math.floor(diffMsBounded / 3600000);
                    if (diffHours >= 0 && diffHours < 24) {
                        targetIndex = 23 - diffHours;
                    }
                } else {
                    // diff in days
                    const days = sparklineRange === '7d' ? 7 : 30;
                    const diffDays = Math.floor(diffMsBounded / 86400000);
                    if (diffDays >= 0 && diffDays < days) {
                        targetIndex = (days - 1) - diffDays;
                    }
                }

                if (targetIndex >= 0 && targetIndex < statsData[statusLabel].length) {
                    statsData[statusLabel][targetIndex].count += 1;
                }
            }
        });

        // 2 & 3. Create static summary totals and merge with either realtime stats or dialLogData
        const summary: Record<string, { count: number; color: string; description: string; graphData: { name: string; count: number }[] }> = {};
        
        // Initialize all pre-populated standard statuses to 0
        standardStatuses.forEach(st => {
            const mockRecord = { call_status: st.callStatus, dtmf_pressed: st.dtmf, status: st.status } as any;
            const displayObj = getDisplayStatus(mockRecord);
            const statusLabel = displayObj.label;
            if (!summary[statusLabel]) {
                summary[statusLabel] = { count: 0, color: displayObj.color, description: displayObj.description, graphData: statsData[statusLabel] || initializeStructure() };
            }
        });

        if (realtimeStats.length > 0) {
            // Apply realtime stats over the summary
            realtimeStats.forEach(stat => {
                if (!summary[stat.label]) {
                    summary[stat.label] = {
                       count: stat.count || 0,
                       color: stat.color || 'bg-slate-400',
                       description: stat.description || '',
                       graphData: statsData[stat.label] || initializeStructure()
                    };
                } else {
                    summary[stat.label].count = stat.count || 0;
                    if (stat.color) summary[stat.label].color = stat.color;
                    if (stat.description) summary[stat.label].description = stat.description;
                }
            });
        } else {
            // Derive counts from dialLogData
            dialLogData.forEach((record) => {
                const displayObj = getDisplayStatus(record);
                const statusLabel = displayObj.label;
                if (!summary[statusLabel]) {
                    summary[statusLabel] = { count: 0, color: displayObj.color, description: displayObj.description, graphData: statsData[statusLabel] || initializeStructure() };
                }
                summary[statusLabel].count += 1;
            });
        }

        // Convert to array and group
        const rawSummaryArray = Object.entries(summary).map(([label, data]) => ({ label, ...data }));

        const getSimplifiedGroup = (label: string): { label: string; color: string } => {
            if (['Contestada', 'Completado', 'Venta'].includes(label)) return { label: 'Contestadas', color: 'bg-blue-500' };
            if (['No Contesta', 'Ocupado', 'Buzón', 'No Llamar', 'Desconocido'].includes(label)) return { label: 'No Contesta', color: 'bg-yellow-500' };
            if (['Transferido'].includes(label)) return { label: 'Transferido', color: 'bg-green-500' };
            if (['Fallida', 'Cortada', 'Rechazada'].includes(label)) return { label: 'Fallida', color: 'bg-red-500' };
            return { label: 'Otros', color: 'bg-slate-400' };
        };

        const groupedMap: Record<string, { count: number; color: string; description: string; graphData: { name: string; count: number }[] }> = {};

        rawSummaryArray.forEach(item => {
            const groupInfo = getSimplifiedGroup(item.label);
            if (!groupedMap[groupInfo.label]) {
                groupedMap[groupInfo.label] = {
                    count: 0,
                    color: groupInfo.color,
                    description: 'Agrupación simplificada de múltiples estados',
                    graphData: initializeStructure()
                };
            }

            groupedMap[groupInfo.label].count += item.count;
            if (item.graphData) {
                item.graphData.forEach((point, i) => {
                    if (groupedMap[groupInfo.label].graphData[i]) {
                        groupedMap[groupInfo.label].graphData[i].count += point.count;
                    }
                });
            }
        });

        // Ensure the 4 requested groups always exist 
        const desiredGroups = [
            { label: 'Contestadas', color: 'bg-blue-500' },
            { label: 'No Contesta', color: 'bg-yellow-500' },
            { label: 'Transferido', color: 'bg-green-500' },
            { label: 'Fallida', color: 'bg-red-500' }
        ];

        desiredGroups.forEach(g => {
            if (!groupedMap[g.label]) {
                groupedMap[g.label] = {
                    count: 0,
                    color: g.color,
                    description: 'Agrupación simplificada de múltiples estados',
                    graphData: initializeStructure()
                };
            }
        });

        // Convert grouped map to array and sort
        const finalArray = Object.entries(groupedMap)
            .map(([label, data]) => ({ label, ...data }))
            .sort((a, b) => {
                // Ensure 'Otros' goes to bottom, else sort by count
                if (a.label === 'Otros') return 1;
                if (b.label === 'Otros') return -1;
                return b.count - a.count;
            });

        return finalArray;
    }, [dialLogData, realtimeStats, sparklineRange]);

    const handleDownloadReport = () => {
        const activeCols = tableColumns.filter(c => c.visible);
        const headers = activeCols.map(c => c.label);
        headers.push("Campaign ID"); // Always include internally

        const rows = filteredRecords.map((record) => {
            const rowValues = activeCols.map(col => {
                if (col.id === 'sys_hora') return formatToGlobalTimezone(record.call_date, timezone, 'HH:mm:ss');
                if (col.id === 'sys_fecha') return formatToGlobalTimezone(record.call_date, timezone, 'yyyy-MM-dd');
                if (col.id === 'sys_estado') return getDisplayStatus(record).label;
                if (col.id === 'sys_duracion') return record.call_duration || record.length_in_sec || 0;
                if (col.id === 'sys_dtmf') return record.dtmf_pressed || record.dtmf_response || "";
                if (col.id === 'sys_lista') return record.list_name || "";
                if (col.id === 'sys_desc') return record.list_description || "";
                if (col.id === 'sys_callerid') return record.caller_id || record.caller_code || record.outbound_cid || "";
                
                // Dynamic fields
                const colName = col.id.replace('dyn_', '');
                if (colName === "telefono") return record.phone_number || "";
                if (record.tts_vars && record.tts_vars[colName]) return record.tts_vars[colName];
                return "";
            });

            return [
                ...rowValues,
                record.campaign_id,
            ];
        });

        const csvContent = [
            headers.join(","),
            ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reporte_${campaign.name.replace(/\s+/g, "_")}_${formatForBackendAPI(dateRange[0].startDate, timezone)}_${formatForBackendAPI(dateRange[0].endDate, timezone)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        toast.success(`Reporte descargado: ${filteredRecords.length} registros`);
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
        fetchCampaignLists();
        toast.success("Lista cargada exitosamente. Actualizando...");
    };

    const handleToggleCampaign = async () => {
        setIsToggling(true);
        try {
            if (campaignStatus === 'active') {
                await api.stopCampaign(campaign.id);
                setCampaignStatus('paused');
                setActiveSince(null);
                toast.success(`Campaña ${campaign.name} detenida`);
            } else {
                await api.startCampaign(campaign.id);
                setCampaignStatus('active');
                toast.success(`Campaña ${campaign.name} iniciada`);
                
                // Fetch stats again to get the exact database timestamp
                try {
                    const response = await api.getCampaignStats(campaign.id);
                    if (response.success && response.data && response.data.active_since) {
                        setActiveSince(response.data.active_since);
                    } else {
                        setActiveSince(new Date().toISOString());
                    }
                } catch (e) {
                    setActiveSince(new Date().toISOString());
                }
            }
        } catch (error: any) {
            toast.error(error.message || 'Error al cambiar estado de campaña');
        } finally {
            setIsToggling(false);
        }
    };

    const handleToggleListStatus = async (list: any) => {
        const newStatus = list.active === 'Y' ? 'N' : 'Y';
        setCampaignLists(prev => prev.map(l =>
            l.list_id === list.list_id ? { ...l, active: newStatus } : l
        ));

        try {
            await api.updateListStatus(list.list_id.toString(), newStatus);
            toast.success(`Lista ${newStatus === 'Y' ? 'activada' : 'desactivada'} correctamente`);
        } catch (error) {
            setCampaignLists(prev => prev.map(l =>
                l.list_id === list.list_id ? { ...l, active: list.active } : l
            ));
            toast.error("Error al actualizar estado de la lista");
            console.error(error);
        }
    };

    const fetchListStatusCounts = async (listId: string | number) => {
        try {
            setLoadingStatuses(true);
            const response = await api.getStatusCounts(listId.toString());
            if (response.success && response.data) {
                setStatusCounts(response.data);
            } else {
                setStatusCounts([]);
            }
        } catch (error) {
            console.error("Error fetching status counts:", error);
            setStatusCounts([]);
            toast.error("Error al cargar los estados para reciclar");
        } finally {
            setLoadingStatuses(false);
        }
    };
    const handleOpenRecycleModal = async (list: any) => {
        setListToRecycle(list);
        setShowRecycleModal(true);
        setLoadingStatuses(true);
        setSelectedStatuses([]);
        fetchListStatusCounts(list.list_id);
    };

    const handleDeleteList = async (listId: number) => {
        if (!confirm("¿Está seguro que desea eliminar esta lista con todos sus leads? Esta acción es irreversible.")) return;
        try {
            const data = await api.deleteList(listId.toString());
            if (data.success) {
                toast.success("Lista eliminada exitosamente");
                fetchCampaignLists();
            } else {
                toast.error(data.error || "Error al eliminar");
            }
        } catch (err: any) {
            console.error("Error deleting list:", err);
            toast.error(err.message || "Error al eliminar la lista");
        }
    };

    const handleConfirmRecycleList = async () => {
        if (!listToRecycle || selectedStatuses.length === 0) return;

        setIsRecycling(true);
        try {
            await api.recycleList(listToRecycle.list_id.toString(), selectedStatuses);
            toast.success(`Lista ${listToRecycle.list_name} reciclada exitosamente. Se reciclarán ${selectedStatuses.length} estados.`);
            setShowRecycleModal(false);
            fetchCampaignLists();
        } catch (error) {
            toast.error("Error al reciclar la lista");
            console.error(error);
        } finally {
            setIsRecycling(false);
        }
    };

    const toggleStatusSelection = (status: string) => {
        setSelectedStatuses((prev) =>
            prev.includes(status)
                ? prev.filter((s) => s !== status)
                : [...prev, status]
        );
    };

    const tabTriggerClass = "gap-1.5 px-3 py-1.5 font-medium text-slate-500 hover:text-slate-700 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all";

    // Use activeTab state but map 'tts_templates' if needed, wait actually just use activeTab.
    const activeLists = campaignLists.filter(l => l.active === 'Y');
    const totalActiveLeads = activeLists.reduce((sum, list) => sum + parseInt(list.total_leads || '0', 10), 0);
    const newActiveLeads = activeLists.reduce((sum, list) => sum + (list.leads_new ? parseInt(list.leads_new, 10) : 0), 0);
    const dialedActiveLeads = totalActiveLeads - newActiveLeads;
    const progressPercent = totalActiveLeads > 0 ? Math.round((dialedActiveLeads / totalActiveLeads) * 100) : 0;

    const totalAttemptsMade = activeLists.reduce((sum, list) => sum + parseInt((list as any).total_attempts || '0', 10), 0);
    const maxRetriesPerLead = campaign.maxRetries && campaign.maxRetries > 0 ? campaign.maxRetries : 3;
    const potentialTotalAttempts = totalActiveLeads * maxRetriesPerLead;
    const retriesProgressPercent = potentialTotalAttempts > 0 ? Math.round((totalAttemptsMade / potentialTotalAttempts) * 100) : 0;

    return (
        <>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col w-full min-h-0 bg-transparent relative z-0 animate-in fade-in duration-500">
            {/* Split layout for Main Area and Sidebar */}
            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0 min-w-0">
                {/* Main Content Area */}
                <div className="flex flex-col flex-1 min-h-0 min-w-0">
                    {/* Header Modernizado */}
                    <div className="flex-shrink-0 mb-6 flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between h-auto xl:h-12">
                        {/* Left: Back button + Title */}
                        <div className="flex items-center gap-4">
                            <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-500 hover:text-slate-900 transition-colors h-10 w-10 bg-slate-200/50 rounded-full flex-shrink-0">
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                            <h1 className="text-xl md:text-2xl font-bold uppercase tracking-widest text-slate-800 drop-shadow-sm">{campaign.name}</h1>
                        </div>

                        {/* Right: Tabs */}
                        <TabsList className="bg-white/60 backdrop-blur border border-white shadow-sm rounded-xl p-1 h-12 overflow-x-auto justify-start xl:justify-end self-stretch xl:self-auto max-w-full">
                            {campaign.campaign_type !== 'BLASTER' && (
                                <TabsTrigger value="monitor" className={tabTriggerClass + " rounded-lg text-xs sm:text-sm"}>
                                    <Activity className="w-4 h-4" />
                                    Monitor
                                </TabsTrigger>
                            )}
                            {campaign.campaign_type !== 'INBOUND' && (
                                <TabsTrigger value="reports" className={tabTriggerClass + " rounded-lg text-xs sm:text-sm"}>
                                    <BarChart3 className="w-4 h-4" />
                                    Gestión
                                </TabsTrigger>
                            )}
                            {campaign.campaign_type !== 'INBOUND' && (
                                <TabsTrigger value="lists" className={tabTriggerClass + " rounded-lg text-xs sm:text-sm"}>
                                    <List className="w-4 h-4" />
                                    Listas
                                </TabsTrigger>
                            )}
                            <TabsTrigger value="agents" className={tabTriggerClass + " rounded-lg text-xs sm:text-sm"}>
                                <User className="w-4 h-4" />
                                Agentes
                            </TabsTrigger>
                            <TabsTrigger value="config" className={tabTriggerClass + " rounded-lg text-xs sm:text-sm"}>
                                <Settings className="w-4 h-4" />
                                Ajustes
                            </TabsTrigger>
                            {campaign.campaign_type === 'INBOUND' && (
                                <TabsTrigger value="dids" className={tabTriggerClass + " rounded-lg text-xs sm:text-sm"}>
                                    <Phone className="w-4 h-4" />
                                    DIDs
                                </TabsTrigger>
                            )}
                            {campaign.campaign_type !== 'INBOUND' && (
                                <>
                                    <TabsTrigger value="structure" className={tabTriggerClass + " rounded-lg text-xs sm:text-sm"}>
                                        <Database className="w-4 h-4" />
                                        Estructura
                                    </TabsTrigger>
                                    <TabsTrigger value="tts_templates" className={tabTriggerClass + " rounded-lg text-xs sm:text-sm"}>
                                        <Sparkles className="w-4 h-4" />
                                        Plantillas TTS
                                    </TabsTrigger>
                                </>
                            )}
                        </TabsList>
                    </div>

                {/* Tab: Monitor Content */}
                {campaign.campaign_type !== 'BLASTER' && (
                    <TabsContent value="monitor" forceMount className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden gap-4">
                        <TooltipProvider delayDuration={300}>
                            <div className="flex-1 overflow-auto bg-white/60 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm p-6 relative z-0">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h2 className="text-lg font-semibold text-slate-800">Estado de Agentes (Tiempo Real)</h2>
                                        <p className="text-sm text-slate-500 mt-1">Supervisión en vivo de la cola de agentes.</p>
                                    </div>
                                    <Button onClick={fetchAgents} variant="outline" size="sm" className="gap-2">
                                        <RefreshCw className={`w-4 h-4 ${loadingAgents ? 'animate-spin' : ''}`} />
                                        Actualizar
                                    </Button>
                                </div>

                                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                                            <tr>
                                                <th className="px-6 py-4">Agente</th>
                                                <th className="px-6 py-4">Extensión</th>
                                                <th className="px-6 py-4">Estado</th>
                                                <th className="px-6 py-4">Duración</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {allAgents.filter(a => campaignAgents.includes(a.username) && (a as any).state !== 'OFFLINE' && (a as any).state !== 'UNKNOWN').map(agent => {
                                                const stateObj = agent as any; // Need to map real-time state
                                                const state = stateObj.state;
                                                
                                                let rowColorClass = "bg-slate-50/40 hover:bg-slate-100/50";
                                                let badgeClass = "bg-slate-200 text-slate-600";
                                                let displayState = state;
                                                
                                                switch (state) {
                                                    case 'READY':
                                                    case 'WAITING':
                                                        rowColorClass = "bg-emerald-50/60 hover:bg-emerald-100/60";
                                                        badgeClass = "bg-emerald-200 text-emerald-800";
                                                        displayState = 'DISPONIBLE';
                                                        break;
                                                    case 'ON_CALL':
                                                    case 'INCALL':
                                                        rowColorClass = "bg-red-50 hover:bg-red-100";
                                                        badgeClass = "bg-red-200 text-red-800";
                                                        displayState = 'EN LLAMADA';
                                                        break;
                                                    case 'ACW':
                                                    case 'WRAPUP':
                                                        rowColorClass = "bg-orange-50 hover:bg-orange-100";
                                                        badgeClass = "bg-orange-200 text-orange-800";
                                                        displayState = 'CIERRE GESTIÓN';
                                                        break;
                                                    case 'PAUSED':
                                                    case 'BREAK':
                                                        rowColorClass = "bg-blue-50 hover:bg-blue-100";
                                                        badgeClass = "bg-blue-200 text-blue-800";
                                                        displayState = 'EN PAUSA';
                                                        break;
                                                    case 'RINGING':
                                                        rowColorClass = "bg-purple-50 hover:bg-purple-100";
                                                        badgeClass = "bg-purple-200 text-purple-800";
                                                        displayState = 'TIMBRANDO';
                                                        break;
                                                    case 'DIALING':
                                                        rowColorClass = "bg-cyan-50 hover:bg-cyan-100";
                                                        badgeClass = "bg-cyan-200 text-cyan-800";
                                                        displayState = 'MARCANDO';
                                                        break;
                                                    default:
                                                        rowColorClass = "bg-slate-50 hover:bg-slate-100 text-slate-600";
                                                        badgeClass = "bg-slate-200 text-slate-600";
                                                        displayState = state;
                                                }

                                                return (
                                                    <tr key={agent.username} className={`transition-colors ${rowColorClass}`}>
                                                        <td className="px-6 py-4 font-medium text-slate-800">{agent.name}</td>
                                                        <td className="px-6 py-4 text-slate-500">@{agent.username}</td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2.5 py-1 rounded-full text-[11px] uppercase font-bold tracking-wider ${badgeClass}`}>
                                                                {displayState}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 font-mono text-slate-600">
                                                            {stateObj.lastChange ? formatDuration(Math.floor((now - stateObj.lastChange) / 1000)) : '-'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {allAgents.filter(a => campaignAgents.includes(a.username) && (a as any).state !== 'OFFLINE' && (a as any).state !== 'UNKNOWN').length === 0 && (
                                                <tr>
                                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500 italic">No hay agentes conectados o en turno en esta campaña.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </TooltipProvider>
                    </TabsContent>
                )}

                {/* Tab: Reportes Content */}
                {campaign.campaign_type !== 'INBOUND' && (
                    <TabsContent value="reports" forceMount className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden gap-4">
                        <TooltipProvider delayDuration={300}>
                        <>
                        <div className="flex-shrink-0 flex flex-wrap xl:flex-nowrap items-center gap-3 w-full relative z-40 p-4 border border-slate-100/50 bg-white/60 backdrop-blur-md rounded-[20px] shadow-sm">
                            
                            {/* Buscar: Elastic Pill (Stretches to fill empty space) */}
                            <div className="flex-1 min-w-[200px] flex items-center h-11 px-4 bg-white/60 backdrop-blur-md border border-slate-200/80 rounded-full shadow-sm focus-within:bg-white focus-within:shadow-md focus-within:border-slate-300 transition-all duration-300">
                                <Search className="flex-shrink-0 w-4 h-4 text-slate-400 mr-2" />
                                <input
                                    placeholder="Buscar número o lista..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="outline-none w-full text-[14px] bg-transparent text-slate-700 placeholder:text-slate-400"
                                />
                            </div>

                            {/* Estado: Pill */}
                            <div className="w-[150px] flex-none flex items-center h-11 px-4 bg-white/60 backdrop-blur-md border border-slate-200/80 rounded-full shadow-sm hover:bg-white transition-all">
                                <span className="flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">ESTADO</span>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="h-full w-full bg-transparent border-0 shadow-none focus:ring-0 p-0 text-[13px] font-medium text-slate-700 outline-none">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl shadow-xl border-slate-100">
                                        <SelectItem value="all">Todos</SelectItem>
                                        {uniqueStatuses.map((status) => (
                                            <SelectItem key={status} value={status}>{status}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Lista: Pill */}
                            <div className="w-[150px] flex-none flex items-center h-11 px-4 bg-white/60 backdrop-blur-md border border-slate-200/80 rounded-full shadow-sm hover:bg-white transition-all">
                                <span className="flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">LISTA</span>
                                <Select value={listFilter} onValueChange={setListFilter}>
                                    <SelectTrigger className="h-full w-full bg-transparent border-0 shadow-none focus:ring-0 p-0 text-[13px] font-medium text-slate-700 outline-none">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl shadow-xl border-slate-100">
                                        <SelectItem value="all">Todas</SelectItem>
                                        {uniqueLists.map((listName) => (
                                            <SelectItem key={listName} value={listName}>{listName}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Date Group: Pill */}
                            <div className="flex-none flex items-center h-11 px-4 bg-white/60 backdrop-blur-md border border-slate-200/80 rounded-full shadow-sm hover:bg-white transition-all">
                                <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                                    <PopoverTrigger asChild>
                                        <button className="flex items-center h-full outline-none text-left focus:outline-none">
                                            <Calendar className="flex-shrink-0 w-4 h-4 text-slate-400 mr-2" />
                                            <span className="text-[13px] font-medium text-slate-700">
                                                {formatForBackendAPI(dateRange[0].startDate, timezone)} - {formatForBackendAPI(dateRange[0].endDate, timezone)}
                                            </span>
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 rounded-2xl shadow-2xl border-slate-100" align="end" style={{ zIndex: 9999 }}>
                                        <DateRangePicker
                                            ranges={dateRange}
                                            onChange={(item: any) => setDateRange([item.selection])}
                                            locale={es}
                                            dateDisplayFormat="yyyy-MM-dd"
                                        />
                                        <div className="p-3 border-t flex justify-end bg-slate-50/80 backdrop-blur-sm rounded-b-2xl">
                                            <Button className="rounded-full px-6 bg-slate-900 text-white hover:bg-slate-800" size="sm" onClick={() => setShowDatePicker(false)}>Aplicar</Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Separator */}
                            <div className="hidden xl:block w-px h-6 bg-slate-300 mx-1"></div>

                            {/* Actions Group */}
                            <div className="flex items-center gap-2 flex-none">
                                <Button onClick={fetchDialLog} disabled={loading} className="h-11 px-6 rounded-full gap-2 bg-slate-900 text-white hover:bg-slate-800 shadow-md hover:shadow-lg transition-all focus:ring-2 focus:ring-slate-900 focus:ring-offset-1">
                                    <Search className="w-4 h-4" />
                                    Consultar
                                </Button>
                                <Button onClick={handleDownloadReport} disabled={loading || filteredRecords.length === 0} variant="outline" className="h-11 px-5 rounded-full gap-2 border-slate-200/80 bg-white/60 backdrop-blur-md hover:bg-white text-slate-700 shadow-sm transition-all hover:shadow-md">
                                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                                    Exportar
                                </Button>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="h-11 px-5 rounded-full gap-2 border-slate-200/80 bg-white/60 backdrop-blur-md hover:bg-white text-slate-700 shadow-sm transition-all hover:shadow-md">
                                            <Columns className="w-4 h-4 text-blue-600" />
                                                Columnas
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent align="end" className="w-72 max-h-[400px] overflow-y-auto p-3" style={{ zIndex: 9999 }}>
                                        <h4 className="font-medium text-sm mb-3 px-2 text-slate-800">Configurar Columnas</h4>
                                        <div className="space-y-1">
                                            {tableColumns.map((col, index) => (
                                                <div 
                                                    key={col.id} 
                                                    className="flex items-center gap-3 p-1.5 hover:bg-slate-50 rounded-md transition-colors group cursor-move"
                                                    draggable
                                                    onDragStart={() => handleDragStart(index)}
                                                    onDragEnter={() => handleDragEnter(index)}
                                                    onDragEnd={handleDragEnd}
                                                    onDragOver={(e) => e.preventDefault()}
                                                >
                                                    <GripVertical className="w-4 h-4 text-slate-300" />
                                                    <div className="flex-shrink-0 flex items-center">
                                                        <Checkbox
                                                            checked={col.visible}
                                                            onCheckedChange={() => toggleColumnVisibility(col.id)}
                                                            id={`col-${col.id}`}
                                                            className="w-4 h-4 rounded-sm border-blue-500 data-[state=checked]:bg-blue-500 data-[state=checked]:text-white"
                                                        />
                                                    </div>
                                                    <Database className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                                                    <label 
                                                        htmlFor={`col-${col.id}`} 
                                                        className={`flex-1 text-sm cursor-pointer select-none truncate ${col.visible ? 'text-slate-800' : 'text-slate-400 line-through'}`}
                                                    >
                                                        {col.label}
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            </div>
                        {/* Table - full height */}
                        <div className="flex-1 flex flex-col min-h-0 bg-white/60 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden">
                            <div className="flex-1 overflow-auto min-h-0 custom-scrollbar" onScroll={handleScroll}>
                                <Table>
                                <TableHeader className="sticky top-0 bg-white/80 backdrop-blur-md shadow-sm border-b border-slate-100" style={{ zIndex: 10 }}>
                                    <TableRow>
                                        {tableColumns.filter(c => c.visible).map(col => (
                                            <TableHead key={col.id} className="bg-white font-semibold text-slate-800 capitalize">
                                                {col.label}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading && dialLogData.length === 0 ? (
                                        Array.from({ length: 15 }).map((_, i) => (
                                            <TableRow key={i}>
                                                {tableColumns.filter(c => c.visible).map((col) => (
                                                    <TableCell key={col.id}><Skeleton className="h-4 w-16" /></TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : error ? (
                                        <TableRow>
                                                <TableCell colSpan={tableColumns.filter(c => c.visible).length} className="text-center py-8 text-red-500">
                                                Error: {error}
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredRecords.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={tableColumns.filter(c => c.visible).length} className="h-32 text-center text-slate-500">
                                                {dialLogData.length === 0
                                                    ? "No hay registros para este rango de fechas"
                                                    : "No se encontraron registros con los filtros aplicados"}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredRecords.slice(0, displayedRecords).map((record, i) => {
                                            const displayStatus = getDisplayStatus(record);
                                            return (
                                                <TableRow key={`${record.call_date}-${record.phone_number}-${i}`} className="hover:bg-slate-50">
                                                    {tableColumns.filter(c => c.visible).map(col => {
                                                        if (col.id === 'sys_hora') return <TableCell key={col.id} className="font-mono text-sm">{formatToGlobalTimezone(record.call_date, timezone, 'HH:mm:ss')}</TableCell>;
                                                        if (col.id === 'sys_fecha') return <TableCell key={col.id} className="font-mono text-sm">{formatToGlobalTimezone(record.call_date, timezone, 'yyyy-MM-dd')}</TableCell>;
                                                        if (col.id === 'sys_estado') return (
                                                            <TableCell key={col.id}>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <span className="cursor-help inline-block">
                                                                            <Badge className={`${displayStatus.color} text-white`}>
                                                                                {displayStatus.label}
                                                                            </Badge>
                                                                        </span>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent><p>{displayStatus.description}</p></TooltipContent>
                                                                </Tooltip>
                                                            </TableCell>
                                                        );
                                                        if (col.id === 'sys_duracion') return <TableCell key={col.id} className="font-mono text-sm">{formatDuration(record.length_in_sec ?? record.call_duration ?? 0)}</TableCell>;
                                                        if (col.id === 'sys_intentos') return <TableCell key={col.id} className="font-mono">{record.attempt_number ?? record.called_count ?? 1}</TableCell>;
                                                        if (col.id === 'sys_dtmf') return <TableCell key={col.id} className="font-mono">{record.dtmf_pressed || record.dtmf_response || "-"}</TableCell>;
                                                        if (col.id === 'sys_lista') return <TableCell key={col.id}>{record.list_name || "-"}</TableCell>;
                                                        if (col.id === 'sys_desc') return <TableCell key={col.id} className="text-slate-600">{record.list_description || "-"}</TableCell>;
                                                        if (col.id === 'sys_callerid') return <TableCell key={col.id} className="font-mono text-sm">{record.caller_id || record.caller_code || record.outbound_cid || "-"}</TableCell>;
                                                        
                                                        // Dynamic fields
                                                        const colName = col.id.replace('dyn_', '');
                                                        let val = "";
                                                        if (colName === "telefono") val = record.phone_number || "";
                                                        else if (record.tts_vars && record.tts_vars[colName]) val = record.tts_vars[colName];
                                                        return <TableCell key={col.id} className="text-sm">{val !== "" ? val : "-"}</TableCell>;
                                                    })}
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        {/* Footer Info */}
                        <div className="flex-shrink-0 p-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-[13px] text-slate-500">
                            <span>
                                Mostrando {Math.min(displayedRecords, filteredRecords.length).toLocaleString()} de {filteredRecords.length.toLocaleString()} registros filtrados
                                {filteredRecords.length !== dialLogData.length && ` (${dialLogData.length.toLocaleString()} total)`}
                            </span>
                            {hasMore && <span>Desplázate para cargar más...</span>}
                        </div>
                        </div>
                        </>
                    </TooltipProvider>
                </TabsContent>
                )}

                {/* Tab: Listas */}
                <TabsContent value="lists" forceMount className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden gap-4">
                    
                    {/* List Actions Row (Clean, unified design matching Reports tab) */}
                    <div className="flex-shrink-0 flex justify-end items-center gap-3 w-full relative z-40 p-4 border border-slate-100/50 bg-white/60 backdrop-blur-md rounded-[20px] shadow-sm">
                        <Button 
                            onClick={() => setShowUploadWizard(true)}
                            className="h-11 px-6 rounded-full gap-2 border-slate-200/80 bg-slate-100/50 hover:bg-white text-slate-800 shadow-sm transition-all hover:shadow-md font-semibold"
                        >
                            <Upload className="w-4 h-4 text-blue-600" />
                            Cargar Leads
                        </Button>
                    </div>
                    
                    {/* Modal para Cargar Leads */}
                    <Dialog open={showUploadWizard} onOpenChange={setShowUploadWizard}>
                        <DialogContent className="max-w-4xl border-none shadow-2xl p-0 overflow-hidden bg-slate-50/95 backdrop-blur-3xl rounded-2xl h-[85vh] flex flex-col">
                            <DialogTitle className="sr-only">Cargar Leads</DialogTitle>
                            <DialogDescription className="sr-only">Sube un archivo de base de datos para la campaña.</DialogDescription>
                            <div className="flex-1 overflow-y-auto p-8 rounded-2xl bg-white shadow-sm m-2 border border-slate-100">
                                <UploadWizardContent
                                    campaignName={campaign.name}
                                    campaignId={campaign.id}
                                    onCancel={handleUploadCancel}
                                    onSuccess={handleUploadSuccess}
                                />
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Lists table */}
                            <div className="flex-1 overflow-auto min-h-0 bg-white/60 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden custom-scrollbar">
                                {loadingLists ? (
                                    <div className="flex justify-center items-center py-12">
                                        <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-2" />
                                        <span className="text-slate-500 font-medium">Cargando listas...</span>
                                    </div>
                                ) : campaignLists.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center text-center py-12">
                                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                            <List className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <p className="text-slate-500 font-medium">No hay listas asociadas a esta campaña</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-sm text-left">
                                                <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50/80 border-b border-slate-200/60">
                                                    <tr>
                                                        <th className="px-5 py-3 font-semibold">Lista y Descripción</th>
                                                        <th className="px-5 py-3 font-semibold text-center">Estado</th>
                                                        <th className="px-5 py-3 font-semibold text-center">Total</th>
                                                        <th className="px-5 py-3 font-semibold text-center text-blue-500">Nuevos</th>
                                                        <th className="px-5 py-3 font-semibold text-center text-emerald-500">Procesados</th>
                                                        <th className="px-5 py-3 font-semibold text-center text-amber-500">Intentos</th>
                                                        <th className="px-5 py-3 font-semibold text-center">Fecha</th>
                                                        <th className="px-5 py-3 font-semibold text-right">Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {campaignLists.map((list) => (
                                                        <ContextMenu key={list.list_id}>
                                                            <ContextMenuTrigger asChild>
                                                                <tr className="hover:bg-slate-50/50 transition-colors cursor-context-menu relative group/row">
                                                                    <td className="px-5 py-3.5 relative">
                                                                        <div className={`absolute left-0 top-0 bottom-0 w-1 transition-colors duration-500 ${list.active === 'Y' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                                        <div className="flex flex-col pl-2">
                                                                            <span className="font-bold text-slate-800 text-[14px] truncate max-w-[200px]" title={list.list_name}>{list.list_name}</span>
                                                                            <span className="text-[11px] text-slate-400 font-medium truncate max-w-[200px]" title={list.list_description}>{list.list_description || "Sin descripción"}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-5 py-3.5 text-center">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleToggleListStatus(list);
                                                                            }}
                                                                            className={`h-7 px-3 flex-shrink-0 gap-1 font-bold text-[10px] rounded-full border transition-all mx-auto ${list.active === "Y"
                                                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800"
                                                                                : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 hover:text-slate-700"
                                                                                }`}
                                                                        >
                                                                            <Power className="w-3 h-3" />
                                                                            {list.active === "Y" ? "ACTIVA" : "INACTIVA"}
                                                                        </Button>
                                                                    </td>
                                                                    <td className="px-5 py-3.5 text-center font-mono font-black text-slate-700 text-sm">
                                                                        {list.total_leads?.toLocaleString() || 0}
                                                                    </td>
                                                                    <td className="px-5 py-3.5 text-center font-mono font-black text-blue-600 text-sm">
                                                                        {list.leads_new?.toLocaleString() || 0}
                                                                    </td>
                                                                    <td className="px-5 py-3.5 text-center font-mono font-black text-emerald-600 text-sm">
                                                                        {list.leads_contacted?.toLocaleString() || 0}
                                                                    </td>
                                                                    <td className="px-5 py-3.5 text-center font-mono font-black text-amber-600 text-sm">
                                                                        {list.total_attempts?.toLocaleString() || 0}
                                                                    </td>
                                                                    <td className="px-5 py-3.5 text-center text-slate-500 font-medium text-[12px]">
                                                                        {list.created_at ? new Date(list.created_at).toLocaleDateString('es-MX') : "N/A"}
                                                                    </td>
                                                                    <td className="px-5 py-3.5 text-right">
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleOpenRecycleModal(list);
                                                                            }}
                                                                            className="h-8 rounded-lg bg-white border-slate-200 text-[11px] text-slate-600 hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 transition-colors shadow-sm inline-flex group-hover/row:border-amber-200/50"
                                                                            title="Reciclar Lista"
                                                                        >
                                                                            <RefreshCcw className="w-3.5 h-3.5 mr-1" />
                                                                            Reciclar
                                                                        </Button>
                                                                    </td>
                                                                </tr>
                                                            </ContextMenuTrigger>
                                                            <ContextMenuContent className="w-64">
                                                                <ContextMenuItem 
                                                                    className="text-red-600 font-semibold cursor-pointer focus:bg-red-50 focus:text-red-700" 
                                                                    onClick={() => handleDeleteList(list.list_id)}
                                                                >
                                                                    Eliminar Lista y Leads Asociados
                                                                </ContextMenuItem>
                                                            </ContextMenuContent>
                                                        </ContextMenu>
                                                    ))}
                                                </tbody>
                                            </table>
                                )}
                            </div>
                </TabsContent>

                {/* Tab: Config */}
                <TabsContent value="agents" forceMount className="flex-1 overflow-auto bg-white/60 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm p-6 mt-0 data-[state=inactive]:hidden text-left relative z-0">
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-800">Agentes Asignados</h2>
                                <p className="text-sm text-slate-500 mt-1">Selecciona qué agentes podrán recibir y realizar llamadas de esta campaña.</p>
                            </div>
                            <Button 
                                onClick={handleSaveAgents} 
                                disabled={savingAgents}
                                className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl"
                            >
                                {savingAgents ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                Guardar Asignación
                            </Button>
                        </div>
                        
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                                <Input 
                                    placeholder="Buscar agente por nombre o usuario..." 
                                    className="pl-9 w-full bg-white border-slate-200"
                                    value={agentSearchTerm}
                                    onChange={(e) => setAgentSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {loadingAgents ? (
                            <div className="flex justify-center p-12">
                                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* NO ASIGNADOS */}
                                <div className="border border-slate-200 rounded-xl bg-white flex flex-col shadow-sm">
                                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center rounded-t-xl">
                                        <h3 className="font-semibold text-slate-700">Disponibles</h3>
                                        <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">
                                            {allAgents.filter(a => !campaignAgents.includes(a.username)).length}
                                        </span>
                                    </div>
                                    <div className="flex-1 h-[400px] overflow-y-auto p-2">
                                        {allAgents
                                            .filter(agent => !campaignAgents.includes(agent.username))
                                            .filter(agent => 
                                                agent.name.toLowerCase().includes(agentSearchTerm.toLowerCase()) || 
                                                agent.username.toLowerCase().includes(agentSearchTerm.toLowerCase())
                                            )
                                            .map(agent => (
                                                <div 
                                                    key={agent.username}
                                                    onClick={() => toggleAgentAssignment(agent.username)}
                                                    className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-slate-200 group"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                                                            <User className="w-4 h-4 text-slate-400" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-slate-800 text-sm">{agent.name}</p>
                                                            <p className="text-xs text-slate-500">@{agent.username}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-slate-300 group-hover:text-blue-500 px-2 transition-colors">
                                                        <ArrowRight className="w-4 h-4" />
                                                    </div>
                                                </div>
                                            ))}
                                            {allAgents.filter(agent => !campaignAgents.includes(agent.username)).length === 0 && (
                                                <div className="text-center p-8 text-slate-400 italic text-sm">
                                                    No hay agentes disponibles
                                                </div>
                                            )}
                                    </div>
                                </div>

                                {/* ASIGNADOS */}
                                <div className="border border-blue-200 rounded-xl bg-white flex flex-col shadow-sm">
                                    <div className="bg-blue-50 border-b border-blue-100 px-4 py-3 flex justify-between items-center rounded-t-xl">
                                        <h3 className="font-semibold text-blue-800">Asignados a la campaña</h3>
                                        <span className="bg-blue-200 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">
                                            {campaignAgents.length}
                                        </span>
                                    </div>
                                    <div className="flex-1 h-[400px] overflow-y-auto p-2">
                                        {allAgents
                                            .filter(agent => campaignAgents.includes(agent.username))
                                            .filter(agent => 
                                                agent.name.toLowerCase().includes(agentSearchTerm.toLowerCase()) || 
                                                agent.username.toLowerCase().includes(agentSearchTerm.toLowerCase())
                                            )
                                            .map(agent => (
                                                <div 
                                                    key={agent.username}
                                                    onClick={() => toggleAgentAssignment(agent.username)}
                                                    className="flex items-center justify-between p-3 hover:bg-red-50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-red-100 group"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                                            <User className="w-4 h-4 text-blue-600" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-slate-800 text-sm">{agent.name}</p>
                                                            <p className="text-xs text-slate-500">@{agent.username}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-slate-300 group-hover:text-red-500 px-2 transition-colors">
                                                        <X className="w-4 h-4" />
                                                    </div>
                                                </div>
                                            ))}
                                            {campaignAgents.length === 0 && (
                                                <div className="text-center p-8 text-slate-400 italic text-sm">
                                                    Ningún agente asignado
                                                </div>
                                            )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="config" forceMount className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden" >
                    <div className="space-y-6">
                        
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                            
                            {/* Card: Nivel de Marcado (Columna 1) */}
                            <div className="xl:col-span-1 space-y-4">
                                <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase px-2">Estrategia de Marcación</h3>
                                <Card className="shadow-sm border border-slate-200/60 bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden transition-all duration-300">
                                    <CardHeader className="py-4 border-b border-slate-100/50 bg-white/40">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                                <Zap className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-sm font-semibold">Nivel de Auto-Marcación</CardTitle>
                                                <CardDescription className="text-xs">Velocidad y llamadas simultáneas por agente.</CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-5 flex flex-col gap-5">
                                        <div className="w-full">
                                            <Label htmlFor="dialLevel" className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Ratio de Marcación</Label>
                                            <Select value={dialLevel?.toString() || "1.0"} onValueChange={setDialLevel}>
                                                <SelectTrigger id="dialLevel" className="font-mono text-lg h-11 w-full bg-white shadow-sm">
                                                    <SelectValue placeholder="Ratio" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl shadow-xl border-slate-100">
                                                    {[1.0, 2.0, 3.0, 4.0, 5.0, 10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0].map((ratio) => (
                                                        <SelectItem key={ratio} value={ratio.toFixed(1)}>
                                                            {ratio.toFixed(1)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {cpsAvailability && (
                                            <div className="w-full bg-slate-50/50 p-3.5 rounded-xl border border-slate-200/60 flex flex-col gap-2">
                                                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Network className="w-3.5 h-3.5 text-blue-500" /> Bolsa Global CPS</span>
                                                <div className="flex justify-between items-center bg-white px-3 py-1.5 rounded flex-1 border border-slate-100 shadow-sm">
                                                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Disponibles</span>
                                                    <span className={`text-sm font-bold ${cpsAvailability.available_cps <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                                        {cpsAvailability.available_cps} <span className="text-slate-400 font-normal">/ {cpsAvailability.total_cps}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Card: Troncal de Salida */}
                                <Card className="shadow-sm border border-slate-200/60 bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden transition-all duration-300 mt-4">
                                    <CardHeader className="py-4 border-b border-slate-100/50 bg-white/40">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-violet-100 rounded-lg text-violet-600">
                                                <Network className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-sm font-semibold">Troncal de Salida</CardTitle>
                                                <CardDescription className="text-xs">Ruta por la que salen las llamadas</CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-5">
                                        <div className="w-full">
                                            <Label htmlFor="trunkSelect" className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Troncal Asignada</Label>
                                            <Select value={selectedTrunkId} onValueChange={setSelectedTrunkId}>
                                                <SelectTrigger id="trunkSelect" className="font-mono text-sm h-11 w-full bg-white shadow-sm">
                                                    <SelectValue placeholder="Sin troncal asignada" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl shadow-xl border-slate-100">
                                                    <SelectItem value="__none__">Sin asignar (default .env)</SelectItem>
                                                    {availableTrunks.map((trunk: any) => (
                                                        <SelectItem key={trunk.trunk_id} value={trunk.trunk_id}>
                                                            {trunk.trunk_name} ({trunk.trunk_id})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-[10px] text-slate-400 mt-2 italic">La troncal por la que se enrutarán las llamadas de esta campaña.</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Card: Gestión de Reintentos Unificada (Columnas 2 y 3) */}
                            <div className="xl:col-span-2 space-y-4">
                                <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase px-2">Sistema de Reintentos</h3>
                                <Card className="shadow-sm border border-slate-200/60 bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden transition-all duration-300 h-[calc(100%-2rem)]">
                                    <CardHeader className="py-4 border-b border-slate-100/50 bg-white/40">
                                        <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                                                <Repeat className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-base">Gestión y Tiempos de Reintentos</CardTitle>
                                                <CardDescription className="text-xs">Límites y matriz de enfriamiento dinámico</CardDescription>
                                            </div>
                                        </div>
                                        <div className="bg-white/60 p-2 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3 px-4">
                                            <Label htmlFor="maxRetries" className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0 text-nowrap">Intentos Máx.</Label>
                                            <Select value={maxRetries.toString()} onValueChange={(val) => setMaxRetries(parseInt(val) || 0)}>
                                                <SelectTrigger id="maxRetries" className="font-mono text-base h-8 w-20 text-center border-slate-200 shadow-inner">
                                                    <SelectValue placeholder="Ej. 3" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl shadow-xl border-slate-100 min-w-[5rem]">
                                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                                        <SelectItem key={num} value={num.toString()}>
                                                            {num}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-5">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Activity className="w-3.5 h-3.5" />
                                        <span>Minutos de Enfriamiento por Disposición</span>
                                    </h4>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">
                                        {Object.entries({
                                            Rechazada: { desc: "Colgó la llamada o IVR", color: "text-orange-600" },
                                            Ocupado: { desc: "Red ocupada", color: "text-purple-600" },
                                            Buzon: { desc: "Contestadora automática", color: "text-indigo-600" },
                                            Cortada: { desc: "Corte SIP o carrier", color: "text-red-500" },
                                            NoContesta: { desc: "Ninguna respuesta humana", color: "text-yellow-600" },
                                            FalloTecnico: { desc: "Error genérico FAILED", color: "text-slate-600" }
                                        }).map(([key, info]) => {
                                            const groupKey = key as keyof typeof retryGroups;
                                            const isEnabled = retryGroups[groupKey].enabled;
                                            return (
                                            <div key={key} className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${isEnabled ? 'bg-slate-50/50 border-slate-100/80 hover:bg-slate-50 hover:border-slate-200' : 'bg-slate-100/40 border-slate-200/50 opacity-75 grayscale-[30%]'}`}>
                                                <div className="flex flex-col gap-1 w-1/2">
                                                    <Label className="text-xs font-semibold text-slate-700 tracking-wider flex items-center gap-1.5 cursor-pointer" onClick={() => setRetryGroups({ ...retryGroups, [groupKey]: { ...retryGroups[groupKey], enabled: !isEnabled } })}>
                                                        <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-current ' + info.color : 'bg-slate-300'}`} />
                                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                                    </Label>
                                                    <p className="text-[10px] text-slate-400 font-medium leading-tight truncate px-3.5" title={info.desc}>{info.desc}</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="relative flex-none w-[70px]">
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            value={retryGroups[groupKey].minutes}
                                                            onChange={(e) => setRetryGroups({ ...retryGroups, [groupKey]: { ...retryGroups[groupKey], minutes: Math.max(parseInt(e.target.value) || 1, 1) } })}
                                                            disabled={!isEnabled}
                                                            className="font-mono pr-6 bg-white border-slate-200 h-8 text-center text-sm disabled:bg-slate-100/50 disabled:text-slate-400 focus-visible:ring-1 shadow-inner focus-visible:ring-offset-0"
                                                        />
                                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase text-slate-400 font-bold tracking-wider">m</div>
                                                    </div>
                                                    <div className="w-px h-5 bg-slate-200" />
                                                    <Switch 
                                                        checked={isEnabled} 
                                                        onCheckedChange={(checked) => setRetryGroups({ ...retryGroups, [groupKey]: { ...retryGroups[groupKey], enabled: checked } })} 
                                                        className="scale-75 origin-right data-[state=checked]:bg-emerald-500 shadow-sm" 
                                                    />
                                                </div>
                                            </div>
                                        )})}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                        </div>

                        {/* Botón de Guardado General */}
                        <div className="flex items-center justify-end pt-2">
                            <Button
                                onClick={handleSaveGeneralSettings}
                                disabled={savingGeneral || !hasConfigChanges}
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

                        <div className="relative py-4 mt-8 mb-4">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-slate-200/60" />
                            </div>
                            <div className="relative flex justify-center">
                                <button
                                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                                    className="px-4 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors shadow-sm flex items-center gap-2"
                                >
                                    AVANZADO
                                    {showAdvancedSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </div>

                        {showAdvancedSettings && (
                            <Card className="shadow-sm border border-white/80 bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden transition-all duration-300 mb-8">
                                <CardHeader className="pb-3 border-b border-slate-100/50 bg-white/40">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                                            <Phone className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base font-medium">CallerID Local Presence</CardTitle>
                                            <CardDescription className="text-xs">
                                                Configura la rotación automática de CallerID basada en el prefijo del lead.
                                                <Badge variant="outline" className="ml-2 text-[10px] bg-slate-50">Experimental</Badge>
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <CampaignCallerIdSettings campaignId={campaign.id} />
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </TabsContent >

                {/* Tab: DIDs (INBOUND only) */}
                {campaign.campaign_type === 'INBOUND' && (
                    <TabsContent value="dids" forceMount className="flex-1 overflow-auto min-h-0 mt-0 data-[state=inactive]:hidden p-1">
                        <InboundDidsManager campaignId={campaign.id} />
                    </TabsContent>
                )}

                {/* Tab: Estructura */}
                <TabsContent value="structure" forceMount className="flex-1 overflow-auto min-h-0 mt-0 data-[state=inactive]:hidden p-1">
                    <div className="w-full space-y-6">
                        <Card className="shadow-sm border border-white/80 bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md hover:bg-white/80">
                            <CardHeader className="bg-white/40 border-b border-white/60">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Database className="w-5 h-5 text-indigo-500" />
                                    Estructura de Base de Datos
                                </CardTitle>
                                <CardDescription>
                                    Define las cabeceras de columnas que se validarán forzosamente al momento de hacer la carga de bases de datos para esta campaña. La variable "telefono" (o derivados) es exigida por omisión.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl mb-6 border border-slate-200">
                                    <div>
                                        <h4 className="font-medium text-slate-900 text-sm">Cascada de Teléfonos Alternos</h4>
                                        <p className="text-xs text-slate-500 mt-0.5 max-w-[500px]">Si el prospecto no contesta el teléfono principal, el marcador intentará automáticamente llamar a las columnas marcadas como teléfono antes de registrar un reintento.</p>
                                    </div>
                                    <Switch checked={altPhoneEnabled} onCheckedChange={setAltPhoneEnabled} />
                                </div>

                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nombre de Columna en Excel</TableHead>
                                            <TableHead>Validación</TableHead>
                                            <TableHead className="w-[100px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {structureSchema.map((col, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="font-mono text-sm">{col.name}</TableCell>
                                                <TableCell>
                                                    {col.required ? (
                                                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-0 shadow-sm">Obligatorio</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-slate-500 bg-slate-50">Opcional</Badge>
                                                    )}
                                                    {col.name === "telefono" || col.is_phone ? (
                                                        <Badge variant="outline" className="ml-2 border-indigo-200 text-indigo-700 bg-indigo-50"><Phone className="w-3 h-3 mr-1" />Teléfono</Badge>
                                                    ) : null}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {col.name !== "telefono" && (
                                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveColumn(col.name)} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 rounded-full transition-colors">
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>

                                <div className="mt-8 bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <h4 className="text-sm font-medium text-slate-800 mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-slate-500"/> Añadir Propiedad de Información</h4>
                                    <div className="flex items-end gap-4">
                                        <div className="flex-1">
                                            <Label className="mb-2 block text-xs text-slate-500 font-medium ml-1">Nombre (Igual en Excel)</Label>
                                            <Input
                                                placeholder="Ej. mi_columna"
                                                value={newColumnName}
                                                onChange={(e) => setNewColumnName(e.target.value.replace(/\s+/g, "_").toLowerCase())}
                                                className="bg-white"
                                            />
                                        </div>
                                        <div className="flex items-center h-10 gap-2 mb-1 px-3">
                                            <Checkbox
                                                id="col-required"
                                                checked={newColumnRequired}
                                                onCheckedChange={(c) => setNewColumnRequired(!!c)}
                                            />
                                            <label htmlFor="col-required" className="text-sm cursor-pointer select-none font-medium text-slate-700">Requerir</label>
                                        </div>
                                        <div className="flex items-center h-10 gap-2 mb-1 pr-4">
                                            <Checkbox
                                                id="col-is-phone"
                                                checked={newColumnIsPhone}
                                                onCheckedChange={(c) => setNewColumnIsPhone(!!c)}
                                            />
                                            <label htmlFor="col-is-phone" className="text-sm cursor-pointer select-none font-medium text-slate-700 shrink-0">Es Teléfono</label>
                                        </div>
                                        <Button type="button" onClick={handleAddColumn} variant="outline" className="gap-2 border-slate-300 hover:bg-white mb-0.5 shadow-sm">
                                            Añadir a Plantilla
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex justify-end mt-8 pt-6 border-t border-slate-100">
                                    <Button onClick={handleSaveStructure} disabled={isSavingStructure} className="gap-2 min-w-[200px] h-11 rounded-xl shadow-lg shadow-indigo-500/20 bg-indigo-600 hover:bg-indigo-700 transition-all">
                                        {isSavingStructure ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        {isSavingStructure ? "Guardando..." : "Guardar Estructura Global"}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Tab: TTS Templates */}
                <TabsContent value="tts_templates" forceMount className="flex-1 overflow-auto bg-white/60 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm p-6 mt-0 data-[state=inactive]:hidden text-left relative z-0">
                    <div className="flex gap-6 h-full min-h-[500px]">
                        {/* Selected Template Form */}
                        <div className="w-2/3 flex flex-col gap-4 max-h-[550px] bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                            {!selectedTtsTemplate ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                    <Sparkles className="w-12 h-12 mb-4 text-slate-300" />
                                    <p className="font-medium">Selecciona una plantilla o crea una nueva</p>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col min-h-0 relative z-0 overflow-hidden">
                                    <div className="mb-4">
                                        <Label className="text-sm font-semibold mb-1.5 block">Nombre de Plantilla</Label>
                                        <Input 
                                            placeholder="Ej. Aviso de Cobro"
                                            value={selectedTtsTemplate.name}
                                            onChange={(e) => setSelectedTtsTemplate({...selectedTtsTemplate, name: e.target.value})}
                                        />
                                    </div>
                                    <div className="flex-1 flex flex-col min-h-[250px] overflow-hidden">
                                        <div className="flex justify-between items-end mb-1.5">
                                            <Label className="text-sm font-semibold">Contenido del Mensaje</Label>
                                            <span className="text-xs text-slate-500">
                                                {selectedTtsTemplate.content.length} caracteres
                                            </span>
                                        </div>
                                        <textarea
                                            className="flex-1 w-full p-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                                            placeholder="Escribe el mensaje aquí. Usa las pastillas de la derecha para insertar variables dinámicas."
                                            value={selectedTtsTemplate.content}
                                            onChange={(e) => setSelectedTtsTemplate({...selectedTtsTemplate, content: e.target.value})}
                                            id="tts-textarea"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2 mt-4 flex-shrink-0">
                                        <Button
                                            variant="default"
                                            disabled={isSavingTts}
                                            onClick={async () => {
                                                setIsSavingTts(true);
                                                try {
                                                    const newTemplates = ttsTemplates.map(t => t.id === selectedTtsTemplate.id ? selectedTtsTemplate : t);
                                                    if (!ttsTemplates.find(t => t.id === selectedTtsTemplate.id)) {
                                                        newTemplates.push(selectedTtsTemplate);
                                                    }
                                                    await api.updateCampaignTTSTemplates(campaign.id, newTemplates);
                                                    setTtsTemplates(newTemplates);
                                                    if (onUpdateCampaign) onUpdateCampaign();
                                                    toast.success("Plantilla guardada");
                                                } catch (e: any) {
                                                    toast.error("Error al guardar: " + e.message);
                                                } finally {
                                                    setIsSavingTts(false);
                                                }
                                            }}
                                        >
                                            {isSavingTts ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                            Guardar Plantilla
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Variables & Template List Sidebar */}
                        <div className="w-1/3 flex flex-col gap-6 max-h-[550px] overflow-y-auto pr-2 custom-scrollbar">
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-semibold text-sm text-slate-800">Tus Plantillas</h3>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 rounded-lg bg-white shadow-sm border-slate-200"
                                        onClick={() => setSelectedTtsTemplate({id: Date.now().toString(), name: "Nueva Plantilla", content: ""})}
                                    >
                                        + Nueva
                                    </Button>
                                </div>
                                <div className="space-y-2.5">
                                    {ttsTemplates.length === 0 ? (
                                        <p className="text-xs text-slate-500 italic">No hay plantillas creadas.</p>
                                    ) : (
                                        ttsTemplates.map(t => (
                                            <div 
                                                key={t.id}
                                                className={`p-3 rounded-xl border text-sm cursor-pointer flex justify-between items-center group transition-all duration-200 shadow-sm ${selectedTtsTemplate?.id === t.id ? 'bg-slate-900 text-white border-slate-900 shadow-md transform scale-[1.02]' : 'bg-white/80 border-slate-200/60 hover:bg-white hover:border-slate-300 hover:shadow-md'}`}
                                                onClick={() => setSelectedTtsTemplate(t)}
                                            >
                                                <span className="truncate flex-1 font-medium">{t.name}</span>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className={`h-6 w-6 opacity-0 group-hover:opacity-100 ${selectedTtsTemplate?.id === t.id ? 'text-white hover:bg-white/20 hover:text-white' : 'text-red-500 hover:text-red-600 hover:bg-red-50'}`}
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!window.confirm("¿Eliminar plantilla?")) return;
                                                        const newTemplates = ttsTemplates.filter(x => x.id !== t.id);
                                                        try {
                                                            await api.updateCampaignTTSTemplates(campaign.id, newTemplates);
                                                            setTtsTemplates(newTemplates);
                                                            if (selectedTtsTemplate?.id === t.id) setSelectedTtsTemplate(null);
                                                            toast.success("Plantilla eliminada");
                                                        } catch (err: any) { toast.error("Error: " + err.message); }
                                                    }}
                                                >
                                                    <XCircle className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {selectedTtsTemplate && (
                                <div className="flex-1 flex flex-col min-h-0 pt-4 border-t">
                                    <h3 className="font-semibold text-sm mb-2 text-slate-700">Variables Dinámicas</h3>
                                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                                        Haz clic en las variables para añadirlas a la plantilla.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <Badge 
                                            variant="outline" 
                                            className="cursor-pointer hover:bg-blue-50 border-blue-200 text-blue-700 font-mono"
                                            onClick={() => {
                                                const textarea = document.getElementById('tts-textarea') as HTMLTextAreaElement;
                                                const start = textarea?.selectionStart ?? selectedTtsTemplate.content.length;
                                                const newContent = selectedTtsTemplate.content.substring(0, start) + '{telefono}' + selectedTtsTemplate.content.substring(start);
                                                setSelectedTtsTemplate({...selectedTtsTemplate, content: newContent});
                                                
                                                // Focus and place cursor after inserted text
                                                setTimeout(() => {
                                                    textarea?.focus();
                                                    textarea?.setSelectionRange(start + 10, start + 10);
                                                }, 0);
                                            }}
                                        >
                                            {'{telefono}'}
                                        </Badge>
                                        <Badge 
                                            variant="outline" 
                                            className="cursor-pointer hover:bg-blue-50 border-blue-200 text-blue-700 font-mono"
                                            onClick={() => {
                                                const textarea = document.getElementById('tts-textarea') as HTMLTextAreaElement;
                                                const start = textarea?.selectionStart ?? selectedTtsTemplate.content.length;
                                                const newContent = selectedTtsTemplate.content.substring(0, start) + '{nombre}' + selectedTtsTemplate.content.substring(start);
                                                setSelectedTtsTemplate({...selectedTtsTemplate, content: newContent});
                                                
                                                // Focus and place cursor after inserted text
                                                setTimeout(() => {
                                                    textarea?.focus();
                                                    textarea?.setSelectionRange(start + 8, start + 8);
                                                }, 0);
                                            }}
                                        >
                                            {'{nombre}'}
                                        </Badge>
                                        {structureSchema.map(col => (
                                            col.name !== 'telefono' && (
                                                <Badge 
                                                    key={col.name}
                                                    variant="secondary"
                                                    className="cursor-pointer hover:bg-slate-200 font-mono bg-slate-100"
                                                    onClick={() => {
                                                        const textarea = document.getElementById('tts-textarea') as HTMLTextAreaElement;
                                                        const start = textarea?.selectionStart ?? selectedTtsTemplate.content.length;
                                                        const insertStr = `{${col.name}}`;
                                                        const newContent = selectedTtsTemplate.content.substring(0, start) + insertStr + selectedTtsTemplate.content.substring(start);
                                                        setSelectedTtsTemplate({...selectedTtsTemplate, content: newContent});
                                                        
                                                        // Focus and place cursor after inserted text
                                                        setTimeout(() => {
                                                            textarea?.focus();
                                                            textarea?.setSelectionRange(start + insertStr.length, start + insertStr.length);
                                                        }, 0);
                                                    }}
                                                >
                                                    {`{${col.name}}`}
                                                </Badge>
                                            )
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </TabsContent>
            </div>

            {/* Global Right Sidebar */}
            <div className="w-56 lg:w-64 xl:w-[320px] flex-shrink-0 flex flex-col gap-6">
                {campaign.campaign_type !== 'INBOUND' && (
                    <Button
                        variant={campaignStatus === 'active' ? 'default' : 'destructive'}
                        onClick={handleToggleCampaign}
                        disabled={isToggling}
                        className={`w-full h-12 rounded-xl shadow-sm transition-all flex justify-between items-center px-6 border-0 ${campaignStatus === 'active'
                            ? 'bg-[#00a86b] hover:bg-[#00905a] text-white shadow-emerald-500/20'
                            : 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'
                            }`}
                    >
                        {isToggling ? (
                            <><Loader2 className="w-5 h-5 animate-spin mx-auto" /></>
                        ) : campaignStatus === 'active' ? (
                            <>
                                <span className="text-base tracking-wider font-semibold">ACTIVA</span>
                                <span className="text-base font-mono opacity-90 tracking-widest">{activeTimer}</span>
                            </>
                        ) : (
                            <span className="text-base tracking-wider font-semibold mx-auto">DETENIDA</span>
                        )}
                    </Button>
                )}

                {/* Detalles de la Campaña */}
                <Card className="flex-1 shadow-sm border border-slate-200 bg-white flex flex-col rounded-[20px] overflow-hidden min-h-0 relative z-10">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-baseline justify-between">
                        <div className="flex items-center gap-3">
                            <List className="w-5 h-5 text-slate-500" />
                            <h3 className="font-semibold text-[15px] tracking-wide text-slate-800">Detalles de la Campaña</h3>
                        </div>
                    </div>
                    
                    {/* Progresos Integrados */}
                    <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex flex-col gap-4">
                        {campaign.campaign_type === 'INBOUND' ? (
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                        Cola de Llamadas Entrantes
                                    </span>
                                </div>
                                <div className="text-xs text-slate-500">
                                    Agentes Asignados: <span className="font-semibold text-slate-700">{campaignAgents.length}</span>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Progreso Registros */}
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                            Registros Óptimos Únicos
                                        </span>
                                        <span className="text-[11px] font-bold text-slate-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded">{progressPercent}%</span>
                                    </div>
                                    <Progress value={progressPercent} className="h-1.5 mb-1.5 bg-slate-200 [&>div]:bg-slate-700" />
                                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium tracking-wide">
                                        <span>{dialedActiveLeads.toLocaleString()} DISCADOS</span>
                                        <span>{totalActiveLeads.toLocaleString()} TOTAL</span>
                                    </div>
                                </div>

                                {/* Progreso Reintentos */}
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                                            <Activity className="w-3.5 h-3.5 text-emerald-500" /> Agotamiento de Reintentos
                                        </span>
                                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">{retriesProgressPercent}%</span>
                                    </div>
                                    <Progress value={Math.min(100, retriesProgressPercent)} className="h-1.5 mb-1.5 bg-slate-200 [&>div]:bg-emerald-500" />
                                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium tracking-wide">
                                        <span>{totalAttemptsMade.toLocaleString()} MARCACIONES REALIZADAS</span>
                                        <span>{potentialTotalAttempts.toLocaleString()} LÍMITE</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {statusSummary.length > 0 ? (
                            statusSummary.map((status) => {
                                const hexColor = getHexColor(status.color);
                                
                                return (
                                    <div key={status.label} className="relative flex justify-between items-center group p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-white/50 backdrop-blur-sm overflow-hidden min-h-[48px] transition-all">
                                        {/* Background Sparkline */}
                                        <div className="absolute inset-0 right-0 left-10 opacity-15 pointer-events-none transition-opacity group-hover:opacity-25" style={{ bottom: '-1px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={status.graphData}>
                                                    <Area 
                                                        type="monotone" 
                                                        dataKey="count" 
                                                        stroke={hexColor} 
                                                        fill={hexColor} 
                                                        strokeWidth={2}
                                                        isAnimationActive={false}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>

                                        <div className="relative z-10 flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${status.color}`} />
                                            <span className="text-[12px] font-semibold tracking-wider text-slate-600 uppercase">{status.label}</span>
                                        </div>
                                        <span className="relative z-10 text-[15px] font-bold text-slate-800">{status.count.toLocaleString()}</span>
                                    </div>
                                )
                            })
                        ) : (
                            <p className="text-sm text-slate-400 italic text-center py-10">Sin datos</p>
                        )}
                    </div>
                </Card>
            </div>
            </div>
        </Tabs>

            {/* Recycle Modal */}
            <Dialog open={showRecycleModal} onOpenChange={setShowRecycleModal}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reciclar Lista: {listToRecycle?.list_name}</DialogTitle>
                        <DialogDescription className="hidden">Reciclar estados de la lista</DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        <p className="text-sm text-slate-500 mb-4">
                            Selecciona los estados que deseas reciclar. Los contactos con estos estados volverán al estado NEW para ser llamados nuevamente.
                        </p>

                        {loadingStatuses ? (
                            <div className="flex justify-center items-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-slate-400 mr-2" />
                                <span className="text-slate-500">Cargando estados...</span>
                            </div>
                        ) : statusCounts.length === 0 ? (
                            <div className="text-center py-6 bg-slate-50 rounded-lg border border-slate-100">
                                <p className="text-slate-500 text-sm">No hay contactos para reciclar en esta lista</p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                                <div className="flex items-center justify-between mb-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs text-blue-600 hover:text-blue-800 p-0"
                                        onClick={() => setSelectedStatuses(statusCounts.map(s => s.status))}
                                    >
                                        Seleccionar Todos
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs text-slate-500 hover:text-slate-700 p-0"
                                        onClick={() => setSelectedStatuses([])}
                                    >
                                        Limpiar
                                    </Button>
                                </div>
                                {statusCounts.map(({ status, count }) => {
                                    const statusInfo = translateLeadStatus(status);
                                    return (
                                        <div
                                            key={status}
                                            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${selectedStatuses.includes(status)
                                                ? 'bg-blue-50 border-blue-200'
                                                : 'bg-white border-slate-200 hover:bg-slate-50'
                                                }`}
                                            onClick={() => toggleStatusSelection(status)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Checkbox
                                                    checked={selectedStatuses.includes(status)}
                                                />
                                                <div>
                                                    <div className="font-medium text-sm text-slate-900 flex items-center gap-2">
                                                        {status}
                                                        <Badge className={`${getDialStatusColor(status)} text-white text-[10px] px-1.5 py-0 h-4`}>
                                                            {statusInfo.label}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-xs text-slate-500">{statusInfo.description}</div>
                                                </div>
                                            </div>
                                            <div className="text-sm font-medium text-slate-700 bg-white px-2 py-1 rounded shadow-sm border border-slate-100">
                                                {count.toLocaleString()}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowRecycleModal(false)}
                            disabled={isRecycling}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleConfirmRecycleList}
                            disabled={isRecycling || selectedStatuses.length === 0}
                            className="gap-2"
                        >
                            {isRecycling ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Reciclando...</>
                            ) : (
                                <><RefreshCcw className="w-4 h-4" /> Reciclar Seleccionados</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
