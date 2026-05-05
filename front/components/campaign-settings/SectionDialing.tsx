import { Activity, Network, Zap } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SectionHeader, SettingsCard } from "./SectionShell";

interface Trunk { trunk_id: string; trunk_name: string; }

interface Props {
    campaignType?: string;
    dialLevel: string;
    setDialLevel: (v: string) => void;
    selectedTrunkId: string;
    setSelectedTrunkId: (v: string) => void;
    availableTrunks: Trunk[];
    cpsAvailability: { total_cps: number; used_cps: number; available_cps: number } | null;
    // Predictivo
    predTargetDropRate: number;
    setPredTargetDropRate: (v: number) => void;
    predMinFactor: number;
    setPredMinFactor: (v: number) => void;
    predMaxFactor: number;
    setPredMaxFactor: (v: number) => void;
}

export function SectionDialing({
    campaignType,
    dialLevel,
    setDialLevel,
    selectedTrunkId,
    setSelectedTrunkId,
    availableTrunks,
    cpsAvailability,
    predTargetDropRate,
    setPredTargetDropRate,
    predMinFactor,
    setPredMinFactor,
    predMaxFactor,
    setPredMaxFactor,
}: Props) {
    const isPredictive = campaignType === "OUTBOUND_PREDICTIVE";

    return (
        <>
            <SectionHeader
                icon={<Zap className="w-5 h-5" />}
                iconBg="bg-blue-100"
                iconText="text-blue-600"
                title="Estrategia de marcación"
                description="Velocidad de marcado y troncal de salida. Para campañas predictivas, el sistema autoajusta el ritmo según la tasa de abandono."
            />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <SettingsCard
                    icon={<Zap className="w-4 h-4" />}
                    iconBg="bg-blue-100"
                    iconText="text-blue-600"
                    title="Nivel de auto-marcación"
                    description="Llamadas simultáneas que el dialer abrirá por agente disponible."
                >
                    <div className="flex flex-col gap-5">
                        <div>
                            <Label htmlFor="dialLevel" className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                                Ratio de marcación
                            </Label>
                            <Select value={dialLevel?.toString() || "1.0"} onValueChange={setDialLevel}>
                                <SelectTrigger id="dialLevel" className="font-mono text-lg h-11 w-full bg-white shadow-sm">
                                    <SelectValue placeholder="Ratio" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl shadow-xl border-slate-100">
                                    {[1.0, 2.0, 3.0, 4.0, 5.0, 10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0].map((ratio) => (
                                        <SelectItem key={ratio} value={ratio.toFixed(1)}>{ratio.toFixed(1)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {cpsAvailability && (
                            <div className="bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/60 flex flex-col gap-2">
                                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                                    <Network className="w-3.5 h-3.5 text-blue-500" /> Bolsa global CPS
                                </span>
                                <div className="flex justify-between items-center bg-white px-3 py-1.5 rounded border border-slate-100 shadow-sm">
                                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Disponibles</span>
                                    <span className={`text-sm font-bold ${cpsAvailability.available_cps <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                        {cpsAvailability.available_cps}{" "}
                                        <span className="text-slate-400 font-normal">/ {cpsAvailability.total_cps}</span>
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </SettingsCard>

                <SettingsCard
                    icon={<Network className="w-4 h-4" />}
                    iconBg="bg-violet-100"
                    iconText="text-violet-600"
                    title="Troncal de salida"
                    description="Ruta SIP por la que se cursarán las llamadas."
                >
                    <Label htmlFor="trunkSelect" className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                        Troncal asignada
                    </Label>
                    <Select value={selectedTrunkId} onValueChange={setSelectedTrunkId}>
                        <SelectTrigger id="trunkSelect" className="font-mono text-sm h-11 w-full bg-white shadow-sm">
                            <SelectValue placeholder="Sin troncal asignada" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl shadow-xl border-slate-100">
                            <SelectItem value="__none__">Sin asignar (default .env)</SelectItem>
                            {availableTrunks.map((trunk) => (
                                <SelectItem key={trunk.trunk_id} value={trunk.trunk_id}>
                                    {trunk.trunk_name} ({trunk.trunk_id})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-[10px] text-slate-400 mt-2 italic">Si no se asigna, se usará la troncal por defecto definida en el sistema.</p>
                </SettingsCard>
            </div>

            {isPredictive && (
                <div className="mt-5">
                    <SettingsCard
                        icon={<Activity className="w-4 h-4" />}
                        iconBg="bg-blue-100"
                        iconText="text-blue-600"
                        accent="border-blue-200/60"
                        title="Ajuste dinámico (Predictivo)"
                        description="El marcador se autorregula según la tasa de abandono real para mantenerla bajo el objetivo."
                    >
                        <div className="flex flex-col gap-5">
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tasa de abandono máxima</Label>
                                    <span className="text-xs font-mono text-slate-500">{(predTargetDropRate * 100).toFixed(1)}%</span>
                                </div>
                                <Input
                                    type="range"
                                    min="1"
                                    max="20"
                                    step="0.5"
                                    value={Math.round(predTargetDropRate * 100)}
                                    onChange={(e) => setPredTargetDropRate(parseFloat(e.target.value) / 100)}
                                    className="w-full h-2 accent-blue-500"
                                />
                                <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-0.5">
                                    <span>1%</span>
                                    <span>10%</span>
                                    <span>20%</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1.5 italic">Porcentaje máximo de llamadas abandonadas aceptable.</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Factor mínimo</Label>
                                    <Input
                                        type="number"
                                        min="0.5"
                                        max="3.0"
                                        step="0.1"
                                        value={predMinFactor}
                                        onChange={(e) => setPredMinFactor(parseFloat(e.target.value) || 1.0)}
                                        className="font-mono text-sm h-9 bg-white shadow-sm"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">Llamadas mínimas por agente.</p>
                                </div>
                                <div>
                                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Factor máximo</Label>
                                    <Input
                                        type="number"
                                        min="1.5"
                                        max="10.0"
                                        step="0.1"
                                        value={predMaxFactor}
                                        onChange={(e) => setPredMaxFactor(parseFloat(e.target.value) || 4.0)}
                                        className="font-mono text-sm h-9 bg-white shadow-sm"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">Límite superior de llamadas por agente.</p>
                                </div>
                            </div>

                            <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-100 text-[11px] text-slate-500 leading-relaxed">
                                <p className="font-semibold text-slate-600 mb-1">Cómo funciona</p>
                                <p>
                                    El sistema monitorea en tiempo real cuántas llamadas contestan frente a las que abandonan. Si la tasa de abandono supera el objetivo,
                                    reduce automáticamente el ritmo para proteger los leads. Si está por debajo, incrementa gradualmente la velocidad de marcación.
                                </p>
                            </div>
                        </div>
                    </SettingsCard>
                </div>
            )}
        </>
    );
}
