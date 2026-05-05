import { useMemo, useState } from "react";
import api from "@/services/api";
import { Button } from "../ui/button";
import {
    ArrowLeft,
    Coffee,
    Download,
    FileSpreadsheet,
    FileText,
    Loader2,
    FileBarChart2,
} from "lucide-react";
import { toast } from "sonner";
import { ReportFilters, ReportFiltersValue } from "./ReportFilters";
import { dispatchExport, ExportFormat } from "./exportHelpers";

interface PauseRow {
    agent_username: string;
    pause_code: string;
    pause_sessions: number;
    total_pause_sec: number;
}

interface Props {
    onBack: () => void;
}

const PAUSE_LABELS: Record<string, string> = {
    NOT_READY: "No disponible",
    PAUSED: "En pausa",
    BREAK: "Descanso",
    NOT_READY_BANO: "Pausa — Baño",
    NOT_READY_ALMUERZO: "Pausa — Almuerzo",
    NOT_READY_BACKOFFICE: "Pausa — Backoffice",
    NOT_READY_CAPACITACION: "Pausa — Capacitación",
};

function labelForPauseCode(code: string): string {
    return PAUSE_LABELS[code] || code.replace(/_/g, " ");
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

export function AgentPauseReport({ onBack }: Props) {
    const [data, setData] = useState<PauseRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
    const [lastFilters, setLastFilters] = useState<ReportFiltersValue | null>(null);

    const handleRun = async (filters: ReportFiltersValue) => {
        setLoading(true);
        setData([]);
        setLastFilters(filters);
        try {
            const res = await api.getAgentPauseSummary({
                campaigns: filters.campaigns,
                startDatetime: filters.startDatetime,
                endDatetime: filters.endDatetime,
            });
            if (res.success && res.data) {
                setData(res.data as PauseRow[]);
                toast.success(`${(res.data as PauseRow[]).length} fila(s)`);
            }
        } catch {
            toast.error("Error al cargar pausas por agente");
        } finally {
            setLoading(false);
        }
    };

    const totalsByAgent = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of data) {
            m.set(r.agent_username, (m.get(r.agent_username) || 0) + r.total_pause_sec);
        }
        return m;
    }, [data]);

    const buildExportRows = () =>
        data.map((r) => ({
            Agente: r.agent_username,
            "Tipo de pausa": labelForPauseCode(r.pause_code),
            Código: r.pause_code,
            Sesiones: r.pause_sessions,
            "Tiempo total (s)": r.total_pause_sec,
            "Tiempo (legible)": fmtSeconds(r.total_pause_sec),
        }));

    const handleExport = () => {
        const rows = buildExportRows();
        if (!rows.length) return toast.error("No hay datos");
        const subtitle = lastFilters
            ? `Rango: ${lastFilters.startDatetime} → ${lastFilters.endDatetime} · Campañas: ${lastFilters.campaigns.length} · Incluye pausas abiertas hasta fin de rango`
            : "";
        dispatchExport(
            exportFormat,
            rows,
            "pausas_por_agente",
            "Pausas por agente",
            subtitle,
        );
    };

    return (
        <div className="flex flex-col h-full gap-0">
            <div className="flex-shrink-0 flex items-center justify-between px-1 pb-3">
                <div className="flex items-center gap-2.5">
                    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 gap-1">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </Button>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-600 to-pink-600 flex items-center justify-center shadow-sm">
                        <Coffee className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900 leading-tight">Pausas por agente</h1>
                        <p className="text-xs text-slate-400 max-w-xl">
                            Tiempo en pausa desde el workspace (No disponible y pausas auxiliares). No incluye la
                            pantalla de PIN sin confirmar. Incluye pausas abiertas hasta el fin del rango; el tiempo
                            se acota al intervalo de fechas.
                        </p>
                    </div>
                </div>
                {data.length > 0 && (
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                        {data.length} fila{data.length !== 1 ? "s" : ""}
                    </span>
                )}
            </div>

            <ReportFilters
                loading={loading}
                onRun={handleRun}
                rightSlot={
                    data.length > 0 ? (
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
                    ) : null
                }
            />

            <div className="flex-1 overflow-auto min-h-0 bg-white/60 backdrop-blur-md border border-white/80 rounded-2xl shadow-sm custom-scrollbar">
                <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-800/95 backdrop-blur-md text-white">
                            {["Agente", "Tipo de pausa", "Sesiones", "Tiempo en pausa", "Total agente (rango)"].map(
                                (col) => (
                                    <th
                                        key={col}
                                        className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"
                                    >
                                        {col}
                                    </th>
                                ),
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="text-center py-16">
                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        <span className="text-sm">Cargando datos...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-20">
                                    <div className="flex flex-col items-center gap-2 text-slate-300">
                                        <Coffee className="w-10 h-10" />
                                        <p className="text-sm text-slate-400">
                                            Selecciona campañas y fechas, luego haz clic en <strong>Generar</strong>
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.map((r, idx) => {
                                const agentTotal = totalsByAgent.get(r.agent_username) || 0;
                                const firstOfAgent =
                                    idx === 0 || data[idx - 1].agent_username !== r.agent_username;
                                return (
                                    <tr
                                        key={`${r.agent_username}-${r.pause_code}-${idx}`}
                                        className="hover:bg-rose-50/30 transition-colors"
                                    >
                                        <td className="px-3 py-2 text-sm text-slate-800 font-medium">
                                            {firstOfAgent ? r.agent_username : ""}
                                        </td>
                                        <td className="px-3 py-2 text-slate-700">{labelForPauseCode(r.pause_code)}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-slate-700">
                                            {r.pause_sessions.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-xs text-rose-800">{fmtSeconds(r.total_pause_sec)}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-slate-600">
                                            {firstOfAgent ? fmtSeconds(agentTotal) : ""}
                                        </td>
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
