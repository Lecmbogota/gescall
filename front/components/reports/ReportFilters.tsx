import { useState, useEffect, useRef } from "react";
import api from "@/services/api";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { formatForBackendAPI } from "@/lib/dateUtils";
import { Button } from "../ui/button";
import {
    Search,
    Calendar,
    ChevronDown,
    Check,
    Loader2,
    Play,
} from "lucide-react";
import { toast } from "sonner";
import { DateRangePicker } from "react-date-range";
import { es } from "date-fns/locale";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";

export interface CampaignOption {
    campaign_id: string;
    campaign_name: string;
}

export interface ReportFiltersValue {
    campaigns: string[];
    startDatetime: string;
    endDatetime: string;
}

interface Props {
    /** Si true, sólo se permite seleccionar una campaña */
    singleCampaign?: boolean;
    /** Texto del botón de ejecución */
    runLabel?: string;
    /** Estado de carga */
    loading?: boolean;
    /** Callback al pulsar "Generar" */
    onRun: (value: ReportFiltersValue) => void;
    /** Slot opcional a la derecha (export, búsqueda, etc.) */
    rightSlot?: React.ReactNode;
    /** Si se proporciona, fija la lista de campañas seleccionadas (controlado externamente) */
    initialCampaigns?: string[];
}

