import { useState, useEffect, useCallback, useRef } from "react";
import api from "@/services/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "./ui/table";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "./ui/alert-dialog";
import {
    ChevronDown,
    ChevronUp,
    GripVertical,
    Plus,
    RotateCcw,
    Trash2,
    Code2,
    Check,
    X,
} from "lucide-react";
import { toast } from "sonner";

interface Disposition {
    id: number;
    campaign_id: string;
    code: string;
    label: string;
    color: string;
    sort_order: number;
    conditions: any;
    active: boolean;
    is_default: boolean;
}

const COLOR_OPTIONS = [
    { value: 'bg-blue-500', label: 'Azul' },
    { value: 'bg-green-500', label: 'Verde' },
    { value: 'bg-red-500', label: 'Rojo' },
    { value: 'bg-yellow-500', label: 'Amarillo' },
    { value: 'bg-orange-500', label: 'Naranja' },
    { value: 'bg-purple-500', label: 'Púrpura' },
    { value: 'bg-indigo-400', label: 'Índigo' },
    { value: 'bg-pink-500', label: 'Rosa' },
    { value: 'bg-teal-500', label: 'Teal' },
    { value: 'bg-slate-500', label: 'Gris' },
    { value: 'bg-red-400', label: 'Rojo Claro' },
    { value: 'bg-emerald-500', label: 'Esmeralda' },
    { value: 'bg-emerald-600', label: 'Esmeralda O.' },
    { value: 'bg-slate-400', label: 'Gris Claro' },
    { value: 'bg-cyan-500', label: 'Cian' },
];

const CONDITION_KEYS = {
    call_status: 'call_status',
    lead_status: 'lead_status',
    dtmf: 'dtmf',
    exclude_typification: 'exclude_typification',
    require_typification: 'require_typification',
    min_duration: 'min_duration',
};

interface CampaignDispositionsProps {
    campaignId: string;
}

