import React, { useMemo, useState } from "react";
import {
    Activity, ChevronDown, Clock, Info, ListChecks, Loader2, Mic, Phone, Repeat, Save, Tags, WandSparkles, Zap,
} from "lucide-react";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SectionGeneral } from "./SectionGeneral";
import { SectionDialing } from "./SectionDialing";
import { SectionRetries, RetryGroupsState } from "./SectionRetries";
import { SectionSchedule, ScheduleTemplateLite } from "./SectionSchedule";
import { SectionTypifications } from "./SectionTypifications";
import { SectionDispositions } from "./SectionDispositions";
import { SectionCallerId } from "./SectionCallerId";
import { SectionRecording } from "./SectionRecording";
import { SectionTeleprompter } from "./SectionTeleprompter";
import { PauseSettingsState, SectionPauses } from "./SectionPauses";

export type CampaignSettingsSectionId =
    | "general"
    | "dialing"
    | "retries"
    | "schedule"
    | "typifications"
    | "dispositions"
    | "callerid"
    | "recording"
    | "teleprompter"
    | "pauses";

interface SectionDef {
    id: CampaignSettingsSectionId;
    label: string;
    description: string;
    icon: React.ElementType;
    iconColor: string; // text-* utility for the bullet
}

const ALL_SECTIONS: SectionDef[] = [
    { id: "general",       label: "General",          description: "Resumen y configuración general",            icon: Info,        iconColor: "text-slate-500" },
    { id: "dialing",       label: "Marcación",        description: "Ratio de marcación y predictivo",             icon: Zap,         iconColor: "text-blue-500" },
    { id: "retries",       label: "Reintentos",       description: "Intentos máx. y enfriamiento",                icon: Repeat,      iconColor: "text-purple-500" },
    { id: "schedule",      label: "Horario",          description: "Ventanas de discado",                         icon: Clock,       iconColor: "text-amber-500" },
    { id: "typifications", label: "Tipificaciones",   description: "Resultados y formularios",                    icon: Tags,        iconColor: "text-rose-500" },
    { id: "dispositions",  label: "Disposiciones",    description: "Catálogo de resultados",                      icon: ListChecks,  iconColor: "text-cyan-500" },
    { id: "callerid",      label: "CallerID",         description: "Local Presence",                              icon: Phone,       iconColor: "text-slate-500" },
    { id: "recording",     label: "Grabación",        description: "Grabación y almacenamiento",                  icon: Mic,         iconColor: "text-red-500" },
    { id: "teleprompter",  label: "Teleprompter",     description: "Guion para agentes",                          icon: WandSparkles, iconColor: "text-amber-500" },
    { id: "pauses",        label: "Pausas",           description: "Pausas permitidas y duración",                icon: Clock,       iconColor: "text-rose-500" },
];

function sectionsForType(type?: string): CampaignSettingsSectionId[] {
    if (type === "INBOUND") {
        return ["general", "typifications", "dispositions", "recording", "teleprompter", "pauses"];
    }
    if (type === "BLASTER") {
        // En BLASTER no hay agentes ni CallerID rotativo personalizado
        return ["general", "dialing", "retries", "schedule", "typifications", "dispositions", "recording"];
    }
    if (type === "OUTBOUND_PROGRESSIVE" || type === "OUTBOUND_PREDICTIVE") {
        return ["general", "dialing", "retries", "schedule", "typifications", "dispositions", "callerid", "recording", "teleprompter", "pauses"];
    }
    return ["general", "dialing", "retries", "schedule", "typifications", "dispositions", "callerid", "recording", "teleprompter"];
}

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

export interface CampaignSettingsTabProps {
    campaign: CampaignSummary;

    /* General — troncal efectiva (resuelta por módulo Enrutamiento) */
    outboundTrunkSummary?: string | null;

    /** Meta diaria de tipificaciones (widget del workspace del agente) */
    workspaceDailyTarget: number;
    setWorkspaceDailyTarget: (n: number) => void;
    workspaceGoalPeriodDays: number;
    setWorkspaceGoalPeriodDays: (n: number) => void;
    workspaceGoalTypificationId: number | null;
    setWorkspaceGoalTypificationId: (id: number | null) => void;

    /* General/Marcación */
    dialLevel: string;
    setDialLevel: (v: string) => void;
    cpsAvailability: { total_cps: number; used_cps: number; available_cps: number } | null;

