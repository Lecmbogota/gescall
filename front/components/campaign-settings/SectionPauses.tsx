import { useEffect, useState } from "react";
import { TimerReset, Timer } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { SectionHeader, SettingsCard } from "./SectionShell";

export type PauseRow = { enabled: boolean; limit_seconds: number; label?: string };
export type PauseSettingsState = Record<string, PauseRow>;

interface Props {
    settings: PauseSettingsState;
    setSettings: (value: PauseSettingsState | ((prev: PauseSettingsState) => PauseSettingsState)) => void;
    campaignType?: string | null;
}

function fmtLimit(sec: number): string {
    if (sec >= 3600) return `${(sec / 3600).toFixed(sec % 3600 === 0 ? 0 : 1)} h`;
    if (sec >= 60) return `${Math.round(sec / 60)} min`;
    return `${sec} seg`;
}

function secondsToHHMM(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hh = Math.floor(safe / 3600);
    const mm = Math.floor((safe % 3600) / 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function hhmmToSeconds(raw: string): number | null {
    const m = String(raw || "").trim().match(/^(\d{1,2}):([0-5]\d)$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return (hh * 3600) + (mm * 60);
}

function prettyFromId(id: string): string {
    const base = String(id || "")
        .replace(/^not_ready_?/, "")
        .replace(/_/g, " ")
        .trim();
    if (!base) return "No disponible";
    return base.charAt(0).toUpperCase() + base.slice(1);
}

function safePauseId(raw: string): string {
    const slug = String(raw || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    if (!slug) return "";
    return slug === "not_ready" || slug.startsWith("not_ready_") ? slug : `not_ready_${slug}`;
}

type PausePreset = { id: string; label: string; hint: string; settings: PauseSettingsState };

/** Mismas claves que el backend; cada plantilla reemplaza todo el conjunto. */
const DEFAULT_PRESETS: PausePreset[] = [
    {
        id: "default",
        label: "Predeterminada",
        hint: "Todas habilitadas con tiempos estándar.",
        settings: {
            not_ready: { enabled: true, limit_seconds: 600 },
            not_ready_bano: { enabled: true, limit_seconds: 900 },
            not_ready_almuerzo: { enabled: true, limit_seconds: 1800 },
            not_ready_backoffice: { enabled: true, limit_seconds: 900 },
            not_ready_capacitacion: { enabled: true, limit_seconds: 3600 },
        },
    },
    {
        id: "strict",
        label: "Estricta",
        hint: "Tiempos cortos; capacitación desactivada.",
        settings: {
            not_ready: { enabled: true, limit_seconds: 300 },
            not_ready_bano: { enabled: true, limit_seconds: 300 },
            not_ready_almuerzo: { enabled: true, limit_seconds: 1200 },
            not_ready_backoffice: { enabled: true, limit_seconds: 600 },
            not_ready_capacitacion: { enabled: false, limit_seconds: 3600 },
        },
    },
    {
        id: "minimal",
        label: "Mínima",
        hint: "Solo no disponible y baño.",
        settings: {
            not_ready: { enabled: true, limit_seconds: 600 },
            not_ready_bano: { enabled: true, limit_seconds: 600 },
            not_ready_almuerzo: { enabled: false, limit_seconds: 1800 },
            not_ready_backoffice: { enabled: false, limit_seconds: 900 },
            not_ready_capacitacion: { enabled: false, limit_seconds: 3600 },
        },
    },
    {
        id: "training",
        label: "Formación",
        hint: "Más tiempo para almuerzo y capacitación.",
        settings: {
            not_ready: { enabled: true, limit_seconds: 600 },
            not_ready_bano: { enabled: true, limit_seconds: 900 },
            not_ready_almuerzo: { enabled: true, limit_seconds: 3600 },
            not_ready_backoffice: { enabled: true, limit_seconds: 1200 },
            not_ready_capacitacion: { enabled: true, limit_seconds: 7200 },
        },
    },
];

const INBOUND_PRESETS: PausePreset[] = [
    DEFAULT_PRESETS[0],
    {
        id: "inbound-strict",
        label: "Inbound estricto",
        hint: "Prioriza disponibilidad y pausas cortas.",
        settings: {
            not_ready: { enabled: true, limit_seconds: 300 },
            not_ready_bano: { enabled: true, limit_seconds: 300 },
            not_ready_almuerzo: { enabled: true, limit_seconds: 1200 },
            not_ready_backoffice: { enabled: false, limit_seconds: 900 },
            not_ready_capacitacion: { enabled: false, limit_seconds: 3600 },
        },
    },
    {
        id: "inbound-standard",
        label: "Inbound estándar",
        hint: "Balance entre servicio en cola y pausas operativas.",
        settings: {
            not_ready: { enabled: true, limit_seconds: 600 },
            not_ready_bano: { enabled: true, limit_seconds: 900 },
            not_ready_almuerzo: { enabled: true, limit_seconds: 1800 },
            not_ready_backoffice: { enabled: true, limit_seconds: 900 },
            not_ready_capacitacion: { enabled: false, limit_seconds: 3600 },
        },
    },
];

const OUTBOUND_PROGRESSIVE_PRESETS: PausePreset[] = [
    DEFAULT_PRESETS[0],
    {
        id: "progressive-balanced",
        label: "Progresiva balanceada",
        hint: "Mantiene pausas clave con tiempos moderados.",
        settings: {
            not_ready: { enabled: true, limit_seconds: 600 },
            not_ready_bano: { enabled: true, limit_seconds: 600 },
            not_ready_almuerzo: { enabled: true, limit_seconds: 1800 },
            not_ready_backoffice: { enabled: true, limit_seconds: 1200 },
            not_ready_capacitacion: { enabled: true, limit_seconds: 3600 },
        },
    },
    {
        id: "progressive-tight",
        label: "Progresiva exigente",
        hint: "Reduce tiempos para mayor ritmo de marcación.",
        settings: {
            not_ready: { enabled: true, limit_seconds: 300 },
            not_ready_bano: { enabled: true, limit_seconds: 300 },
            not_ready_almuerzo: { enabled: true, limit_seconds: 1200 },
            not_ready_backoffice: { enabled: true, limit_seconds: 600 },
            not_ready_capacitacion: { enabled: false, limit_seconds: 3600 },
        },
    },
];

const OUTBOUND_PREDICTIVE_PRESETS: PausePreset[] = [
    DEFAULT_PRESETS[0],
    {
        id: "predictive-standard",
        label: "Predictiva estándar",
        hint: "Perfil recomendado para campañas predictivas.",
        settings: {
            not_ready: { enabled: true, limit_seconds: 450 },
            not_ready_bano: { enabled: true, limit_seconds: 600 },
            not_ready_almuerzo: { enabled: true, limit_seconds: 1800 },
            not_ready_backoffice: { enabled: true, limit_seconds: 900 },
            not_ready_capacitacion: { enabled: false, limit_seconds: 3600 },
        },
    },
    {
        id: "predictive-training",
        label: "Predictiva formación",
        hint: "Amplía tiempos para entrenamiento supervisado.",
        settings: {
            not_ready: { enabled: true, limit_seconds: 600 },
            not_ready_bano: { enabled: true, limit_seconds: 900 },
            not_ready_almuerzo: { enabled: true, limit_seconds: 2400 },
            not_ready_backoffice: { enabled: true, limit_seconds: 1200 },
            not_ready_capacitacion: { enabled: true, limit_seconds: 5400 },
        },
    },
];

function clonePreset(s: PauseSettingsState): PauseSettingsState {
    const out: PauseSettingsState = {};
    for (const k of Object.keys(s)) {
        const row = s[k];
        out[k] = { enabled: !!row.enabled, limit_seconds: row.limit_seconds };
    }
    return out;
}

function getPresetsForType(campaignType?: string | null): PausePreset[] {
    const key = String(campaignType || "").toUpperCase();
    if (key === "INBOUND") return INBOUND_PRESETS;
    if (key === "OUTBOUND_PROGRESSIVE") return OUTBOUND_PROGRESSIVE_PRESETS;
    if (key === "OUTBOUND_PREDICTIVE") return OUTBOUND_PREDICTIVE_PRESETS;
    return DEFAULT_PRESETS;
}

function campaignTypeLabel(campaignType?: string | null): string {
    const key = String(campaignType || "").toUpperCase();
    if (key === "INBOUND") return "Inbound";
    if (key === "OUTBOUND_PROGRESSIVE") return "Progresiva";
    if (key === "OUTBOUND_PREDICTIVE") return "Predictiva";
    return "General";
}

export function SectionPauses({ settings, setSettings, campaignType }: Props) {
    const presets = getPresetsForType(campaignType);
    const typeLabel = campaignTypeLabel(campaignType);
    const [newPauseLabel, setNewPauseLabel] = useState("");
    const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});

    const pauseRows = Object.entries(settings).sort(([a], [b]) => {
        if (a === "not_ready") return -1;
        if (b === "not_ready") return 1;
        return a.localeCompare(b);
    });

    useEffect(() => {
        const next: Record<string, string> = {};
        for (const [id, row] of Object.entries(settings || {})) {
            next[id] = secondsToHHMM(row?.limit_seconds || 0);
        }
        setLimitDrafts(next);
    }, [settings]);
    return (
        <>
            <SectionHeader
                icon={<TimerReset className="w-5 h-5" />}
                iconBg="bg-rose-100"
                iconText="text-rose-600"
                title="Pausas permitidas"
                description="Define qué pausas pueden tomar los agentes en esta campaña y su duración máxima."
            />

            <SettingsCard
                icon={<Timer className="w-4 h-4" />}
                iconBg="bg-rose-100"
                iconText="text-rose-600"
                title="Reglas por tipo de pausa"
                description="Aplica para campañas Inbound, Progresiva y Predictiva. Las pausas deshabilitadas no se muestran al agente."
            >
                <div className="mb-5 p-3 rounded-xl border border-rose-100 bg-rose-50/40">
                    <p className="text-xs font-semibold text-rose-900 mb-2">Plantillas rápidas</p>
                    <p className="text-[11px] text-slate-600 mb-3">
                        Plantillas para campaña <strong>{typeLabel}</strong>. Sobrescribe toda la tabla de pausas; luego puedes afinar y usar <strong>Guardar cambios</strong>.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {presets.map((preset) => (
                            <Button
                                key={preset.id}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs border-rose-200 bg-white hover:bg-rose-50"
                                title={preset.hint}
                                onClick={() => setSettings(clonePreset(preset.settings))}
                            >
                                {preset.label}
                            </Button>
                        ))}
                    </div>
                </div>
                <div className="mb-5 p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                    <p className="text-xs font-semibold text-slate-800 mb-2">Nuevo tipo de pausa</p>
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="w-full max-w-xs">
                            <Label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">
                                Nombre visible
                            </Label>
                            <Input
                                value={newPauseLabel}
                                onChange={(e) => setNewPauseLabel(e.target.value)}
                                placeholder="Ej: Reunión interna"
                                className="h-9"
                            />
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            className="h-9"
                            onClick={() => {
                                const label = newPauseLabel.trim();
                                const id = safePauseId(label);
                                if (!label || !id || settings[id]) return;
                                setSettings((prev) => ({
                                    ...prev,
                                    [id]: { enabled: true, limit_seconds: 900, label },
                                }));
                                setNewPauseLabel("");
                            }}
                        >
                            Crear tipo
                        </Button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">Se guarda con clave interna `not_ready_*` automáticamente.</p>
                </div>
                <div className="space-y-3">
                    {pauseRows.map(([id, row]) => {
                        const current = row || { enabled: false, limit_seconds: 60, label: prettyFromId(id) };
                        const label = current.label?.trim() || prettyFromId(id);
                        return (
                            <div key={id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">{label}</p>
                                        <p className="text-xs text-slate-500 mt-0.5 font-mono">{id}</p>
                                    </div>
                                    <Switch
                                        checked={!!current.enabled}
                                        onCheckedChange={(checked) =>
                                            setSettings((prev) => ({
                                                ...prev,
                                                [id]: { ...(prev[id] || current), enabled: checked },
                                            }))
                                        }
                                    />
                                </div>
                                <div className="mt-3 flex flex-wrap items-end gap-3">
                                    <div className="w-full max-w-[260px]">
                                        <Label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">
                                            Nombre visible
                                        </Label>
                                        <Input
                                            value={label}
                                            onChange={(e) =>
                                                setSettings((prev) => ({
                                                    ...prev,
                                                    [id]: { ...(prev[id] || current), label: e.target.value.slice(0, 80) },
                                                }))
                                            }
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="w-full max-w-[170px]">
                                        <Label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">
                                            Duración máxima (hh:mm)
                                        </Label>
                                        <Input
                                            type="text"
                                            disabled={!current.enabled}
                                            placeholder="00:15"
                                            value={limitDrafts[id] ?? secondsToHHMM(current.limit_seconds ?? 0)}
                                            onChange={(e) => {
                                                setLimitDrafts((prev) => ({ ...prev, [id]: e.target.value }));
                                            }}
                                            onBlur={() => {
                                                const parsed = hhmmToSeconds(limitDrafts[id] ?? "");
                                                const base = current.limit_seconds ?? 900;
                                                const safe = parsed == null ? base : Math.max(15, Math.min(28800, parsed));
                                                setSettings((prev) => ({
                                                    ...prev,
                                                    [id]: { ...(prev[id] || current), limit_seconds: safe },
                                                }));
                                                setLimitDrafts((prev) => ({ ...prev, [id]: secondsToHHMM(safe) }));
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                                            }}
                                            className="h-9 font-mono text-sm"
                                        />
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        Límite: <span className="font-semibold text-slate-700">{fmtLimit(current.limit_seconds || 0)}</span>
                                    </div>
                                    {id !== "not_ready" && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-9 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                            onClick={() =>
                                                setSettings((prev) => {
                                                    const next = { ...prev };
                                                    delete next[id];
                                                    return next;
                                                })
                                            }
                                        >
                                            Eliminar
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </SettingsCard>
        </>
    );
}

