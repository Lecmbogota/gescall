import { ChevronDown, ChevronUp, Plus, Trash2, WandSparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { SectionHeader, SettingsCard } from "./SectionShell";
import { useState } from "react";

interface Props {
    template: string;
    setTemplate: (value: string) => void;
    campaignType?: string;
    leadStructureFields?: string[];
    dayparts: {
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
    setDayparts: (v: {
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
}

const AGENT_PLACEHOLDER = { label: "Nombre agente", token: "{{agent_name}}" };

const QUICK_BLOCKS = [
    "Hola, te habla {{agent_name}}.",
    "Te deseo buena {{time_period}}.",
    "¿Confirmas tu número {{telefono}} para continuar?",
    "¿Deseas que te explique las opciones de pago disponibles?",
    "Gracias por tu tiempo, quedo atento a tu confirmación.",
];

export function SectionTeleprompter({
    template,
    setTemplate,
    campaignType,
    leadStructureFields = [],
    dayparts,
    setDayparts,
}: Props) {
    const [newBlock, setNewBlock] = useState("");

    const previewSegments = template
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    const setSegments = (segments: string[]) => {
        setTemplate(segments.filter(Boolean).join("\n"));
    };

    const addBlock = (value: string) => {
        const cleaned = value.trim();
        if (!cleaned) return;
        setSegments([...previewSegments, cleaned]);
    };

    const removeBlock = (index: number) => {
        setSegments(previewSegments.filter((_, idx) => idx !== index));
    };

    const moveBlock = (index: number, direction: "up" | "down") => {
        const target = direction === "up" ? index - 1 : index + 1;
        if (target < 0 || target >= previewSegments.length) return;
        const next = [...previewSegments];
        const temp = next[index];
        next[index] = next[target];
        next[target] = temp;
        setSegments(next);
    };

    const updateBlock = (index: number, value: string) => {
        const next = [...previewSegments];
        next[index] = value;
        setSegments(next);
    };

    const insertToken = (token: string) => {
        const separator = template.trim().length ? " " : "";
        setTemplate(`${template}${separator}${token}`.trimStart());
    };

    const isPredictiveOrProgressive =
        campaignType === "OUTBOUND_PREDICTIVE" || campaignType === "OUTBOUND_PROGRESSIVE";
    const dynamicStructureFields = isPredictiveOrProgressive
        ? leadStructureFields
            .map((name) => name.trim())
            .filter((name) => !!name)
        : [];

    const onHourChange = (key: keyof typeof dayparts, raw: string) => {
        const parsed = Number(raw);
        const value = Number.isFinite(parsed) ? Math.max(0, Math.min(23, Math.floor(parsed))) : 0;
        setDayparts({ ...dayparts, [key]: value });
    };

    return (
        <>
            <SectionHeader
                icon={<WandSparkles className="w-5 h-5" />}
                iconBg="bg-amber-100"
                iconText="text-amber-600"
                title="Script de teleprompter"
                description="Construye el guion que verá el agente en el teleprompter. Usa una línea por bloque para que el desplazamiento sea más natural."
            />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <SettingsCard
                    title="Editor de guion"
                    description="Puedes usar variables dinámicas para personalizar el discurso."
                    icon={<WandSparkles className="w-4 h-4" />}
                    iconBg="bg-amber-100"
                    iconText="text-amber-600"
                >
                    <div className="space-y-4">
                        <div>
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                                Variables disponibles
                            </Label>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[11px] rounded-lg"
                                    onClick={() => insertToken(AGENT_PLACEHOLDER.token)}
                                >
                                    {AGENT_PLACEHOLDER.label}
                                </Button>
                                {dynamicStructureFields.map((fieldName) => {
                                    const token = `{{${fieldName}}}`;
                                    return (
                                        <Button
                                            key={token}
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-[11px] rounded-lg border-blue-200 text-blue-700 hover:text-blue-800"
                                            onClick={() => insertToken(token)}
                                        >
                                            {fieldName}
                                        </Button>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-2">
                                Para predictiva/progresiva, las variables de estructura se completan con el lead asignado.
                            </p>
                        </div>

                        <div>
                            <Label htmlFor="teleprompterTemplate" className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                                Guion
                            </Label>
                            <Textarea
                                id="teleprompterTemplate"
                                value={template}
                                onChange={(e) => setTemplate(e.target.value)}
                                placeholder={"Hola, te habla {{agent_name}}.\nTe deseo buena {{time_period}}.\n¿Confirmas tu número {{telefono}} para continuar?"}
                                className="min-h-[220px] text-sm leading-relaxed bg-white"
                            />
                            <p className="text-[11px] text-slate-400 mt-2">
                                Consejo: separa por párrafos cortos (1 idea por línea) para mejorar el seguimiento por voz.
                            </p>
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                                Constructor por bloques
                            </Label>
                            <div className="space-y-2">
                                {previewSegments.length ? (
                                    previewSegments.map((segment, idx) => (
                                        <div key={`${idx}-${segment}`} className="flex items-center gap-2">
                                            <Input
                                                value={segment}
                                                onChange={(e) => updateBlock(idx, e.target.value)}
                                                className="h-9 text-sm bg-white"
                                            />
                                            <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => moveBlock(idx, "up")} disabled={idx === 0}>
                                                <ChevronUp className="w-4 h-4" />
                                            </Button>
                                            <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => moveBlock(idx, "down")} disabled={idx === previewSegments.length - 1}>
                                                <ChevronDown className="w-4 h-4" />
                                            </Button>
                                            <Button type="button" variant="outline" size="icon" className="h-9 w-9 text-red-600 hover:text-red-700" onClick={() => removeBlock(idx)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-xs text-slate-400 italic">Aún no hay bloques cargados.</div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-3">
                                <Input
                                    value={newBlock}
                                    onChange={(e) => setNewBlock(e.target.value)}
                                    placeholder="Nuevo bloque..."
                                    className="h-9 text-sm bg-white"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9"
                                    onClick={() => {
                                        addBlock(newBlock);
                                        setNewBlock("");
                                    }}
                                >
                                    <Plus className="w-4 h-4 mr-1" />
                                    Agregar
                                </Button>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                                Configuración día / tarde / noche
                            </Label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-2">
                                    <Input
                                        value={dayparts.day}
                                        onChange={(e) => setDayparts({ ...dayparts, day: e.target.value })}
                                        placeholder="Etiqueta día"
                                        className="h-9 text-sm bg-white"
                                    />
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={dayparts.day_start}
                                            onChange={(e) => onHourChange("day_start", e.target.value)}
                                            className="h-9 text-sm bg-white"
                                        />
                                        <span className="text-xs text-slate-500">a</span>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={dayparts.day_end}
                                            onChange={(e) => onHourChange("day_end", e.target.value)}
                                            className="h-9 text-sm bg-white"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Input
                                        value={dayparts.afternoon}
                                        onChange={(e) => setDayparts({ ...dayparts, afternoon: e.target.value })}
                                        placeholder="Etiqueta tarde"
                                        className="h-9 text-sm bg-white"
                                    />
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={dayparts.afternoon_start}
                                            onChange={(e) => onHourChange("afternoon_start", e.target.value)}
                                            className="h-9 text-sm bg-white"
                                        />
                                        <span className="text-xs text-slate-500">a</span>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={dayparts.afternoon_end}
                                            onChange={(e) => onHourChange("afternoon_end", e.target.value)}
                                            className="h-9 text-sm bg-white"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Input
                                        value={dayparts.night}
                                        onChange={(e) => setDayparts({ ...dayparts, night: e.target.value })}
                                        placeholder="Etiqueta noche"
                                        className="h-9 text-sm bg-white"
                                    />
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={dayparts.night_start}
                                            onChange={(e) => onHourChange("night_start", e.target.value)}
                                            className="h-9 text-sm bg-white"
                                        />
                                        <span className="text-xs text-slate-500">a</span>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={dayparts.night_end}
                                            onChange={(e) => onHourChange("night_end", e.target.value)}
                                            className="h-9 text-sm bg-white"
                                        />
                                    </div>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-2">
                                Ejemplo: dia 6-11, tarde 12-18, noche 19-5. Usa <span className="font-mono">{'{{time_period}}'}</span>.
                            </p>
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                                Bloques rápidos
                            </Label>
                            <div className="flex flex-wrap gap-2">
                                {QUICK_BLOCKS.map((block) => (
                                    <Button
                                        key={block}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[11px] rounded-lg"
                                        onClick={() => addBlock(block)}
                                    >
                                        + Bloque
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                </SettingsCard>

                <SettingsCard title="Vista previa" description="Así se mostrará segmentado en el teleprompter.">
                    <div className="space-y-3 max-h-[320px] overflow-auto custom-scrollbar pr-1">
                        {previewSegments.length ? (
                            previewSegments.map((segment, idx) => (
                                <div key={`${idx}-${segment}`} className="text-sm rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                                    {segment}
                                </div>
                            ))
                        ) : (
                            <div className="text-sm text-slate-400 italic">
                                Aún no hay bloques. Escribe el guion para previsualizarlo.
                            </div>
                        )}
                    </div>
                </SettingsCard>
            </div>
        </>
    );
}
