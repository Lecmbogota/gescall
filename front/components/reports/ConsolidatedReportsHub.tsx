import { useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import {
    FileBarChart2,
    Phone,
    BarChart3,
    PieChart,
    Clock,
    Sparkles,
    Coffee,
} from "lucide-react";
import { ConsolidatedReports } from "../ConsolidatedReports";
import { CampaignSummaryReport } from "./CampaignSummaryReport";
import { DispositionSummaryReport } from "./DispositionSummaryReport";
import { TemporalDistributionReport } from "./TemporalDistributionReport";
import { AgentPauseReport } from "./AgentPauseReport";
import { CustomReportsList } from "./CustomReportsList";
import { CustomReportRunner } from "./CustomReportRunner";
import type { ReportTemplate } from "./CustomReportBuilder";

type SystemReportId =
    | "call_detail"
    | "campaign_summary"
    | "disposition"
    | "temporal"
    | "agent_pauses";

interface SystemReportDef {
    id: SystemReportId;
    title: string;
    description: string;
    icon: React.ElementType;
    iconBg: string;
    iconText: string;
    cardAccent: string;
}

const SYSTEM_REPORTS: SystemReportDef[] = [
    {
        id: "call_detail",
        title: "Detalle consolidado de llamadas",
        description: "Cada interacción del periodo con teléfono, lista, estado, DTMF y duración. Multi-campaña.",
        icon: Phone,
        iconBg: "from-blue-600 to-indigo-600",
        iconText: "text-white",
        cardAccent: "from-blue-50 to-indigo-50",
    },
    {
        id: "campaign_summary",
        title: "Resumen por campaña",
        description: "KPIs agregados por campaña: total de llamadas, contactadas, ventas, drops y tiempo de habla.",
        icon: BarChart3,
        iconBg: "from-emerald-600 to-teal-600",
        iconText: "text-white",
        cardAccent: "from-emerald-50 to-teal-50",
    },
    {
        id: "disposition",
        title: "Reporte por disposición",
        description: "Distribución de estados/disposiciones, conteo, porcentaje y duración media.",
        icon: PieChart,
        iconBg: "from-violet-600 to-fuchsia-600",
        iconText: "text-white",
        cardAccent: "from-violet-50 to-fuchsia-50",
    },
    {
        id: "temporal",
        title: "Distribución temporal",
        description: "Volumen de llamadas por hora del día, día de la semana o calendario.",
        icon: Clock,
        iconBg: "from-amber-500 to-orange-600",
        iconText: "text-white",
        cardAccent: "from-amber-50 to-orange-50",
    },
    {
        id: "agent_pauses",
        title: "Pausas por agente",
        description: "Tiempo y sesiones en pausa del workspace por agente y tipo (No disponible, Baño, Almuerzo, etc.).",
        icon: Coffee,
        iconBg: "from-rose-600 to-pink-600",
        iconText: "text-white",
        cardAccent: "from-rose-50 to-pink-50",
    },
];

type HubView =
    | { kind: "hub" }
    | { kind: "system"; reportId: SystemReportId }
    | { kind: "template"; template: ReportTemplate };

export function ConsolidatedReportsHub() {
    const { hasRolePermission } = useAuthStore();
    const canViewReports = hasRolePermission("view_reports");

    const [view, setView] = useState<HubView>({ kind: "hub" });
    const [activeTab, setActiveTab] = useState<"system" | "custom">("system");

    if (!canViewReports) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
                <FileBarChart2 className="w-12 h-12 text-slate-300" />
                <p className="text-sm">No tienes permiso para ver reportes</p>
            </div>
        );
    }

    if (view.kind === "system") {
        const back = () => setView({ kind: "hub" });
        switch (view.reportId) {
            case "call_detail":
                return <ConsolidatedReports onBack={back} />;
            case "campaign_summary":
                return <CampaignSummaryReport onBack={back} />;
            case "disposition":
                return <DispositionSummaryReport onBack={back} />;
            case "temporal":
                return <TemporalDistributionReport onBack={back} />;
            case "agent_pauses":
                return <AgentPauseReport onBack={back} />;
        }
    }

    if (view.kind === "template") {
        return (
            <CustomReportRunner
                template={view.template}
                onBack={() => setView({ kind: "hub" })}
            />
        );
    }

    return (
        <div className="flex flex-col h-full gap-0">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-1 pb-4">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-sm">
                        <FileBarChart2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-slate-900 leading-tight">Reportes</h1>
                    </div>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "system" | "custom")} className="flex-1 flex flex-col min-h-0">
                <TabsList className="flex-shrink-0 mb-4 self-start">
                    <TabsTrigger value="system" className="gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" /> Reportes del sistema
                    </TabsTrigger>
                    <TabsTrigger value="custom" className="gap-1.5">
                        <FileBarChart2 className="w-3.5 h-3.5" /> Personalizados
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="system" className="flex-1 min-h-0 overflow-auto custom-scrollbar mt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-2">
                        {SYSTEM_REPORTS.map((r) => {
                            const Icon = r.icon;
                            return (
                                <button
                                    key={r.id}
                                    onClick={() => setView({ kind: "system", reportId: r.id })}
                                    className="group bg-white/80 backdrop-blur border border-white rounded-2xl shadow-sm p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all"
                                >
                                    <div className={`absolute inset-0 bg-gradient-to-br ${r.cardAccent} opacity-0 group-hover:opacity-30 rounded-2xl pointer-events-none transition-opacity`} />
                                    <div className="flex items-start gap-3">
                                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${r.iconBg} flex items-center justify-center shadow-sm flex-shrink-0`}>
                                            <Icon className={`w-5 h-5 ${r.iconText}`} />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-semibold text-slate-900 text-base leading-tight group-hover:text-blue-700 transition-colors">
                                                {r.title}
                                            </h3>
                                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.description}</p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </TabsContent>

                <TabsContent value="custom" className="flex-1 min-h-0 mt-0">
                    <CustomReportsList onRun={(tpl) => setView({ kind: "template", template: tpl })} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
