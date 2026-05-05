import { Info, CheckCircle2, XCircle, PauseCircle, Activity, Cpu, Phone, PhoneIncoming } from "lucide-react";
import { SectionHeader, SettingsCard } from "./SectionShell";

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

export function SectionGeneral({ campaign, outboundTrunkSummary, scheduleTemplateName }: Props) {
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
        </>
    );
}
