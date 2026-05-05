import { useState } from "react";
import api from "@/services/api";
import { Button } from "../ui/button";
import { ArrowLeft, BarChart3, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ReportFilters, ReportFiltersValue } from "./ReportFilters";
import { dispatchExport, ExportFormat } from "./exportHelpers";

interface CampaignStat {
    campaign_id: string;
    campaign_name: string;
    total_calls: number;
    answered_calls: number;
    total_sales: number;
    total_drops: number;
    total_talk_time_sec: number;
}

interface Props {
    onBack: () => void;
}

function fmtSeconds(sec: number): string {
    const s = Number(sec) || 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}h ${m}m ${r}s`;
    if (m > 0) return `${m}m ${r}s`;
    return `${r}s`;
}

export function CampaignSummaryReport({ onBack }: Props) {
    const [data, setData] = useState<CampaignStat[]>([]);
    const [loading, setLoading] = useState(false);
    const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
    const [lastFilters, setLastFilters] = useState<ReportFiltersValue | null>(null);

    const handleRun = async (filters: ReportFiltersValue) => {
        setLoading(true);
        setData([]);
        setLastFilters(filters);
        try {
            const res = await api.getConsolidatedStats(filters.campaigns, filters.startDatetime, filters.endDatetime);
            if (res.success && res.data) {
                setData(res.data);
                toast.success(`${res.data.length} campaña(s)`);
            }
        } catch {
            toast.error("Error al cargar estadísticas");
        } finally {
            setLoading(false);
        }
    };

    const buildExportRows = () =>
        data.map((r) => ({
            "ID Campaña": r.campaign_id,
            Campaña: r.campaign_name,
            "Total llamadas": r.total_calls,
            Contestadas: r.answered_calls,
            "% Contacto": r.total_calls > 0 ? `${((r.answered_calls / r.total_calls) * 100).toFixed(2)}%` : "0%",
            Ventas: r.total_sales,
            Drops: r.total_drops,
            "Tiempo de habla (s)": r.total_talk_time_sec,
        }));

    const handleExport = () => {
        const rows = buildExportRows();
        if (!rows.length) return toast.error("No hay datos");
        const subtitle = lastFilters
            ? `Rango: ${lastFilters.startDatetime} → ${lastFilters.endDatetime} · Campañas: ${lastFilters.campaigns.length} · Filas: ${rows.length}`
            : "";
        dispatchExport(exportFormat, rows, "resumen_por_campana", "Resumen por campaña", subtitle);
    };

    return (
        <div className="flex flex-col h-full gap-0">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-1 pb-3">
                <div className="flex items-center gap-2.5">
                    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 gap-1">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </Button>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shadow-sm">
                        <BarChart3 className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900 leading-tight">Resumen por campaña</h1>
                        <p className="text-xs text-slate-400">KPIs agregados · Llamadas, contacto, ventas y drops</p>
                    </div>
                </div>
                {data.length > 0 && (
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                        {data.length} campaña{data.length !== 1 ? "s" : ""}
                    </span>
                )}
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
                                    {fmt === "pdf" && <BarChart3 className="w-3 h-3" />}
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

            {/* Tabla */}
            <div className="flex-1 overflow-auto min-h-0 bg-white/60 backdrop-blur-md border border-white/80 rounded-2xl shadow-sm custom-scrollbar">
                <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-800/95 backdrop-blur-md text-white">
                            {["Campaña", "ID", "Total", "Contestadas", "% Contacto", "Ventas", "Drops", "Tiempo de habla"].map((col) => (
                                <th key={col} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={8} className="text-center py-16">
                                <div className="flex flex-col items-center gap-2 text-slate-400">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                    <span className="text-sm">Cargando datos...</span>
                                </div>
                            </td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={8} className="text-center py-20">
                                <div className="flex flex-col items-center gap-2 text-slate-300">
                                    <BarChart3 className="w-10 h-10" />
                                    <p className="text-sm text-slate-400">Selecciona campañas y fechas, luego haz clic en <strong>Generar</strong></p>
                                </div>
                            </td></tr>
                        ) : (
                            data.map((r) => {
                                const pct = r.total_calls > 0 ? (r.answered_calls / r.total_calls) * 100 : 0;
                                return (
                                    <tr key={r.campaign_id} className="hover:bg-blue-50/40 transition-colors">
                                        <td className="px-3 py-2 text-sm text-slate-800 font-medium">{r.campaign_name}</td>
                                        <td className="px-3 py-2"><span className="inline-block bg-slate-100 text-slate-600 text-[10px] font-mono px-1.5 py-0.5 rounded">{r.campaign_id}</span></td>
                                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{r.total_calls.toLocaleString()}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{r.answered_calls.toLocaleString()}</td>
                                        <td className="px-3 py-2 font-mono text-xs">
                                            <span className={pct > 50 ? "text-emerald-700" : pct > 20 ? "text-amber-600" : "text-rose-600"}>
                                                {pct.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-xs text-emerald-700">{r.total_sales.toLocaleString()}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-rose-700">{r.total_drops.toLocaleString()}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-slate-600">{fmtSeconds(r.total_talk_time_sec)}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
