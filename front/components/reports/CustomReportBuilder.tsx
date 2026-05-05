import { useState, useEffect, useMemo } from "react";
import api from "@/services/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Loader2, Save, Search, Globe2, Lock as LockIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";

export interface ColumnCatalogItem {
    id: string;
    label: string;
    group: string;
    type: string;
}

export interface ReportTemplate {
    id?: number;
    name: string;
    description?: string;
    scope: "multi_campaign" | "single_campaign";
    is_shared: boolean;
    definition: {
        scope?: "multi_campaign" | "single_campaign";
        campaigns?: string[];
        columns?: string[];
        filters?: {
            status?: string[];
            direction?: "OUTBOUND" | "INBOUND";
            min_duration?: number;
            has_dtmf?: boolean;
            list_ids?: number[];
        };
        sort?: { by: string; dir: "asc" | "desc" };
    };
    owner_user_id?: number | null;
    owner_username?: string | null;
}

interface Props {
    open: boolean;
    onClose: () => void;
    /** Si se proporciona, edita; si no, crea */
    template?: ReportTemplate | null;
    onSaved: (tpl: ReportTemplate) => void;
}

const CALL_STATUS_OPTIONS = [
    "ANSWER", "SALE", "DROP", "NA", "NOANSWER", "BUSY", "CANCEL", "DNC", "TIMEOUT", "FAIL", "CONGESTION",
];

const isEditableByUser = (tpl: ReportTemplate | null | undefined, isAdmin: boolean, currentUsername?: string | null): boolean => {
    if (!tpl?.id) return true; // creación
    if (isAdmin) return true;
    return Boolean(currentUsername) && tpl.owner_username === currentUsername;
};

