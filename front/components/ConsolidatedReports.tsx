import { useState, useEffect, useRef, useMemo } from "react";
import api from "@/services/api";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { formatForBackendAPI, formatToGlobalTimezone } from "@/lib/dateUtils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { getReportDisplayStatus } from "@/utils/callStatusUtils";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "./ui/table";
import {
    FileBarChart2,
    Download,
    Search,
    Calendar,
    FileSpreadsheet,
    FileText,
    ChevronDown,
    Check,
    X,
    Loader2,
    Play,
    ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { DateRangePicker } from "react-date-range";
import { es } from "date-fns/locale";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import * as XLSX from "xlsx";

interface CallRecord {
    call_date: string;
    phone_number: string;
    vendor_lead_code?: string;
    caller_id?: string;
    original_callerid?: string;
    call_status?: string;
    dtmf_pressed?: string;
    lead_status?: string;
    campaign_id: string;
    list_id: number;
    list_name?: string;
    list_description?: string;
    length_in_sec?: number;
    typification_name?: string;
    disposition?: string;
}

interface CampaignOption {
    campaign_id: string;
    campaign_name: string;
}

// dateUtils.ts replaces formatDateForAPI

const getDisplayStatus = (record: CallRecord): { label: string; color: string } => {
    return getReportDisplayStatus(record.call_status, record.dtmf_pressed, record.lead_status, record.typification_name);
};

type ExportFormat = "csv" | "excel" | "pdf";

interface ConsolidatedReportsProps {
    onBack?: () => void;
}

export function ConsolidatedReports({ onBack }: ConsolidatedReportsProps = {}) {
    const { getCampaignIds, isAdmin } = useAuthStore();
    const timezone = useSettingsStore((state) => state.timezone);
    const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
    const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
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

    const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
    const [data, setData] = useState<CallRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState<{
        current: number;
        total: number;
    } | null>(null);

    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [displayedRecords, setDisplayedRecords] = useState(200);

    // Click outside handlers
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node)
            )
                setCampaignDropdownOpen(false);
            if (
                datePickerRef.current &&
                !datePickerRef.current.contains(e.target as Node)
            )
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
            } catch (err) {
                toast.error("Error al cargar campañas");
            } finally {
                setLoadingCampaigns(false);
            }
        };
        fetchCampaigns();
    }, []);

    const toggleCampaign = (id: string) =>
        setSelectedCampaigns((prev) =>
            prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
        );

    const toggleAll = () =>
        setSelectedCampaigns(
            selectedCampaigns.length === campaigns.length
                ? []
                : campaigns.map((c) => c.campaign_id)
        );

    const setPreset = (preset: "today" | "7days" | "month") => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        let start = new Date(now);
        if (preset === "7days") start.setDate(start.getDate() - 6);
        else if (preset === "month")
            start = new Date(now.getFullYear(), now.getMonth(), 1);
        setDateRange([{ startDate: start, endDate: now, key: "selection" }]);
    };

    const getDatesBetween = (start: Date, end: Date): Date[] => {
        const dates: Date[] = [];
        const cur = new Date(start);
        cur.setHours(0, 0, 0, 0);
        const endD = new Date(end);
        endD.setHours(0, 0, 0, 0);
        while (cur <= endD) {
            dates.push(new Date(cur));
            cur.setDate(cur.getDate() + 1);
        }
        return dates;
    };

    const fetchData = async () => {
        if (selectedCampaigns.length === 0) {
            toast.error("Selecciona al menos una campaña");
            return;
        }
        setLoading(true);
        setData([]);
        setDisplayedRecords(200);
        try {
            const startDate = dateRange[0].startDate;
            const endDate = dateRange[0].endDate;
            const dates = getDatesBetween(startDate, endDate);
            const totalDays = dates.length;

            if (totalDays === 1) {
                const response = await api.getConsolidatedReport(
                    selectedCampaigns,
                    `${formatForBackendAPI(startDate, timezone)} 00:00:00`,
                    `${formatForBackendAPI(endDate, timezone)} 23:59:59`
                );
                if (response.success && response.data) {
                    const sorted = response.data.sort(
                        (a: CallRecord, b: CallRecord) => {
                            const dateA = a.call_date || "";
                            const dateB = b.call_date || "";
                            return dateB.localeCompare(dateA);
                        }
                    );
                    setData(sorted);
                    toast.success(`${sorted.length.toLocaleString()} registros`);
                }
            } else {
                setLoadingProgress({ current: 0, total: totalDays });
                let all: CallRecord[] = [];
                for (let i = 0; i < dates.length; i++) {
                    try {
                        const response = await api.getConsolidatedReport(
                            selectedCampaigns,
                            `${formatForBackendAPI(dates[i], timezone)} 00:00:00`,
                            `${formatForBackendAPI(dates[i], timezone)} 23:59:59`
                        );
                        if (response.success && response.data) {
                            all = all.concat(response.data);
                            setLoadingProgress({ current: i + 1, total: totalDays });
                            setData([...all]);
                        }
                    } catch { }
                }
                setLoadingProgress(null);
                const finalSorted = all.sort((a, b) => {
                    const dateA = a.call_date || "";
                    const dateB = b.call_date || "";
                    return dateB.localeCompare(dateA);
                });
                setData(finalSorted);
                toast.success(`${finalSorted.length.toLocaleString()} registros`);
            }
        } catch {
            toast.error("Error al cargar reporte");
        } finally {
            setLoading(false);
        }
    };

    // Filtered
    const filteredRecords = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return data.filter((r) => {
            const matchSearch =
                !q ||
                r.phone_number.includes(q) ||
                (r.vendor_lead_code && r.vendor_lead_code.toLowerCase().includes(q)) ||
                (r.list_name && r.list_name.toLowerCase().includes(q)) ||
                (r.campaign_id && r.campaign_id.toLowerCase().includes(q));
            const matchStatus =
                statusFilter === "all" || getDisplayStatus(r).label === statusFilter;
            return matchSearch && matchStatus;
        });
    }, [data, searchTerm, statusFilter]);

    const visibleRecords = filteredRecords.slice(0, displayedRecords);
    const hasMore = displayedRecords < filteredRecords.length;
    const uniqueStatuses = useMemo(() => {
        return Array.from(
            new Set(data.map((r) => getDisplayStatus(r).label))
        ).sort();
    }, [data]);

    useEffect(() => {
        setDisplayedRecords(200);
    }, [searchTerm, statusFilter]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const t = e.target as HTMLDivElement;
        if (t.scrollHeight - t.scrollTop <= t.clientHeight + 150 && hasMore && !loading) {
            setDisplayedRecords((prev) => prev + 200);
        }
    };

    const buildRows = (records: CallRecord[]) =>
        records.map((r) => {
            return {
                Fecha: formatToGlobalTimezone(r.call_date, timezone, 'yyyy-MM-dd'),
                Hora: formatToGlobalTimezone(r.call_date, timezone, 'HH:mm:ss'),
                Campaña: r.campaign_id,
                Lista: r.list_name || "",
                "Desc. Lista": r.list_description || "",
                Teléfono: r.phone_number,
                Identificador: r.vendor_lead_code || "",
                CallerID: r.caller_id || "",
                Estado: getDisplayStatus(r).label,
                DTMF: r.dtmf_pressed || "",
                Duración: r.length_in_sec || 0,
            };
        });

    const generateFilename = (ext: string) => {
        const c = selectedCampaigns.join("_").substring(0, 30);
        return `consolidado_${c}_${formatForBackendAPI(dateRange[0].startDate, timezone)}_${formatForBackendAPI(dateRange[0].endDate, timezone)}.${ext}`;
    };

    const downloadBlob = (blob: Blob, ext: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = generateFilename(ext);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast.success(`Descargado: ${filteredRecords.length.toLocaleString()} registros`);
    };

    const exportCSV = () => {
        const rows = buildRows(filteredRecords);
        if (!rows.length) return;
        const h = Object.keys(rows[0]);
        const csv = [
            h.join(","),
            ...rows.map((r) => h.map((k) => `"${(r as any)[k]}"`).join(",")),
        ].join("\n");
        downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), "csv");
    };

    const exportExcel = () => {
        const rows = buildRows(filteredRecords);
        if (!rows.length) return;
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = Object.keys(rows[0]).map((k) => ({
            wch: Math.max(k.length, ...rows.map((r) => String((r as any)[k]).length)),
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Consolidado");
        XLSX.writeFile(wb, generateFilename("xlsx"));
        toast.success(`Descargado: ${rows.length.toLocaleString()} registros`);
    };

    const exportPDF = () => {
        const rows = buildRows(filteredRecords);
        if (!rows.length) return;
        const h = Object.keys(rows[0]);
        const html = `<html><head><title>Consolidado</title><style>
      body{font-family:Inter,system-ui,sans-serif;font-size:9px;margin:12px;color:#1e293b}
      h1{font-size:14px;margin:0 0 4px}
      .meta{color:#64748b;margin-bottom:8px;font-size:10px}
      table{width:100%;border-collapse:collapse}
      th{background:#0f172a;color:#fff;padding:5px 6px;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.5px}
      td{border-bottom:1px solid #e2e8f0;padding:3px 6px;font-size:8px}
      tr:nth-child(even){background:#f8fafc}
      @media print{body{margin:0}}
    </style></head><body>
      <h1>Reporte Consolidado</h1>
      <div class="meta">Campañas: ${selectedCampaigns.join(", ")} · ${formatForBackendAPI(dateRange[0].startDate, timezone)} → ${formatForBackendAPI(dateRange[0].endDate, timezone)} · ${rows.length.toLocaleString()} registros</div>
      <table><thead><tr>${h.map((k) => `<th>${k}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${h.map((k) => `<td>${(r as any)[k]}</td>`).join("")}</tr>`).join("")}</tbody></table>
    </body></html>`;
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
    };

    const handleExport = () => {
        if (!filteredRecords.length) return toast.error("No hay datos");
        if (exportFormat === "csv") exportCSV();
        else if (exportFormat === "excel") exportExcel();
        else exportPDF();
    };

    const pdfDisabled = data.length > 100000;
    const filteredCampaigns = campaigns.filter(
        (c) =>
            c.campaign_id.toLowerCase().includes(campaignSearch.toLowerCase()) ||
            c.campaign_name.toLowerCase().includes(campaignSearch.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full gap-0">
            {/* ── Header Bar ── */}
            <div className="flex-shrink-0 flex items-center justify-between px-1 pb-3">
                <div className="flex items-center gap-2.5">
                    {onBack && (
                        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 gap-1">
                            <ArrowLeft className="w-4 h-4" /> Volver
                        </Button>
                    )}
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-sm">
                        <FileBarChart2 className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900 leading-tight">Detalle consolidado de llamadas</h1>
                        <p className="text-xs text-slate-400">Múltiples campañas · Exporta CSV, Excel o PDF</p>
                    </div>
                </div>
                {data.length > 0 && (
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                        {filteredRecords.length.toLocaleString()} registros
                    </span>
                )}
            </div>

            {/* ── Compact Filter Bar ── */}
            <div className="flex-shrink-0 bg-white/60 backdrop-blur-md border border-white/80 rounded-2xl shadow-sm px-3 py-2.5 mb-3 relative z-20">
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Campaign dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setCampaignDropdownOpen(!campaignDropdownOpen)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors bg-white min-w-[160px] justify-between"
                        >
                            <span className="truncate text-slate-700">
                                {selectedCampaigns.length === 0
                                    ? "Campañas"
                                    : selectedCampaigns.length === campaigns.length
                                        ? `Todas (${campaigns.length})`
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
                                    <button
                                        onClick={toggleAll}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 font-medium text-slate-700"
                                    >
                                        <div
                                            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedCampaigns.length === campaigns.length && campaigns.length > 0
                                                ? "bg-blue-600 border-blue-600"
                                                : "border-slate-300"
                                                }`}
                                        >
                                            {selectedCampaigns.length === campaigns.length && campaigns.length > 0 && (
                                                <Check className="w-3 h-3 text-white" />
                                            )}
                                        </div>
                                        Seleccionar todas
                                    </button>
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
                                                <div
                                                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${selectedCampaigns.includes(c.campaign_id)
                                                        ? "bg-blue-600 border-blue-600"
                                                        : "border-slate-300"
                                                        }`}
                                                >
                                                    {selectedCampaigns.includes(c.campaign_id) && (
                                                        <Check className="w-3 h-3 text-white" />
                                                    )}
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

                    {/* Separator */}
                    <div className="w-px h-6 bg-slate-200" />

                    {/* Date range */}
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

                    {/* Generate button */}
                    <Button
                        onClick={fetchData}
                        disabled={loading || selectedCampaigns.length === 0}
                        size="sm"
                        className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-8"
                    >
                        {loading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Play className="w-3.5 h-3.5" />
                        )}
                        {loading
                            ? loadingProgress
                                ? `${loadingProgress.current}/${loadingProgress.total}`
                                : "..."
                            : "Generar"}
                    </Button>

                    <div className="w-px h-6 bg-slate-200" />

                    {/* Format selector + download */}
                    <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                        {(["csv", "excel", "pdf"] as ExportFormat[]).map((fmt) => (
                            <button
                                key={fmt}
                                onClick={() => !(fmt === "pdf" && pdfDisabled) && setExportFormat(fmt)}
                                disabled={fmt === "pdf" && pdfDisabled}
                                className={`px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${exportFormat === fmt
                                    ? "bg-slate-800 text-white"
                                    : fmt === "pdf" && pdfDisabled
                                        ? "text-slate-300 cursor-not-allowed"
                                        : "text-slate-600 hover:bg-slate-50"
                                    }`}
                            >
                                {fmt === "csv" && <FileText className="w-3 h-3" />}
                                {fmt === "excel" && <FileSpreadsheet className="w-3 h-3" />}
                                {fmt === "pdf" && <FileBarChart2 className="w-3 h-3" />}
                                {fmt.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExport}
                        disabled={loading || filteredRecords.length === 0}
                        className="gap-1.5 h-8"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Descargar
                    </Button>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Search (right side) */}
                    {data.length > 0 && (
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 pr-7 py-1.5 text-sm border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Status filter */}
                    {data.length > 0 && uniqueStatuses.length > 0 && (
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        >
                            <option value="all">Todo</option>
                            {uniqueStatuses.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* ── Table ── */}
            <div
                className="flex-1 overflow-auto min-h-0 bg-white/60 backdrop-blur-md border border-white/80 rounded-2xl shadow-sm custom-scrollbar"
                onScroll={handleScroll}
            >
                <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-800/95 backdrop-blur-md text-white">
                            {["Fecha", "Hora", "Campaña", "Lista", "Desc. Lista", "Teléfono", "Identificador", "CallerID", "Disposición", "Estado", "DTMF", "Duración"].map(
                                (col) => (
                                    <th
                                        key={col}
                                        className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"
                                    >
                                        {col}
                                    </th>
                                )
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading && data.length === 0 ? (
                            <tr>
                                <td colSpan={11} className="text-center py-16">
                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        <span className="text-sm">
                                            {loadingProgress
                                                ? `Día ${loadingProgress.current} de ${loadingProgress.total}`
                                                : "Cargando datos..."}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={11} className="text-center py-20">
                                    <div className="flex flex-col items-center gap-2 text-slate-300">
                                        <FileBarChart2 className="w-10 h-10" />
                                        <p className="text-sm text-slate-400">
                                            Selecciona campañas y fechas, luego haz clic en <strong>Generar</strong>
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredRecords.length === 0 ? (
                            <tr>
                                <td colSpan={11} className="text-center py-10 text-sm text-slate-400">
                                    Sin resultados para los filtros aplicados
                                </td>
                            </tr>
                        ) : (
                            visibleRecords.map((r, i) => {
                                const status = getDisplayStatus(r);
                                return (
                                    <tr
                                        key={`${r.call_date}-${r.phone_number}-${i}`}
                                        className="hover:bg-blue-50/40 transition-colors"
                                    >
                                        <td className="px-3 py-1.5 font-mono text-xs text-slate-600 whitespace-nowrap">
                                            {formatToGlobalTimezone(r.call_date, timezone, 'yyyy-MM-dd')}
                                        </td>
                                        <td className="px-3 py-1.5 font-mono text-xs text-slate-600 whitespace-nowrap">
                                            {formatToGlobalTimezone(r.call_date, timezone, 'HH:mm:ss')}
                                        </td>
                                        <td className="px-3 py-1.5">
                                            <span className="inline-block bg-slate-100 text-slate-600 text-[10px] font-mono px-1.5 py-0.5 rounded">
                                                {r.campaign_id}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-xs text-slate-700 max-w-[120px] truncate">
                                            {r.list_name || "—"}
                                        </td>
                                        <td className="px-3 py-1.5 text-xs text-slate-500 max-w-[140px] truncate">
                                            {r.list_description || "—"}
                                        </td>
                                        <td className="px-3 py-1.5 font-mono text-xs text-slate-800 whitespace-nowrap">
                                            {r.phone_number}
                                        </td>
                                        <td className="px-3 py-1.5 font-mono text-xs text-slate-600 whitespace-nowrap">
                                            {r.vendor_lead_code || "—"}
                                        </td>
                                        <td className="px-3 py-1.5 font-mono text-xs text-slate-600 whitespace-nowrap">
                                            {r.caller_id || "—"}
                                        </td>
                                        <td className="px-3 py-1.5 text-sm text-slate-700 whitespace-nowrap">
                                            {r.typification_name || r.disposition || status.label || "—"}
                                        </td>
                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                            <span
                                                className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border ${status.color}`}
                                            >
                                                {status.label}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 font-mono text-xs text-slate-600">
                                            {r.dtmf_pressed || "—"}
                                        </td>
                                        <td className="px-3 py-1.5 font-mono text-xs text-slate-600">
                                            {r.length_in_sec !== undefined && r.length_in_sec !== null ? `${r.length_in_sec}s` : "—"}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── Footer ── */}
            {hasMore && (
                <div className="flex-shrink-0 text-center py-1.5 text-xs text-slate-400">
                    Mostrando {Math.min(displayedRecords, filteredRecords.length).toLocaleString()} de{" "}
                    {filteredRecords.length.toLocaleString()} · Desplázate para más
                </div>
            )}
        </div>
    );
}