export function ReportFilters({ singleCampaign = false, runLabel = "Generar", loading = false, onRun, rightSlot, initialCampaigns }: Props) {
    const { getCampaignIds, isAdmin } = useAuthStore();
    const timezone = useSettingsStore((state) => state.timezone);

    const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
    const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>(initialCampaigns ?? []);
    const [loadingCampaigns, setLoadingCampaigns] = useState(true);
    const [campaignDropdownOpen, setCampaignDropdownOpen] = useState(false);
    const [campaignSearch, setCampaignSearch] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [dateRange, setDateRange] = useState([
        { startDate: today, endDate: today, key: "selection" },
    ]);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const datePickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
                setCampaignDropdownOpen(false);
            if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node))
                setShowDatePicker(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
        const fetchCampaigns = async () => {
            try {
                const allowedCampaigns = isAdmin() ? undefined : getCampaignIds();
                const response = await api.getCampaigns(allowedCampaigns ? { allowedCampaigns } : {});
                if (response.success && response.data) {
                    setCampaigns(
                        response.data.map((c: any) => ({
                            campaign_id: c.campaign_id,
                            campaign_name: c.campaign_name || c.campaign_id,
                        }))
                    );
                }
            } catch {
                toast.error("Error al cargar campañas");
            } finally {
                setLoadingCampaigns(false);
            }
        };
        fetchCampaigns();
    }, []);

    const toggleCampaign = (id: string) => {
        if (singleCampaign) {
            setSelectedCampaigns(selectedCampaigns.includes(id) ? [] : [id]);
        } else {
            setSelectedCampaigns((prev) =>
                prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
            );
        }
    };

    const toggleAll = () => {
        if (singleCampaign) return;
        setSelectedCampaigns(
            selectedCampaigns.length === campaigns.length
                ? []
                : campaigns.map((c) => c.campaign_id)
        );
    };

    const setPreset = (preset: "today" | "7days" | "month") => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        let start = new Date(now);
        if (preset === "7days") start.setDate(start.getDate() - 6);
        else if (preset === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
        setDateRange([{ startDate: start, endDate: now, key: "selection" }]);
    };

    const filteredCampaigns = campaigns.filter(
        (c) =>
            c.campaign_id.toLowerCase().includes(campaignSearch.toLowerCase()) ||
            c.campaign_name.toLowerCase().includes(campaignSearch.toLowerCase())
    );

    const handleRun = () => {
        if (selectedCampaigns.length === 0) {
            toast.error(singleCampaign ? "Selecciona una campaña" : "Selecciona al menos una campaña");
            return;
        }
        if (singleCampaign && selectedCampaigns.length !== 1) {
            toast.error("Este reporte requiere exactamente una campaña");
            return;
        }
        const startDate = dateRange[0].startDate;
        const endDate = dateRange[0].endDate;
        onRun({
            campaigns: selectedCampaigns,
            startDatetime: `${formatForBackendAPI(startDate, timezone)} 00:00:00`,
            endDatetime: `${formatForBackendAPI(endDate, timezone)} 23:59:59`,
        });
    };

    return (
        <div className="flex-shrink-0 bg-white/60 backdrop-blur-md border border-white/80 rounded-2xl shadow-sm px-3 py-2.5 mb-3 relative z-20">
            <div className="flex items-center gap-2 flex-wrap">
                {/* Campañas */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setCampaignDropdownOpen(!campaignDropdownOpen)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors bg-white min-w-[160px] justify-between"
                    >
                        <span className="truncate text-slate-700">
                            {selectedCampaigns.length === 0
                                ? singleCampaign ? "Campaña" : "Campañas"
                                : !singleCampaign && selectedCampaigns.length === campaigns.length
                                    ? `Todas (${campaigns.length})`
                                    : singleCampaign
                                        ? selectedCampaigns[0]
                                        : `${selectedCampaigns.length} campaña${selectedCampaigns.length > 1 ? "s" : ""}`}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    </button>
                    {campaignDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 w-72 bg-white/95 backdrop-blur border border-white rounded-xl shadow-xl z-50 overflow-hidden">
                            <div className="p-2 border-b border-slate-100">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar campaña..."
                                        value={campaignSearch}
                                        onChange={(e) => setCampaignSearch(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="max-h-52 overflow-y-auto">
                                {!singleCampaign && (
                                    <button
                                        onClick={toggleAll}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 font-medium text-slate-700"
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedCampaigns.length === campaigns.length && campaigns.length > 0 ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                                            {selectedCampaigns.length === campaigns.length && campaigns.length > 0 && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        Seleccionar todas
                                    </button>
                                )}
                                {loadingCampaigns ? (
                                    <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-400">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando...
                                    </div>
                                ) : (
                                    filteredCampaigns.map((c) => (
                                        <button
                                            key={c.campaign_id}
                                            onClick={() => toggleCampaign(c.campaign_id)}
                                            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-slate-50 text-left"
                                        >
                                            <div className={`w-4 h-4 ${singleCampaign ? "rounded-full" : "rounded"} border flex items-center justify-center flex-shrink-0 transition-colors ${selectedCampaigns.includes(c.campaign_id) ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                                                {selectedCampaigns.includes(c.campaign_id) && <Check className="w-3 h-3 text-white" />}
                                            </div>
                                            <span className="truncate text-slate-700">{c.campaign_name}</span>
                                            <span className="text-[10px] text-slate-400 ml-auto font-mono flex-shrink-0">
                                                {c.campaign_id}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-px h-6 bg-slate-200" />

                {/* Fechas */}
                <div className="relative" ref={datePickerRef}>
                    <button
                        onClick={() => setShowDatePicker(!showDatePicker)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors bg-white"
                    >
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-700 font-mono text-xs">
                            {formatForBackendAPI(dateRange[0].startDate, timezone)} → {formatForBackendAPI(dateRange[0].endDate, timezone)}
                        </span>
                    </button>
                    {showDatePicker && (
                        <div className="absolute top-full left-0 mt-1 bg-white/95 backdrop-blur border border-white rounded-xl shadow-xl z-50">
                            <div className="flex gap-1 px-3 pt-2">
                                <button onClick={() => setPreset("today")} className="text-xs px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">Hoy</button>
                                <button onClick={() => setPreset("7days")} className="text-xs px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">7 días</button>
                                <button onClick={() => setPreset("month")} className="text-xs px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">Mes</button>
                            </div>
                            <DateRangePicker
                                ranges={dateRange}
                                onChange={(item: any) => setDateRange([item.selection])}
                                locale={es}
                                dateDisplayFormat="yyyy-MM-dd"
                            />
                            <div className="px-3 pb-2 flex justify-end">
                                <button onClick={() => setShowDatePicker(false)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                                    Aplicar
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-px h-6 bg-slate-200" />

                <Button
                    onClick={handleRun}
                    disabled={loading || selectedCampaigns.length === 0}
                    size="sm"
                    className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-8"
                >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    {loading ? "..." : runLabel}
                </Button>

                {rightSlot && (
                    <>
                        <div className="w-px h-6 bg-slate-200" />
                        <div className="flex-1" />
                        {rightSlot}
                    </>
                )}
            </div>
        </div>
    );
}
