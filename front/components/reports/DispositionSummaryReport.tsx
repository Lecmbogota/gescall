import { useState } from "react";
import api from "@/services/api";
import { Button } from "../ui/button";
import { ArrowLeft, PieChart, Download, FileSpreadsheet, FileText, Loader2, FileBarChart2 } from "lucide-react";
import { toast } from "sonner";
import { ReportFilters, ReportFiltersValue } from "./ReportFilters";
import { dispatchExport, ExportFormat } from "./exportHelpers";

interface DispositionRow {
    status: string;
    total_calls: number;
    total_duration_sec: number;
    avg_duration_sec: number;
    percentage: number;
}

interface Props {
    onBack: () => void;
}

const STATUS_COLORS: Record<string, string> = {
    ANSWER: "bg-emerald-500",
    SALE: "bg-blue-500",
    DROP: "bg-rose-500",
    NA: "bg-amber-500",
    NOANSWER: "bg-slate-400",
    BUSY: "bg-orange-500",
    CANCEL: "bg-stone-400",
    DNC: "bg-red-700",
    TIMEOUT: "bg-purple-500",
    FAIL: "bg-rose-700",
    UNKNOWN: "bg-slate-300",
};

export function DispositionSummaryReport({ onBack }: Props) {
    const [data, setData] = useState<DispositionRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
    const [lastFilters, setLastFilters] = useState<ReportFiltersValue | null>(null);

    const handleRun = async (filters: ReportFiltersValue) => {
        setLoading(true);
        setData([]);
        setLastFilters(filters);
        try {
            const res = await api.getDispositionSummary({
                campaigns: filters.campaigns,
                startDatetime: filters.startDatetime,
                endDatetime: filters.endDatetime,
            });
            if (res.success && res.data) {
                setData(res.data);
                toast.success(`${res.data.length} estado(s) encontrados`);
            }
        } catch {
            toast.error("Error al cargar el reporte");
        } finally {
            setLoading(false);
        }
    };

    const buildExportRows = () =>
        data.map((r) => ({
            Estado: r.status,
            "Total llamadas": r.total_calls,
            "Porcentaje": `${r.percentage.toFixed(2)}%`,
            "Duración total (s)": r.total_duration_sec,
            "Duración promedio (s)": r.avg_duration_sec,
        }));

    const handleExport = () => {
        const rows = buildExportRows();
        if (!rows.length) return toast.error("No hay datos");
        const subtitle = lastFilters
            ? `Rango: ${lastFilters.startDatetime} → ${lastFilters.endDatetime} · Campañas: ${lastFilters.campaigns.length}`
            : "";
        dispatchExport(exportFormat, rows, "reporte_por_disposicion", "Reporte por disposición", subtitle);
    };

    return (
        <div className="flex flex-col h-full gap-0">
            <div className="flex-shrink-0 flex items-center justify-between px-1 pb-3">
                <div className="flex items-center gap-2.5">
                    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 gap-1">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </Button>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-sm">
                        <PieChart className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900 leading-tight">Reporte por disposición</h1>
                        <p className="text-xs text-slate-400">Conteo y duración por estado de llamada</p>
                    </div>
                </div>
            </div>

            <ReportFilters
                loading={loading}
                onRun={handleRun}
                rightSlot={data.length > 0 ? (
                    <div className="flex items-center gap-2">
                        <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                            {(["csv", "excel", "pdf"] as ExportFormat[]).map((fmt) => (
                                <button
                                    key={fmt}
                                    onClick={() => setExportFormat(fmt)}
                                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${exportFormat === fmt ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                                >
                                    {fmt === "csv" && <FileText className="w-3 h-3" />}
                                    {fmt === "excel" && <FileSpreadsheet className="w-3 h-3" />}
                                    {fmt === "pdf" && <FileBarChart2 className="w-3 h-3" />}
                                    {fmt.toUpperCase()}
                                </button>
                            ))}
                        </div>
                        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 h-8">
                            <Download className="w-3.5 h-3.5" /> Descargar
                        </Button>
                    </div>
                ) : null}
            />

            <div className="flex-1 overflow-auto min-h-0 bg-white/60 backdrop-blur-md border border-white/80 rounded-2xl shadow-sm custom-scrollbar p-4">
                {loading ? (
                    <div className="h-full flex items-center justify-center text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando...
                    </div>
                ) : data.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-300">
                        <PieChart className="w-10 h-10" />
                        <p className="text-sm text-slate-400">Selecciona filtros y haz clic en <strong>Generar</strong></p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {data.map((r) => (
                            <div key={r.status} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_COLORS[r.status] || "bg-slate-300"}`} />
                                        <span className="font-medium text-slate-800 text-sm">{r.status}</span>
                                        <span className="text-xs text-slate-400">{r.total_calls.toLocaleString()} llamadas</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                        <span>Prom: <span className="font-mono text-slate-700">{r.avg_duration_sec}s</span></span>
                                        <span>Total: <span className="font-mono text-slate-700">{r.total_duration_sec}s</span></span>
                                        <span className="font-mono font-semibold text-slate-900 min-w-[55px] text-right">
                                            {r.percentage.toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${STATUS_COLORS[r.status] || "bg-slate-300"} transition-all`}
                                        style={{ width: `${Math.min(100, r.percentage)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
