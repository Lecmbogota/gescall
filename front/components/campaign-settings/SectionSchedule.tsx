import { Clock, Loader2, Save } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SectionHeader, SettingsCard } from "./SectionShell";

export interface ScheduleTemplateLite {
    id: number;
    name: string;
    enabled: boolean;
    timezone: string;
    windows: { days: number[]; start: string; end: string }[];
}

interface Props {
    scheduleTemplates: ScheduleTemplateLite[];
    scheduleTemplateId: number | null;
    setScheduleTemplateId: (id: number | null) => void;
    loadingScheduleTemplates: boolean;
    savingScheduleTemplate: boolean;
    scheduleTemplateDirty: boolean;
    onSave: () => void;
}

const DAY_LABELS = [
    { v: 1, s: "Lun" }, { v: 2, s: "Mar" }, { v: 3, s: "Mié" },
    { v: 4, s: "Jue" }, { v: 5, s: "Vie" }, { v: 6, s: "Sáb" }, { v: 0, s: "Dom" },
];

export function SectionSchedule({
    scheduleTemplates,
    scheduleTemplateId,
    setScheduleTemplateId,
    loadingScheduleTemplates,
    savingScheduleTemplate,
    scheduleTemplateDirty,
    onSave,
}: Props) {
    const selectedTpl = scheduleTemplates.find((t) => t.id === scheduleTemplateId) || null;

    return (
        <>
            <SectionHeader
                icon={<Clock className="w-5 h-5" />}
                iconBg="bg-amber-100"
                iconText="text-amber-700"
                title="Horario de discado"
                description="Selecciona un horario reutilizable. Fuera de las ventanas configuradas el dialer no originará llamadas para esta campaña."
            />

            <SettingsCard
                accent="border-amber-200/60"
                footer={
                    <div className="flex justify-end">
                        <Button
                            type="button"
                            onClick={onSave}
                            disabled={savingScheduleTemplate || !scheduleTemplateDirty}
                            className="gap-2 rounded-xl min-w-[180px]"
                        >
                            {savingScheduleTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {savingScheduleTemplate ? "Guardando…" : "Guardar horario"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Horario asignado</Label>
                        <Select
                            value={scheduleTemplateId === null ? "__none__" : String(scheduleTemplateId)}
                            onValueChange={(v) => setScheduleTemplateId(v === "__none__" ? null : parseInt(v, 10))}
                            disabled={loadingScheduleTemplates}
                        >
                            <SelectTrigger className="bg-white">
                                <SelectValue placeholder={loadingScheduleTemplates ? "Cargando…" : "Seleccionar horario"} />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                                <SelectItem value="__none__">Sin horario (sin restricción)</SelectItem>
                                {scheduleTemplates.map((tpl) => (
                                    <SelectItem key={tpl.id} value={String(tpl.id)}>
                                        {tpl.name} {tpl.enabled ? "" : "(inactivo)"}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {scheduleTemplates.length === 0 && !loadingScheduleTemplates && (
                            <p className="text-[11px] text-amber-700">
                                Aún no hay horarios. Crea uno desde el módulo <strong>Horarios</strong>.
                            </p>
                        )}
                    </div>

                    {selectedTpl && (
                        <div className="rounded-xl border border-amber-200/70 bg-amber-50/30 p-4 space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="text-xs text-slate-500 font-mono">TZ: {selectedTpl.timezone}</div>
                                <Badge
                                    variant={selectedTpl.enabled ? "default" : "secondary"}
                                    className={selectedTpl.enabled ? "bg-emerald-600" : ""}
                                >
                                    {selectedTpl.enabled ? "Activo" : "Inactivo"}
                                </Badge>
                            </div>
                            {selectedTpl.windows.length === 0 ? (
                                <div className="text-xs italic text-slate-400">Este horario no tiene ventanas configuradas.</div>
                            ) : (
                                <ul className="space-y-1">
                                    {selectedTpl.windows.map((w, i) => {
                                        const days = DAY_LABELS.filter((d) => w.days.includes(d.v)).map((d) => d.s).join(", ");
                                        return (
                                            <li key={i} className="text-xs bg-white/60 border border-amber-100 rounded px-2 py-1">
                                                <span className="font-semibold">{days || "—"}</span>{" "}
                                                <span className="font-mono">{w.start}–{w.end}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </SettingsCard>
        </>
    );
}
