import { useState, useEffect, useMemo } from "react";
import api from "@/services/api";
import { useSettingsStore } from "@/stores/settingsStore";
import { formatToGlobalTimezone } from "@/lib/dateUtils";
import { Button } from "../ui/button";
import {
    ArrowLeft,
    Download,
    FileBarChart2,
    FileSpreadsheet,
    FileText,
    Loader2,
    Play,
    Search,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { ReportFilters, ReportFiltersValue } from "./ReportFilters";
import { dispatchExport, ExportFormat } from "./exportHelpers";
import { ReportTemplate } from "./CustomReportBuilder";

interface ColumnMeta { id: string; label: string }

interface Props {
    template: ReportTemplate;
    onBack: () => void;
}

export function CustomReportRunner({ template, onBack }: Props) {
    const timezone = useSettingsStore((state) => state.timezone);
    const [data, setData] = useState<Record<string, any>[]>([]);
    const [columns, setColumns] = useState<ColumnMeta[]>([]);
    const [loading, setLoading] = useState(false);
    const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
    const [searchTerm, setSearchTerm] = useState("");
    const [displayedRecords, setDisplayedRecords] = useState(200);
    const [lastFilters, setLastFilters] = useState<ReportFiltersValue | null>(null);

    const isSingle = template.scope === "single_campaign";
    const initialCampaigns = useMemo(
        () => template.definition?.campaigns ?? [],
        [template.definition]
    );

    const handleRun = async (filters: ReportFiltersValue) => {
        setLoading(true);
        setData([]);
        setColumns([]);
        setDisplayedRecords(200);
        setLastFilters(filters);
        try {
            const res = await api.runReportTemplate(template.id!, {
                campaigns: filters.campaigns,
                startDatetime: filters.startDatetime,
                endDatetime: filters.endDatetime,
            });
            if (res.success && res.data) {
                setData(res.data);
                if (res.meta?.columns) setColumns(res.meta.columns);
                toast.success(`${res.data.length.toLocaleString()} registros`);
            } else {
                toast.error(res.error || "Error al ejecutar el reporte");
            }
        } catch (e: any) {
            toast.error(e?.message || "Error al ejecutar el reporte");
        } finally {
            setLoading(false);
        }
    };

    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        const q = searchTerm.toLowerCase();
        return data.filter((row) =>
            Object.values(row).some((v) => v != null && String(v).toLowerCase().includes(q))
        );
    }, [data, searchTerm]);

    const visible = filteredData.slice(0, displayedRecords);
    const hasMore = displayedRecords < filteredData.length;

    useEffect(() => { setDisplayedRecords(200); }, [searchTerm]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const t = e.target as HTMLDivElement;
        if (t.scrollHeight - t.scrollTop <= t.clientHeight + 150 && hasMore && !loading) {
            setDisplayedRecords((prev) => prev + 200);
        }
    };

    const formatCellValue = (colId: string, value: any): string => {
        if (value == null) return "";
        if (colId === "call_date" || colId === "last_call_time") {
            try {
                return formatToGlobalTimezone(value, timezone, "yyyy-MM-dd HH:mm:ss");
            } catch { return String(value); }
        }
        return String(value);
    };

    const buildExportRows = () =>
        filteredData.map((row) => {
            const out: Record<string, any> = {};
            for (const col of columns) {
                out[col.label] = formatCellValue(col.id, row[col.id]);
            }
            return out;
        });

    const handleExport = () => {
        const rows = buildExportRows();
        if (!rows.length) return toast.error("No hay datos");
        const subtitle = lastFilters
            ? `Plantilla: ${template.name} · Rango: ${lastFilters.startDatetime} → ${lastFilters.endDatetime}`
            : `Plantilla: ${template.name}`;
        const fileBase = `reporte_${template.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
        dispatchExport(exportFormat, rows, fileBase, template.name, subtitle);
    };

    return (
        <div className="flex flex-col h-full gap-0">
            <div className="flex-shrink-0 flex items-center justify-between px-1 pb-3">
                <div className="flex items-center gap-2.5">
                    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 gap-1">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </Button>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-sm">
                        <Play className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900 leading-tight">{template.name}</h1>
                        <p className="text-xs text-slate-400">
                            {template.description || `Plantilla ${isSingle ? "de una campaña" : "multi-campaña"}`}
                            {template.owner_username && ` · Autor: ${template.owner_username}`}
                        </p>
                    </div>
                </div>
                {data.length > 0 && (
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                        {filteredData.length.toLocaleString()} registros
                    </span>
                )}
            </div>

            <ReportFilters
                singleCampaign={isSingle}
                loading={loading}
                onRun={handleRun}
                initialCampaigns={initialCampaigns}
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
                    </div>
                ) : null}
            />

            <div
                className="flex-1 overflow-auto min-h-0 bg-white/60 backdrop-blur-md border border-white/80 rounded-2xl shadow-sm custom-scrollbar"
                onScroll={handleScroll}
            >
                <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-800/95 backdrop-blur-md text-white">
                            {columns.map((col) => (
                                <th key={col.id} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={Math.max(columns.length, 1)} className="text-center py-16">
                                <div className="flex flex-col items-center gap-2 text-slate-400">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                    <span className="text-sm">Ejecutando plantilla...</span>
                                </div>
                            </td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={Math.max(columns.length, 1)} className="text-center py-20">
                                <div className="flex flex-col items-center gap-2 text-slate-300">
                                    <Play className="w-10 h-10" />
                                    <p className="text-sm text-slate-400">Selecciona campañas y fechas, luego haz clic en <strong>Generar</strong></p>
                                </div>
                            </td></tr>
                        ) : filteredData.length === 0 ? (
                            <tr><td colSpan={Math.max(columns.length, 1)} className="text-center py-10 text-sm text-slate-400">
                                Sin resultados para los filtros aplicados
                            </td></tr>
                        ) : (
                            visible.map((row, i) => (
                                <tr key={i} className="hover:bg-blue-50/40 transition-colors">
                                    {columns.map((col) => (
                                        <td key={col.id} className="px-3 py-1.5 text-xs text-slate-700 font-mono whitespace-nowrap">
                                            {formatCellValue(col.id, row[col.id])}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {hasMore && (
                <div className="flex-shrink-0 text-center py-1.5 text-xs text-slate-400">
                    Mostrando {Math.min(displayedRecords, filteredData.length).toLocaleString()} de{" "}
                    {filteredData.length.toLocaleString()} · Desplázate para más
                </div>
            )}
        </div>
    );
}
