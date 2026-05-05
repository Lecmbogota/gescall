import { useState, useEffect } from "react";
import api from "@/services/api";
import { Button } from "../ui/button";
import { ArrowLeft, Clock, Download, FileSpreadsheet, FileText, Loader2, FileBarChart2 } from "lucide-react";
import { toast } from "sonner";
import { ReportFilters, ReportFiltersValue } from "./ReportFilters";
import { dispatchExport, ExportFormat } from "./exportHelpers";

type Granularity = "hour" | "hour_of_day" | "day" | "day_of_week";

interface TemporalRow {
    bucket: string;
    total_calls: number;
    answered: number;
    total_duration_sec: number;
}

interface Props {
    onBack: () => void;
}

const DOW_LABELS: Record<string, string> = {
    "1": "Lunes",
    "2": "Martes",
    "3": "Miércoles",
    "4": "Jueves",
    "5": "Viernes",
    "6": "Sábado",
    "7": "Domingo",
};

export function TemporalDistributionReport({ onBack }: Props) {
    const [granularity, setGranularity] = useState<Granularity>("hour_of_day");
    const [data, setData] = useState<TemporalRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
    const [lastFilters, setLastFilters] = useState<ReportFiltersValue | null>(null);

    const handleRun = async (filters: ReportFiltersValue) => {
        setLoading(true);
        setData([]);
        setLastFilters(filters);
        try {
            const res = await api.getTemporalDistribution({
                campaigns: filters.campaigns,
                startDatetime: filters.startDatetime,
                endDatetime: filters.endDatetime,
                granularity,
            });
            if (res.success && res.data) {
                setData(res.data);
                toast.success(`${res.data.length} bucket(s) encontrados`);
            }
        } catch {
            toast.error("Error al cargar el reporte");
        } finally {
            setLoading(false);
        }
    };

    const labelFor = (bucket: string): string => {
        if (granularity === "hour_of_day") return `${bucket}:00`;
        if (granularity === "day_of_week") return DOW_LABELS[bucket] || bucket;
        return bucket;
    };

    const maxCalls = Math.max(1, ...data.map((d) => d.total_calls));

    /** Al cambiar la agrupación, los datos anteriores dejan de ser válidos */
    useEffect(() => {
        setData([]);
    }, [granularity]);

    const buildExportRows = () =>
        data.map((r) => ({
            Bucket: labelFor(r.bucket),
            "Total llamadas": r.total_calls,
            "Contestadas": r.answered,
            "% Contacto": r.total_calls > 0 ? `${((r.answered / r.total_calls) * 100).toFixed(2)}%` : "0%",
            "Duración total (s)": r.total_duration_sec,
        }));

    const handleExport = () => {
        const rows = buildExportRows();
        if (!rows.length) return toast.error("No hay datos");
        const subtitle = lastFilters
            ? `Rango: ${lastFilters.startDatetime} → ${lastFilters.endDatetime} · Campañas: ${lastFilters.campaigns.length} · Granularidad: ${granularity}`
            : "";
        dispatchExport(exportFormat, rows, "distribucion_temporal", "Distribución temporal", subtitle);
    };

    return (
        <div className="flex flex-col h-full gap-0">
            <div className="flex-shrink-0 flex items-center justify-between px-1 pb-3">
                <div className="flex items-center gap-2.5">
                    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 gap-1">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </Button>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm">
                        <Clock className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900 leading-tight">Distribución temporal</h1>
                        <p className="text-xs text-slate-400">
                            Volumen de llamadas por franja. Solo aparecen franjas con al menos una llamada.
                            <span className="text-slate-500"> Contestada = ANSWER o SALE.</span>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg overflow-hidden">
                    {([
                        { id: "hour_of_day" as Granularity, label: "Hora del día" },
                        { id: "hour" as Granularity, label: "Por hora" },
                        { id: "day" as Granularity, label: "Por día" },
                        { id: "day_of_week" as Granularity, label: "Día semana" },
                    ]).map((g) => (
                        <button
                            key={g.id}
                            onClick={() => setGranularity(g.id)}
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${granularity === g.id ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                        >
                            {g.label}
                        </button>
                    ))}
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
                        <Clock className="w-10 h-10" />
                        <p className="text-sm text-slate-400">Selecciona filtros y haz clic en <strong>Generar</strong></p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Leyenda — misma lógica que el backend (ANSWER + SALE) */}
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                            <span className="font-medium text-slate-700">Leyenda</span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500 shrink-0" aria-hidden />
                                <span><strong className="text-slate-800">Contestadas</strong> (ANSWER / SALE)</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 rounded-sm bg-slate-300 shrink-0" aria-hidden />
                                <span><strong className="text-slate-800">Resto</strong> (no contestadas u otro estado)</span>
                            </span>
                            <span className="text-slate-500 border-l border-slate-200 pl-4 ml-0 sm:ml-1">
                                La barra se escala al máximo del periodo ({maxCalls.toLocaleString()} llamadas en una franja)
                            </span>
                        </div>

                        <div className="space-y-2.5">
                            {data.map((r) => {
                                const widthPct = (r.total_calls / maxCalls) * 100;
                                const notAnswered = Math.max(0, r.total_calls - r.answered);
                                const answeredPct = r.total_calls > 0 ? (r.answered / r.total_calls) * 100 : 0;
                                const flexA = Math.max(0, r.answered);
                                const flexB = Math.max(0, notAnswered);

                                return (
                                    <div key={r.bucket} className="flex items-center gap-3 gap-y-1 flex-wrap sm:flex-nowrap">
                                        <div className="w-[5.5rem] sm:w-28 text-xs font-mono text-slate-700 flex-shrink-0 text-right tabular-nums">
                                            {labelFor(r.bucket)}
                                        </div>
                                        {/* Pista gris = 100% del ancho comparativo; dentro, barra proporcional al total vs máximo */}
                                        <div className="flex-1 min-w-[140px] h-7 bg-slate-100 rounded-lg overflow-hidden relative">
                                            <div
                                                className="absolute left-0 top-0 bottom-0 flex rounded-md overflow-hidden shadow-inner"
                                                style={{ width: `${widthPct}%`, minWidth: r.total_calls > 0 ? "4px" : 0 }}
                                            >
                                                <div
                                                    className="h-full bg-emerald-500 transition-all"
                                                    style={{ flex: flexA }}
                                                    title={`Contestadas: ${r.answered}`}
                                                />
                                                <div
                                                    className="h-full bg-slate-300 transition-all"
                                                    style={{ flex: flexB }}
                                                    title={`Resto: ${notAnswered}`}
                                                />
                                            </div>
                                        </div>
                                        <div className="w-full sm:w-auto sm:min-w-[12.5rem] text-left sm:text-right text-[11px] text-slate-600 tabular-nums leading-snug">
                                            <span className="font-semibold text-slate-900">{r.total_calls.toLocaleString()}</span>
                                            {" "}llamadas
                                            <span className="text-slate-400 mx-1">·</span>
                                            <span className="text-emerald-700 font-medium">{r.answered.toLocaleString()}</span>
                                            {" "}contestadas
                                            <span className="text-slate-400 mx-1">·</span>
                                            <span className="font-mono text-slate-800">{answeredPct.toFixed(0)}% contacto</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