export function CustomReportBuilder({ open, onClose, template, onSaved }: Props) {
    const { isAdmin, getUser } = useAuthStore();
    const isAdminUser = isAdmin();
    const currentUsername = getUser()?.id ?? null;

    const [catalog, setCatalog] = useState<ColumnCatalogItem[]>([]);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [scope, setScope] = useState<"multi_campaign" | "single_campaign">("multi_campaign");
    const [isShared, setIsShared] = useState(true);
    const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
    const [statusFilter, setStatusFilter] = useState<string[]>([]);
    const [direction, setDirection] = useState<"" | "OUTBOUND" | "INBOUND">("");
    const [minDuration, setMinDuration] = useState<string>("");
    const [hasDtmf, setHasDtmf] = useState(false);
    const [columnSearch, setColumnSearch] = useState("");
    const [saving, setSaving] = useState(false);
    const [loadingCatalog, setLoadingCatalog] = useState(true);

    const editable = isEditableByUser(template, isAdminUser, currentUsername);

    // Cargar catálogo
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
            try {
                setLoadingCatalog(true);
                const res = await api.getReportColumnCatalog();
                if (!cancelled && res.success && res.data) setCatalog(res.data);
            } catch {
                toast.error("No se pudo cargar el catálogo de columnas");
            } finally {
                if (!cancelled) setLoadingCatalog(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open]);

    // Inicializar formulario al abrir
    useEffect(() => {
        if (!open) return;
        if (template) {
            setName(template.name || "");
            setDescription(template.description || "");
            setScope(template.scope || "multi_campaign");
            setIsShared(Boolean(template.is_shared));
            setSelectedColumns(new Set(template.definition?.columns || []));
            setStatusFilter(template.definition?.filters?.status || []);
            setDirection((template.definition?.filters?.direction as any) || "");
            setMinDuration(
                template.definition?.filters?.min_duration != null
                    ? String(template.definition.filters.min_duration)
                    : ""
            );
            setHasDtmf(Boolean(template.definition?.filters?.has_dtmf));
        } else {
            setName("");
            setDescription("");
            setScope("multi_campaign");
            setIsShared(true);
            setSelectedColumns(new Set([
                "call_date", "campaign_id", "phone_number", "call_status", "call_duration",
            ]));
            setStatusFilter([]);
            setDirection("");
            setMinDuration("");
            setHasDtmf(false);
        }
    }, [open, template]);

    const groupedCatalog = useMemo(() => {
        const groups: Record<string, ColumnCatalogItem[]> = {};
        const filtered = catalog.filter((c) =>
            !columnSearch || c.label.toLowerCase().includes(columnSearch.toLowerCase()) || c.id.toLowerCase().includes(columnSearch.toLowerCase())
        );
        for (const c of filtered) {
            if (!groups[c.group]) groups[c.group] = [];
            groups[c.group].push(c);
        }
        return groups;
    }, [catalog, columnSearch]);

    const toggleColumn = (id: string) => {
        if (!editable) return;
        setSelectedColumns((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleStatus = (s: string) => {
        if (!editable) return;
        setStatusFilter((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error("El nombre es obligatorio");
            return;
        }
        if (selectedColumns.size === 0) {
            toast.error("Selecciona al menos una columna");
            return;
        }
        const payload = {
            name: name.trim(),
            description: description.trim(),
            scope,
            is_shared: isShared,
            definition: {
                scope,
                columns: Array.from(selectedColumns),
                filters: {
                    ...(statusFilter.length > 0 ? { status: statusFilter } : {}),
                    ...(direction ? { direction } : {}),
                    ...(minDuration && Number(minDuration) > 0 ? { min_duration: Number(minDuration) } : {}),
                    ...(hasDtmf ? { has_dtmf: true } : {}),
                },
                sort: { by: "call_date", dir: "desc" as const },
            },
        };
        try {
            setSaving(true);
            const res = template?.id
                ? await api.updateReportTemplate(template.id, payload)
                : await api.createReportTemplate(payload);
            if (res.success && res.data) {
                toast.success(template?.id ? "Plantilla actualizada" : "Plantilla creada");
                onSaved(res.data);
                onClose();
            } else {
                toast.error(res.error || "Error al guardar");
            }
        } catch (e: any) {
            toast.error(e?.message || "Error al guardar");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
                <div className="p-6 pb-3 border-b border-slate-100">
                    <DialogHeader>
                        <DialogTitle>{template?.id ? "Editar plantilla" : "Nueva plantilla de reporte"}</DialogTitle>
                        <DialogDescription>
                            Define qué columnas y filtros componen el reporte. El rango de fechas y las campañas se eligen al ejecutar.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6 py-4 max-h-[65vh] overflow-y-auto">
                    {/* Columna izquierda: identificación + filtros */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-slate-600 mb-1 block">Nombre</label>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Llamadas contestadas semana actual" disabled={!editable} />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-600 mb-1 block">Descripción</label>
                            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" disabled={!editable} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-slate-600 mb-1 block">Alcance</label>
                                <select
                                    value={scope}
                                    onChange={(e) => setScope(e.target.value as any)}
                                    disabled={!editable}
                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                >
                                    <option value="multi_campaign">Multi-campaña (consolidado)</option>
                                    <option value="single_campaign">Una sola campaña</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600 mb-1 block">Visibilidad</label>
                                <button
                                    type="button"
                                    onClick={() => editable && setIsShared(!isShared)}
                                    disabled={!editable}
                                    className={`w-full text-sm border rounded-lg px-3 py-2 flex items-center gap-2 ${isShared ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700"}`}
                                >
                                    {isShared ? <Globe2 className="w-4 h-4" /> : <LockIcon className="w-4 h-4" />}
                                    <span>{isShared ? "Compartida" : "Privada (solo yo)"}</span>
                                </button>
                            </div>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                            <h3 className="text-sm font-medium text-slate-700 mb-2">Filtros</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">Estados de llamada</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {CALL_STATUS_OPTIONS.map((s) => (
                                            <button
                                                key={s}
                                                onClick={() => toggleStatus(s)}
                                                disabled={!editable}
                                                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${statusFilter.includes(s) ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-slate-500 mb-1 block">Dirección</label>
                                        <select
                                            value={direction}
                                            onChange={(e) => setDirection(e.target.value as any)}
                                            disabled={!editable}
                                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                        >
                                            <option value="">Todas</option>
                                            <option value="OUTBOUND">Salientes</option>
                                            <option value="INBOUND">Entrantes</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-500 mb-1 block">Duración mín. (s)</label>
                                        <Input
                                            type="number"
                                            min="0"
                                            value={minDuration}
                                            onChange={(e) => setMinDuration(e.target.value)}
                                            disabled={!editable}
                                            className="text-xs h-8"
                                        />
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={hasDtmf}
                                        disabled={!editable}
                                        onChange={(e) => setHasDtmf(e.target.checked)}
                                        className="rounded border-slate-300"
                                    />
                                    Solo llamadas con DTMF capturado
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Columna derecha: catálogo */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-medium text-slate-700">Columnas del reporte</h3>
                            <span className="text-xs text-slate-500">{selectedColumns.size} seleccionada{selectedColumns.size !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="relative mb-2">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar columna..."
                                value={columnSearch}
                                onChange={(e) => setColumnSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                            />
                        </div>
                        <div className="border border-slate-100 rounded-lg max-h-[420px] overflow-y-auto">
                            {loadingCatalog ? (
                                <div className="flex items-center justify-center py-8 text-slate-400">
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando columnas...
                                </div>
                            ) : (
                                Object.entries(groupedCatalog).map(([group, items]) => (
                                    <div key={group} className="border-b border-slate-50 last:border-b-0">
                                        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50">
                                            {group}
                                        </div>
                                        {items.map((c) => (
                                            <label
                                                key={c.id}
                                                className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50 ${!editable ? "opacity-60 cursor-not-allowed" : ""}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedColumns.has(c.id)}
                                                    onChange={() => toggleColumn(c.id)}
                                                    disabled={!editable}
                                                    className="rounded border-slate-300"
                                                />
                                                <span className="text-slate-700">{c.label}</span>
                                                <span className="text-[10px] text-slate-400 font-mono ml-auto">{c.id}</span>
                                            </label>
                                        ))}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving || !editable}
                        className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {template?.id ? "Guardar cambios" : "Crear plantilla"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