    /* Predictivo */
    predTargetDropRate: number;
    setPredTargetDropRate: (v: number) => void;
    predMinFactor: number;
    setPredMinFactor: (v: number) => void;
    predMaxFactor: number;
    setPredMaxFactor: (v: number) => void;
    amdEnabled: boolean;
    setAmdEnabled: (v: boolean) => void;

    /* Reintentos */
    maxRetries: number;
    setMaxRetries: (n: number) => void;
    retryGroups: RetryGroupsState;
    setRetryGroups: (g: RetryGroupsState) => void;

    /* Horario */
    scheduleTemplates: ScheduleTemplateLite[];
    scheduleTemplateId: number | null;
    setScheduleTemplateId: (id: number | null) => void;
    loadingScheduleTemplates: boolean;
    savingScheduleTemplate: boolean;
    scheduleTemplateDirty: boolean;
    onSaveScheduleTemplate: () => void;

    /* Save general (dial + retries + predictive) */
    hasConfigChanges: boolean;
    savingGeneral: boolean;
    onSaveGeneralSettings: () => void;

    /* Recording */
    recordingEnabled: boolean;
    setRecordingEnabled: (v: boolean) => void;
    recordingStorage: string;
    setRecordingStorage: (v: string) => void;
    recordingExternalType: string;
    setRecordingExternalType: (v: string) => void;
    recordingHost: string;
    setRecordingHost: (v: string) => void;
    recordingPort: string;
    setRecordingPort: (v: string) => void;
    recordingUsername: string;
    setRecordingUsername: (v: string) => void;
    recordingPassword: string;
    setRecordingPassword: (v: string) => void;
    recordingAccessKey: string;
    setRecordingAccessKey: (v: string) => void;
    recordingSecretKey: string;
    setRecordingSecretKey: (v: string) => void;
    recordingRegion: string;
    setRecordingRegion: (v: string) => void;
    recordingBucket: string;
    setRecordingBucket: (v: string) => void;
    recordingFilenamePattern: string;
    setRecordingFilenamePattern: (v: string) => void;
    recordingFilenameRef: React.RefObject<HTMLInputElement>;
    isRecordingConnectionApproved: boolean;
    canSaveRecording: boolean;
    testingConnection: boolean;
    savingRecording: boolean;
    onTestRecordingConnection: () => void;
    onSaveRecordingSettings: () => void;
    invalidateRecordingApproved: () => void;
    teleprompterTemplate: string;
    setTeleprompterTemplate: (v: string) => void;
    teleprompterDayparts: {
        day: string;
        afternoon: string;
        night: string;
        day_start: number;
        day_end: number;
        afternoon_start: number;
        afternoon_end: number;
        night_start: number;
        night_end: number;
    };
    setTeleprompterDayparts: (v: {
        day: string;
        afternoon: string;
        night: string;
        day_start: number;
        day_end: number;
        afternoon_start: number;
        afternoon_end: number;
        night_start: number;
        night_end: number;
    }) => void;
    leadStructureFields?: string[];
    pauseSettings: PauseSettingsState;
    setPauseSettings: (v: PauseSettingsState | ((prev: PauseSettingsState) => PauseSettingsState)) => void;
}

