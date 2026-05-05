import { useEffect, useState } from "react";
import { Info, CheckCircle2, XCircle, PauseCircle, Activity, Cpu, Phone, PhoneIncoming, Trophy } from "lucide-react";
import { SectionHeader, SettingsCard } from "./SectionShell";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import api from "@/services/api";

interface CampaignSummary {
    id: string;
    name: string;
    campaign_type?: string;
    status: "active" | "paused" | "inactive";
    dialingMethod?: string;
    totalLeads?: number;
    activeAgents?: number;
    lastActivity?: string;
    autoDialLevel?: string;
    maxRetries?: number;
}

interface Props {
    campaign: CampaignSummary;
    outboundTrunkSummary?: string | null;
    scheduleTemplateName?: string | null;
    workspaceDailyTarget: number;
    setWorkspaceDailyTarget: (n: number) => void;
    workspaceGoalPeriodDays: number;
    setWorkspaceGoalPeriodDays: (n: number) => void;
    workspaceGoalTypificationId: number | null;
    setWorkspaceGoalTypificationId: (id: number | null) => void;
}

const TYPE_LABEL: Record<string, { label: string; icon: any; bg: string; text: string }> = {
    BLASTER: { label: "Blaster (IVR / Bot)", icon: Cpu, bg: "bg-fuchsia-50", text: "text-fuchsia-700" },
    INBOUND: { label: "Inbound (entrante)", icon: PhoneIncoming, bg: "bg-emerald-50", text: "text-emerald-700" },
    OUTBOUND: { label: "Outbound", icon: Phone, bg: "bg-blue-50", text: "text-blue-700" },
    OUTBOUND_PREDICTIVE: { label: "Outbound Predictiva", icon: Activity, bg: "bg-indigo-50", text: "text-indigo-700" },
};

