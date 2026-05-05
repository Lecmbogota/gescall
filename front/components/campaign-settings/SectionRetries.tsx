import { Activity, Repeat } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SectionHeader, SettingsCard } from "./SectionShell";

export interface RetryGroupValue { enabled: boolean; minutes: number; }
export type RetryGroupsState = {
    Rechazada: RetryGroupValue;
    Ocupado: RetryGroupValue;
    Buzon: RetryGroupValue;
    Cortada: RetryGroupValue;
    NoContesta: RetryGroupValue;
    FalloTecnico: RetryGroupValue;
};

interface Props {
    maxRetries: number;
    setMaxRetries: (n: number) => void;
    retryGroups: RetryGroupsState;
    setRetryGroups: (g: RetryGroupsState) => void;
}

const GROUPS: { key: keyof RetryGroupsState; label: string; desc: string; color: string }[] = [
    { key: "Rechazada", label: "Rechazada", desc: "Colgó la llamada o IVR", color: "text-orange-600" },
    { key: "Ocupado", label: "Ocupado", desc: "Red ocupada", color: "text-purple-600" },
    { key: "Buzon", label: "Buzón", desc: "Contestadora automática", color: "text-indigo-600" },
    { key: "Cortada", label: "Cortada", desc: "Corte SIP o carrier", color: "text-red-500" },
    { key: "NoContesta", label: "No Contesta", desc: "Ninguna respuesta humana", color: "text-yellow-600" },
    { key: "FalloTecnico", label: "Fallo Técnico", desc: "Error genérico FAILED", color: "text-slate-600" },
];

export function SectionRetries({ maxRetries, setMaxRetries, retryGroups, setRetryGroups }: Props) {
    return (
        <>
            <SectionHeader
                icon={<Repeat className="w-5 h-5" />}
                iconBg="bg-purple-100"
                iconText="text-purple-600"
                title="Sistema de reintentos"
                description="Define cuántas veces se reintenta un lead y cuánto debe esperar entre intentos según el resultado."
                action={
                    <div className="bg-white/70 p-2 rounded-xl border border-slate-200/70 shadow-sm flex items-center gap-3 px-4">
                        <Label htmlFor="maxRetries" className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0 text-nowrap">
                            Intentos máx.
                        </Label>
                        <Select value={maxRetries.toString()} onValueChange={(val) => setMaxRetries(parseInt(val) || 0)}>
                            <SelectTrigger id="maxRetries" className="font-mono text-base h-8 w-20 text-center border-slate-200 shadow-inner">
                                <SelectValue placeholder="3" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl shadow-xl border-slate-100 min-w-[5rem]">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                    <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                }
            />

            <SettingsCard
                title="Minutos de enfriamiento por disposición"
                description="Tiempo de espera mínimo antes de volver a intentar un lead según el motivo."
                icon={<Activity className="w-4 h-4" />}
                iconBg="bg-purple-100"
                iconText="text-purple-600"
            >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">
                    {GROUPS.map(({ key, label, desc, color }) => {
                        const isEnabled = retryGroups[key].enabled;
                        return (
                            <div
                                key={key}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                                    isEnabled
                                        ? "bg-slate-50/50 border-slate-100/80 hover:bg-slate-50 hover:border-slate-200"
                                        : "bg-slate-100/40 border-slate-200/50 opacity-75 grayscale-[30%]"
                                }`}
                            >
                                <div className="flex flex-col gap-1 w-1/2 min-w-0">
                                    <Label
                                        className="text-xs font-semibold text-slate-700 tracking-wider flex items-center gap-1.5 cursor-pointer"
                                        onClick={() => setRetryGroups({ ...retryGroups, [key]: { ...retryGroups[key], enabled: !isEnabled } })}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${isEnabled ? "bg-current " + color : "bg-slate-300"}`} />
                                        {label}
                                    </Label>
                                    <p className="text-[10px] text-slate-400 font-medium leading-tight truncate px-3.5" title={desc}>
                                        {desc}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="relative flex-none w-[70px]">
                                        <Input
                                            type="number"
                                            min="1"
                                            value={retryGroups[key].minutes}
                                            onChange={(e) =>
                                                setRetryGroups({
                                                    ...retryGroups,
                                                    [key]: { ...retryGroups[key], minutes: Math.max(parseInt(e.target.value) || 1, 1) },
                                                })
                                            }
                                            disabled={!isEnabled}
                                            className="font-mono pr-6 bg-white border-slate-200 h-8 text-center text-sm disabled:bg-slate-100/50 disabled:text-slate-400 focus-visible:ring-1 shadow-inner focus-visible:ring-offset-0"
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase text-slate-400 font-bold tracking-wider">m</div>
                                    </div>
                                    <div className="w-px h-5 bg-slate-200" />
                                    <Switch
                                        checked={isEnabled}
                                        onCheckedChange={(checked) => setRetryGroups({ ...retryGroups, [key]: { ...retryGroups[key], enabled: checked } })}
                                        className="scale-75 origin-right data-[state=checked]:bg-emerald-500 shadow-sm"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </SettingsCard>
        </>
    );
}