export default function CampaignDispositions({ campaignId }: CampaignDispositionsProps) {
    const [dispositions, setDispositions] = useState<Disposition[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [resetDialogOpen, setResetDialogOpen] = useState(false);
    const [editingCode, setEditingCode] = useState<string>("");
    const [editingLabel, setEditingLabel] = useState<string>("");
    const [addingNew, setAddingNew] = useState(false);
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const loadDispositions = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.getCampaignDispositions(campaignId);
            setDispositions(res.data || []);
        } catch (e: any) {
            toast.error("Error al cargar disposiciones");
        } finally {
            setLoading(false);
        }
    }, [campaignId]);

    useEffect(() => { loadDispositions(); }, [loadDispositions]);

    const updateDisposition = async (id: number, data: any) => {
        try {
            await api.updateDisposition(campaignId, id, data);
            setDispositions(prev => prev.map(d => d.id === id ? { ...d, ...data } : d));
        } catch (e: any) {
            toast.error(e.message || "Error al actualizar");
        }
    };

    const toggleActive = async (id: number, active: boolean) => {
        await updateDisposition(id, { active });
    };

    const saveConditions = async (id: number, conditions: any) => {
        await updateDisposition(id, { conditions });
    };

    const handleDelete = async (id: number) => {
        try {
            await api.deleteDisposition(campaignId, id);
            setDispositions(prev => prev.filter(d => d.id !== id));
            toast.success("Disposición eliminada");
        } catch (e: any) {
            toast.error(e.message || "Error al eliminar");
        }
    };

    const handleAdd = async () => {
        if (!editingCode.trim() || !editingLabel.trim()) {
            toast.error("Código y Etiqueta son requeridos");
            return;
        }
        try {
            const res = await api.createDisposition(campaignId, {
                code: editingCode.trim().toUpperCase(),
                label: editingLabel.trim(),
                sort_order: dispositions.length + 1,
                conditions: {},
                active: true,
            });
            setDispositions(prev => [...prev, res.data]);
            setEditingCode("");
            setEditingLabel("");
            setAddingNew(false);
            toast.success("Disposición creada");
        } catch (e: any) {
            toast.error(e.message || "Error al crear");
        }
    };

    const handleReset = async () => {
        try {
            const res = await api.resetDispositionsToDefaults(campaignId);
            setDispositions(res.data || []);
            setResetDialogOpen(false);
            toast.success("Disposiciones restauradas a valores por defecto");
        } catch (e: any) {
            toast.error(e.message || "Error al restaurar");
        }
    };

    const handleDragStart = (index: number) => {
        dragItem.current = index;
    };

    const handleDragEnter = (index: number) => {
        dragOverItem.current = index;
    };

    const handleDragEnd = async () => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        if (dragItem.current === dragOverItem.current) {
            dragItem.current = null;
            dragOverItem.current = null;
            return;
        }

        const reordered = [...dispositions];
        const [moved] = reordered.splice(dragItem.current, 1);
        reordered.splice(dragOverItem.current, 0, moved);

        const updated = reordered.map((d, i) => ({ ...d, sort_order: i + 1 }));
        setDispositions(updated);

        try {
            await api.reorderDispositions(campaignId, updated.map(d => d.id));
        } catch (e: any) {
            toast.error("Error al reordenar");
            loadDispositions();
        }

        dragItem.current = null;
        dragOverItem.current = null;
    };

    const updateConditionField = async (dispoId: number, field: string, value: any) => {
        const dispo = dispositions.find(d => d.id === dispoId);
        if (!dispo) return;
        const conds = { ...(dispo.conditions || {}) };
        if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
            delete conds[field];
        } else {
            conds[field] = value;
        }
        await saveConditions(dispoId, conds);
    };

    const getConditionTagStr = (dispoId: number, field: string): string => {
        const dispo = dispositions.find(d => d.id === dispoId);
        if (!dispo || !dispo.conditions || !dispo.conditions[field]) return "";
        if (Array.isArray(dispo.conditions[field])) return dispo.conditions[field].join(", ");
        return String(dispo.conditions[field]);
    };

    const parseTagInput = (input: string): string[] => {
        return input.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    };

    return (
        <Card className="shadow-sm border border-slate-200/60 bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden">
            <CardHeader className="py-4 border-b border-slate-100/50 bg-white/40">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                            <Code2 className="w-4 h-4" />
                        </div>
                        <div>
                            <CardTitle className="text-base">Disposiciones de Llamada</CardTitle>
                            <CardDescription className="text-xs">
                                Define cómo se clasifica cada llamada según su estado. Primera coincidencia gana.
                            </CardDescription>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setResetDialogOpen(true)}
                        >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Restaurar
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {loading ? (
                    <div className="p-8 text-center text-slate-500 text-sm">Cargando...</div>
                ) : (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/50">
                                    <TableHead className="w-8"></TableHead>
                                    <TableHead className="w-10 text-xs">#</TableHead>
                                    <TableHead className="text-xs">Código</TableHead>
                                    <TableHead className="text-xs">Etiqueta</TableHead>
                                    <TableHead className="text-xs">Color</TableHead>
                                    <TableHead className="text-xs">Condiciones</TableHead>
                                    <TableHead className="text-xs text-center">Activo</TableHead>
                                    <TableHead className="w-20"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {dispositions.map((dispo, index) => (
                                    <TableRow
                                        key={dispo.id}
                                        className={`${dispo.active ? '' : 'opacity-50'} ${expandedId === dispo.id ? 'bg-slate-50' : ''}`}
                                        draggable
                                        onDragStart={() => handleDragStart(index)}
                                        onDragEnter={() => handleDragEnter(index)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={(e) => e.preventDefault()}
                                    >
                                        <TableCell className="p-2 cursor-grab">
                                            <GripVertical className="w-3 h-3 text-slate-400" />
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-500 font-mono">{dispo.sort_order}</TableCell>
                                        <TableCell className="text-xs font-mono">
                                            <Input
                                                className="h-7 text-xs w-28 border-transparent hover:border-slate-200 focus:border-indigo-300 bg-transparent"
                                                value={dispo.code}
                                                onChange={(e) => updateDisposition(dispo.id, { code: e.target.value })}
                                                disabled={dispo.is_default}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                className="h-7 text-xs w-28 border-transparent hover:border-slate-200 focus:border-indigo-300 bg-transparent"
                                                value={dispo.label}
                                                onChange={(e) => updateDisposition(dispo.id, { label: e.target.value })}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {COLOR_OPTIONS.map(c => (
                                                    <button
                                                        key={c.value}
                                                        className={`w-5 h-5 rounded-full ${c.value} ${dispo.color === c.value ? 'ring-2 ring-offset-1 ring-indigo-500' : 'opacity-40 hover:opacity-80'}`}
                                                        title={c.label}
                                                        onClick={() => updateDisposition(dispo.id, { color: c.value })}
                                                    />
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <button
                                                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                                                onClick={() => setExpandedId(expandedId === dispo.id ? null : dispo.id)}
                                            >
                                                {Object.keys(dispo.conditions || {}).length} reglas
                                                {expandedId === dispo.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                            </button>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Switch
                                                checked={dispo.active}
                                                onCheckedChange={(v) => toggleActive(dispo.id, v)}
                                                className="scale-75"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                {!dispo.is_default && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"
                                                        onClick={() => handleDelete(dispo.id)}
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </Button>
                                                )}
                                                {dispo.is_default && (
                                                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-slate-200 text-slate-400">default</Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}

                                {/* Inline Add Row */}
                                {addingNew ? (
                                    <TableRow className="bg-indigo-50/50">
                                        <TableCell className="p-2"></TableCell>
                                        <TableCell className="text-xs text-slate-400 font-mono">N</TableCell>
                                        <TableCell>
                                            <Input
                                                className="h-7 text-xs w-28 bg-white"
                                                placeholder="CODIGO"
                                                value={editingCode}
                                                onChange={(e) => setEditingCode(e.target.value.toUpperCase())}
                                                autoFocus
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                className="h-7 text-xs w-28 bg-white"
                                                placeholder="Etiqueta"
                                                value={editingLabel}
                                                onChange={(e) => setEditingLabel(e.target.value)}
                                            />
                                        </TableCell>
                                        <TableCell colSpan={2}></TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex items-center gap-1 justify-center">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-green-500 hover:text-green-700 hover:bg-green-50"
                                                    onClick={handleAdd}
                                                >
                                                    <Check className="w-3 h-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-slate-400 hover:text-slate-600"
                                                    onClick={() => { setAddingNew(false); setEditingCode(""); setEditingLabel(""); }}
                                                >
                                                    <X className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                ) : (
                                    <TableRow className="hover:bg-slate-50 cursor-pointer" onClick={() => setAddingNew(true)}>
                                        <TableCell colSpan={8} className="text-center text-xs text-slate-400 py-3">
                                            <Plus className="w-3 h-3 inline mr-1" />
                                            Agregar disposición personalizada
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>

                        {/* Expanded Conditions Editor */}
                        {expandedId !== null && dispositions.find(d => d.id === expandedId) && (
                            <ConditionsEditor
                                dispo={dispositions.find(d => d.id === expandedId)!}
                                onUpdate={(field, value) => updateConditionField(expandedId, field, value)}
                            />
                        )}
                    </>
                )}
            </CardContent>

            {/* Reset confirmation */}
            <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Restaurar disposiciones?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se eliminarán todas las disposiciones personalizadas y se restaurarán las 11 disposiciones por defecto.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleReset} className="bg-amber-600 hover:bg-amber-700">
                            Restaurar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

// ─── Inline Conditions Editor ────────────────────────────────────────

function ConditionsEditor({ dispo, onUpdate }: { dispo: Disposition; onUpdate: (field: string, value: any) => void }) {
    const conds = dispo.conditions || {};

    const callStatuses = ["DIALING","IVR_START","ANSWER","HANGUP","COMPLET","FAILED","XFER","BUSY","CONGESTION","NA","RINGING","AA","N","B","DROP","PDROP","XDROP","DNC","DNCC","AM","AL","SALE","UP"];
    const leadStatuses = ["NEW","QUEUE","SALE","PU","PM","XFER","NA","AA","N","B","AB","DROP","XDROP","PDROP","AM","AL","DNC","DNCC","COMPLET","ANSWER","A"];
    const dtmfOptions = ["0","1","2","3","4","5","6","7","8","9","TIMEOUT","NONE"];

    return (
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/30 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* call_status */}
                <div>
                    <Label className="text-xs font-semibold text-slate-500 mb-1 block">call_status (cualquiera de)</Label>
                    <div className="flex flex-wrap gap-1">
                        {callStatuses.map(s => {
                            const selected = Array.isArray(conds.call_status) && conds.call_status.includes(s);
                            return (
                                <button
                                    key={s}
                                    className={`px-1.5 py-0.5 text-[10px] rounded border ${selected ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                    onClick={() => {
                                        const arr = Array.isArray(conds.call_status) ? [...conds.call_status] : [];
                                        if (selected) {
                                            onUpdate("call_status", arr.filter(x => x !== s));
                                        } else {
                                            arr.push(s);
                                            onUpdate("call_status", arr);
                                        }
                                    }}
                                >
                                    {s}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* lead_status */}
                <div>
                    <Label className="text-xs font-semibold text-slate-500 mb-1 block">lead_status (cualquiera de)</Label>
                    <div className="flex flex-wrap gap-1">
                        {leadStatuses.map(s => {
                            const selected = Array.isArray(conds.lead_status) && conds.lead_status.includes(s);
                            return (
                                <button
                                    key={s}
                                    className={`px-1.5 py-0.5 text-[10px] rounded border ${selected ? 'bg-teal-100 border-teal-300 text-teal-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                    onClick={() => {
                                        const arr = Array.isArray(conds.lead_status) ? [...conds.lead_status] : [];
                                        if (selected) {
                                            onUpdate("lead_status", arr.filter(x => x !== s));
                                        } else {
                                            arr.push(s);
                                            onUpdate("lead_status", arr);
                                        }
                                    }}
                                >
                                    {s}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* dtmf */}
                <div>
                    <Label className="text-xs font-semibold text-slate-500 mb-1 block">DTMF (cualquiera de)</Label>
                    <div className="flex flex-wrap gap-1">
                        {dtmfOptions.map(s => {
                            const selected = Array.isArray(conds.dtmf) && conds.dtmf.includes(s);
                            return (
                                <button
                                    key={s}
                                    className={`px-1.5 py-0.5 text-[10px] rounded border ${selected ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                    onClick={() => {
                                        const arr = Array.isArray(conds.dtmf) ? [...conds.dtmf] : [];
                                        if (selected) {
                                            onUpdate("dtmf", arr.filter(x => x !== s));
                                        } else {
                                            arr.push(s);
                                            onUpdate("dtmf", arr);
                                        }
                                    }}
                                >
                                    {s}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Boolean + number conditions */}
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={conds.exclude_typification === true}
                                onCheckedChange={(v) => onUpdate("exclude_typification", v ? true : undefined)}
                                className="scale-75"
                            />
                            <Label className="text-xs text-slate-600">Excluir si tiene tipificación</Label>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={conds.require_typification === true}
                                onCheckedChange={(v) => onUpdate("require_typification", v ? true : undefined)}
                                className="scale-75"
                            />
                            <Label className="text-xs text-slate-600">Requerir tipificación</Label>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Label className="text-xs text-slate-600">Duración mínima (seg):</Label>
                        <Input
                            type="number"
                            className="h-7 w-20 text-xs"
                            placeholder="0"
                            value={conds.min_duration ?? ""}
                            onChange={(e) => {
                                const v = parseInt(e.target.value);
                                onUpdate("min_duration", isNaN(v) ? undefined : v);
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