const STATUS_LABEL: Record<string, { label: string; icon: any; cls: string }> = {
    active: { label: "Activa", icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    paused: { label: "Pausada", icon: PauseCircle, cls: "bg-amber-50 text-amber-700 border-amber-200" },
    inactive: { label: "Inactiva", icon: XCircle, cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

const TIP_ALL_VALUE = "__all__";

export function SectionGeneral({
    campaign,
    outboundTrunkSummary,
    scheduleTemplateName,
    workspaceDailyTarget,
    setWorkspaceDailyTarget,
    workspaceGoalPeriodDays,
    setWorkspaceGoalPeriodDays,
    workspaceGoalTypificationId,
    setWorkspaceGoalTypificationId,
}: Props) {
    const [typifications, setTypifications] = useState<{ id: number; name: string }[]>([]);

    useEffect(() => {
        let cancelled = false;
        api.getTypifications(campaign.id)
            .then((res: any) => {
                if (cancelled) return;
                const rows = Array.isArray(res?.data) ? res.data : [];
                setTypifications(
                    rows.map((t: { id: number; name: string }) => ({ id: t.id, name: t.name || `Tipificación #${t.id}` }))
                );
            })
            .catch(() => {
                if (!cancelled) setTypifications([]);
            });
        return () => { cancelled = true; };
    }, [campaign.id]);

    const type = TYPE_LABEL[campaign.campaign_type || "OUTBOUND"] || TYPE_LABEL.OUTBOUND;
    const TypeIcon = type.icon;
    const status = STATUS_LABEL[campaign.status] || STATUS_LABEL.inactive;
    const StatusIcon = status.icon;

    const items: { label: string; value: React.ReactNode }[] = [
        { label: "Identificador", value: <span className="font-mono text-slate-700">{campaign.id}</span> },
        { label: "Nombre", value: <span className="font-medium text-slate-800">{campaign.name}</span> },
        {
            label: "Tipo de campaña",
            value: (
                <span className={`inline-flex items-center gap-1.5 ${type.bg} ${type.text} text-xs font-medium px-2 py-1 rounded-md`}>
                    <TypeIcon className="w-3.5 h-3.5" />
                    {type.label}
                </span>
            ),
        },
        {
            label: "Estado",
            value: (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border ${status.cls}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    {status.label}
                </span>
            ),
        },
        ...(campaign.campaign_type !== "INBOUND" && campaign.dialingMethod
            ? [{ label: "Modo de marcado", value: <span className="text-slate-700">{campaign.dialingMethod}</span> }]
            : []),
        ...(campaign.campaign_type !== "INBOUND" && campaign.autoDialLevel
            ? [{ label: "Ratio actual", value: <span className="font-mono text-slate-700">{campaign.autoDialLevel}</span> }]
            : []),
        ...(campaign.campaign_type !== "INBOUND"
            ? [{ label: "Máx. intentos", value: <span className="font-mono text-slate-700">{campaign.maxRetries ?? 3}</span> }]
            : []),
        ...(campaign.campaign_type !== "INBOUND"
            ? [{ label: "Troncal saliente", value: <span className="text-slate-700">{outboundTrunkSummary || <span className="italic text-slate-400">Sin regla de enrutamiento</span>}</span> }]
            : []),
        ...(campaign.campaign_type !== "INBOUND"
            ? [{ label: "Horario asignado", value: <span className="text-slate-700">{scheduleTemplateName || <span className="italic text-slate-400">Sin restricción</span>}</span> }]
            : []),
        ...(campaign.lastActivity
            ? [{ label: "Última actividad", value: <span className="text-slate-700">{campaign.lastActivity}</span> }]
            : []),
    ];

    return (
        <>
            <SectionHeader
                icon={<Info className="w-5 h-5" />}
                iconBg="bg-slate-100"
                iconText="text-slate-700"
                title="General"
                description="Vista resumen de la campaña. Los datos editables están en sus secciones correspondientes (marcación, horario, troncal…)."
            />

            <SettingsCard>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    {items.map((it) => (
                        <div key={it.label} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                            <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{it.label}</dt>
                            <dd className="text-sm text-right">{it.value}</dd>
                        </div>
                    ))}
                </dl>

                <div className="mt-5 p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-900/80 leading-relaxed">
                    <p className="font-medium text-blue-900 mb-0.5">Acerca de los Ajustes</p>
                    <p>
                        Esta área agrupa la configuración completa de la campaña.
                        Cambia entre las secciones del menú lateral para ajustar marcación, reintentos, horario, tipificaciones, disposiciones, CallerID y grabación.
                        Los cambios se guardan por sección.
                    </p>
                </div>
            </SettingsCard>

            <SectionHeader
                icon={<Trophy className="w-5 h-5" />}
                iconBg="bg-amber-50"
                iconText="text-amber-700"
                title="Metas en el workspace del agente"
                description="Define el objetivo numérico, cuántos días hacia atrás se cuentan las tipificaciones y si solo cuentan resultados de una tipificación concreta en configuración de campaña."
            />

            <SettingsCard>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">Objetivo (cantidad)</p>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Meta numérica de tipificaciones que aplican la regla (1–100.000).
                        </p>
                        <Label htmlFor="workspaceDailyTargetSettings" className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider sr-only">
                            Objetivo
                        </Label>
                        <Input
                            id="workspaceDailyTargetSettings"
                            type="number"
                            min={1}
                            max={100000}
                            value={workspaceDailyTarget}
                            onChange={(e) => setWorkspaceDailyTarget(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            placeholder="20"
                            className="font-mono text-sm max-w-[140px] h-10 rounded-xl border-slate-200"
                        />
                    </div>

                    <div className="space-y-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">Ventana de conteo (días)</p>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Se cuentan tipificaciones desde hoy inclusive hacia atrás: 1 = solo hoy; 7 = últimos 7 días (1–366). Usa la fecha local del servidor de base de datos.
                        </p>
                        <Label htmlFor="workspaceGoalPeriodDays" className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider sr-only">
                            Días
                        </Label>
                        <Input
                            id="workspaceGoalPeriodDays"
                            type="number"
                            min={1}
                            max={366}
                            value={workspaceGoalPeriodDays}
                            onChange={(e) => setWorkspaceGoalPeriodDays(Math.max(1, Math.min(366, parseInt(e.target.value, 10) || 1)))}
                            className="font-mono text-sm max-w-[140px] h-10 rounded-xl border-slate-200"
                        />
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 space-y-2">
                    <p className="text-sm font-medium text-slate-800">¿Qué tipificaciones suman +1?</p>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                        Por defecto cuentan <span className="font-medium text-slate-700">todas</span> las tipificaciones registradas en resultados de llamada.
                        Si eliges una tipificación concreta (por nombre), solo esos resultados incrementan el progreso hacia la meta.
                    </p>
                    <Label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tipificación contable</Label>
                    <Select
                        value={workspaceGoalTypificationId == null ? TIP_ALL_VALUE : String(workspaceGoalTypificationId)}
                        onValueChange={(v) => {
                            if (v === TIP_ALL_VALUE) setWorkspaceGoalTypificationId(null);
                            else setWorkspaceGoalTypificationId(parseInt(v, 10));
                        }}
                    >
                        <SelectTrigger className="max-w-md h-10 rounded-xl border-slate-200">
                            <SelectValue placeholder="Todas las tipificaciones" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={TIP_ALL_VALUE}>Todas las tipificaciones</SelectItem>
                            {typifications.map((t) => (
                                <SelectItem key={t.id} value={String(t.id)}>
                                    {t.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </SettingsCard>
        </>
    );
}