export function CampaignSettingsTab(props: CampaignSettingsTabProps) {
    const sections = useMemo(() => {
        const allowed = sectionsForType(props.campaign.campaign_type);
        return ALL_SECTIONS.filter((s) => allowed.includes(s.id));
    }, [props.campaign.campaign_type]);

    const [active, setActive] = useState<CampaignSettingsSectionId>(sections[0]?.id ?? "general");

    const scheduleTemplateName = useMemo(() => {
        const tpl = props.scheduleTemplates.find((t) => t.id === props.scheduleTemplateId);
        return tpl?.name ?? null;
    }, [props.scheduleTemplates, props.scheduleTemplateId]);

    const SECTIONS_AFFECTING_GENERAL_SAVE: CampaignSettingsSectionId[] = ["general", "dialing", "retries", "teleprompter", "pauses"];
    const showOperationalFooter =
        props.hasConfigChanges && SECTIONS_AFFECTING_GENERAL_SAVE.includes(active);

    const renderSection = (id: CampaignSettingsSectionId) => {
        switch (id) {
            case "general":
                return (
                    <SectionGeneral
                        campaign={props.campaign}
                        outboundTrunkSummary={props.outboundTrunkSummary}
                        scheduleTemplateName={scheduleTemplateName}
                        workspaceDailyTarget={props.workspaceDailyTarget}
                        setWorkspaceDailyTarget={props.setWorkspaceDailyTarget}
                        workspaceGoalPeriodDays={props.workspaceGoalPeriodDays}
                        setWorkspaceGoalPeriodDays={props.setWorkspaceGoalPeriodDays}
                        workspaceGoalTypificationId={props.workspaceGoalTypificationId}
                        setWorkspaceGoalTypificationId={props.setWorkspaceGoalTypificationId}
                    />
                );
            case "dialing":
                return (
                    <SectionDialing
                        campaignType={props.campaign.campaign_type}
                        dialLevel={props.dialLevel}
                        setDialLevel={props.setDialLevel}
                        cpsAvailability={props.cpsAvailability}
                        predTargetDropRate={props.predTargetDropRate}
                        setPredTargetDropRate={props.setPredTargetDropRate}
                        predMinFactor={props.predMinFactor}
                        setPredMinFactor={props.setPredMinFactor}
                        predMaxFactor={props.predMaxFactor}
                        setPredMaxFactor={props.setPredMaxFactor}
                        amdEnabled={props.amdEnabled}
                        setAmdEnabled={props.setAmdEnabled}
                    />
                );
            case "retries":
                return (
                    <SectionRetries
                        maxRetries={props.maxRetries}
                        setMaxRetries={props.setMaxRetries}
                        retryGroups={props.retryGroups}
                        setRetryGroups={props.setRetryGroups}
                    />
                );
            case "schedule":
                return (
                    <SectionSchedule
                        scheduleTemplates={props.scheduleTemplates}
                        scheduleTemplateId={props.scheduleTemplateId}
                        setScheduleTemplateId={props.setScheduleTemplateId}
                        loadingScheduleTemplates={props.loadingScheduleTemplates}
                        savingScheduleTemplate={props.savingScheduleTemplate}
                        scheduleTemplateDirty={props.scheduleTemplateDirty}
                        onSave={props.onSaveScheduleTemplate}
                    />
                );
            case "typifications":
                return <SectionTypifications campaignId={props.campaign.id} />;
            case "dispositions":
                return <SectionDispositions campaignId={props.campaign.id} />;
            case "callerid":
                return <SectionCallerId campaignId={props.campaign.id} />;
            case "recording":
                return (
                    <SectionRecording
                        campaignType={props.campaign.campaign_type}
                        recordingEnabled={props.recordingEnabled}
                        setRecordingEnabled={props.setRecordingEnabled}
                        recordingStorage={props.recordingStorage}
                        setRecordingStorage={props.setRecordingStorage}
                        recordingExternalType={props.recordingExternalType}
                        setRecordingExternalType={props.setRecordingExternalType}
                        recordingHost={props.recordingHost}
                        setRecordingHost={props.setRecordingHost}
                        recordingPort={props.recordingPort}
                        setRecordingPort={props.setRecordingPort}
                        recordingUsername={props.recordingUsername}
                        setRecordingUsername={props.setRecordingUsername}
                        recordingPassword={props.recordingPassword}
                        setRecordingPassword={props.setRecordingPassword}
                        recordingAccessKey={props.recordingAccessKey}
                        setRecordingAccessKey={props.setRecordingAccessKey}
                        recordingSecretKey={props.recordingSecretKey}
                        setRecordingSecretKey={props.setRecordingSecretKey}
                        recordingRegion={props.recordingRegion}
                        setRecordingRegion={props.setRecordingRegion}
                        recordingBucket={props.recordingBucket}
                        setRecordingBucket={props.setRecordingBucket}
                        recordingFilenamePattern={props.recordingFilenamePattern}
                        setRecordingFilenamePattern={props.setRecordingFilenamePattern}
                        recordingFilenameRef={props.recordingFilenameRef}
                        isRecordingConnectionApproved={props.isRecordingConnectionApproved}
                        canSaveRecording={props.canSaveRecording}
                        testingConnection={props.testingConnection}
                        savingRecording={props.savingRecording}
                        onTestConnection={props.onTestRecordingConnection}
                        onSave={props.onSaveRecordingSettings}
                        invalidateApproved={props.invalidateRecordingApproved}
                    />
                );
            case "teleprompter":
                return (
                    <SectionTeleprompter
                        template={props.teleprompterTemplate}
                        setTemplate={props.setTeleprompterTemplate}
                        campaignType={props.campaign.campaign_type}
                        leadStructureFields={props.leadStructureFields}
                        dayparts={props.teleprompterDayparts}
                        setDayparts={props.setTeleprompterDayparts}
                    />
                );
            case "pauses":
                return (
                    <SectionPauses
                        settings={props.pauseSettings}
                        setSettings={props.setPauseSettings}
                        campaignType={props.campaign.campaign_type}
                    />
                );
        }
    };

    const activeDef = ALL_SECTIONS.find((s) => s.id === active) || ALL_SECTIONS[0];

    return (
        <div className="flex flex-col lg:flex-row gap-5 h-full min-h-0">
            {/* Sidebar - desktop */}
            <aside className="hidden lg:flex lg:w-60 xl:w-64 flex-shrink-0 flex-col">
                <div className="bg-white/60 backdrop-blur-md border border-white/80 rounded-2xl shadow-sm p-2 sticky top-2">
                    <p className="px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Configuración
                    </p>
                    <nav className="flex flex-col gap-0.5">
                        {sections.map((s) => {
                            const Icon = s.icon;
                            const isActive = active === s.id;
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => setActive(s.id)}
                                    className={`group flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all
                                        ${isActive
                                            ? "bg-white shadow-sm border border-slate-200/80"
                                            : "hover:bg-white/50 border border-transparent"
                                        }`}
                                >
                                    <span
                                        className={`mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 ${
                                            isActive ? "bg-blue-50" : "bg-slate-100 group-hover:bg-slate-200/60"
                                        }`}
                                    >
                                        <Icon className={`w-3.5 h-3.5 ${isActive ? "text-blue-600" : s.iconColor}`} />
                                    </span>
                                    <span className="flex flex-col min-w-0">
                                        <span className={`text-sm font-medium leading-tight ${isActive ? "text-slate-900" : "text-slate-700"}`}>
                                            {s.label}
                                        </span>
                                        <span className="text-[11px] text-slate-400 leading-tight mt-0.5 truncate">
                                            {s.description}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </aside>

            {/* Mobile/Tablet selector */}
            <div className="lg:hidden flex items-center gap-2">
                <Select value={active} onValueChange={(v) => setActive(v as CampaignSettingsSectionId)}>
                    <SelectTrigger className="bg-white shadow-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {sections.map((s) => {
                            const Icon = s.icon;
                            return (
                                <SelectItem key={s.id} value={s.id}>
                                    <span className="inline-flex items-center gap-2">
                                        <Icon className={`w-3.5 h-3.5 ${s.iconColor}`} />
                                        {s.label}
                                    </span>
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
                <ChevronDown className="hidden w-4 h-4 text-slate-400" />
            </div>

            {/* Main content */}
            <section className="flex-1 min-w-0 min-h-0 flex flex-col">
                <div className="flex-1 overflow-auto pb-6 custom-scrollbar pr-1">
                    {renderSection(active)}
                </div>

                {showOperationalFooter && (
                    <div className="sticky bottom-0 bg-white/85 backdrop-blur-md border border-slate-200/70 rounded-2xl shadow-lg px-4 py-3 mt-4 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-600">
                                <Activity className="w-4 h-4" />
                            </span>
                            <div className="text-sm">
                                <p className="font-medium text-slate-800 leading-tight">Cambios pendientes en {activeDef.label}</p>
                                <p className="text-[11px] text-slate-500 leading-tight">
                                    {active === "general"
                                        ? "Guarda para aplicar metas del workspace y el resto de ajustes operativos."
                                        : "Guarda para aplicar la nueva configuración al motor de marcado."}
                                </p>
                            </div>
                        </div>
                        <Button
                            onClick={props.onSaveGeneralSettings}
                            disabled={props.savingGeneral || !props.hasConfigChanges}
                            className="gap-2 min-w-[180px] h-10 rounded-xl shadow-md shadow-blue-500/10"
                        >
                            {props.savingGeneral ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {props.savingGeneral ? "Guardando…" : "Guardar cambios"}
                        </Button>
                    </div>
                )}
            </section>
        </div>
    );
}
