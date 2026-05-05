import { useEffect, useState } from "react";
import api from "@/services/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "../ui/button";
import { Plus, Edit3, Trash2, Play, Loader2, FileSpreadsheet, Globe2, Lock as LockIcon, Search } from "lucide-react";
import { toast } from "sonner";
import { CustomReportBuilder, ReportTemplate } from "./CustomReportBuilder";

interface Props {
    onRun: (template: ReportTemplate) => void;
}

export function CustomReportsList({ onRun }: Props) {
    const { hasRolePermission, isAdmin, getUser } = useAuthStore();
    const isAdminUser = isAdmin();
    const currentUsername = getUser()?.id ?? null;

    const canCreate = hasRolePermission("create_custom_reports");
    const canEdit = hasRolePermission("edit_custom_reports");
    const canDelete = hasRolePermission("delete_custom_reports");

    const [templates, setTemplates] = useState<ReportTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [builderOpen, setBuilderOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const load = async () => {
        try {
            setLoading(true);
            const res = await api.listReportTemplates();
            if (res.success && res.data) {
                setTemplates(res.data);
            }
        } catch {
            toast.error("Error al cargar plantillas");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleSaved = () => { load(); };

    const handleDelete = async (tpl: ReportTemplate) => {
        if (!tpl.id) return;
        if (!window.confirm(`¿Eliminar la plantilla "${tpl.name}"? Esta acción no se puede deshacer.`)) return;
        try {
            setDeletingId(tpl.id);
            const res = await api.deleteReportTemplate(tpl.id);
            if (res.success) {
                toast.success("Plantilla eliminada");
                setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
            } else {
                toast.error(res.error || "Error al eliminar");
            }
        } catch (e: any) {
            toast.error(e?.message || "Error al eliminar");
        } finally {
            setDeletingId(null);
        }
    };

    const isOwnTemplate = (tpl: ReportTemplate) =>
        Boolean(currentUsername) && tpl.owner_username === currentUsername;

    const filtered = templates.filter((t) =>
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || "").toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full gap-3">
            {/* Header bar */}
            <div className="flex-shrink-0 flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar plantilla..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                </div>
                {canCreate && (
                    <Button
                        onClick={() => { setEditingTemplate(null); setBuilderOpen(true); }}
                        className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Plus className="w-4 h-4" /> Nueva plantilla
                    </Button>
                )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto min-h-0 custom-scrollbar">
                {loading ? (
                    <div className="h-full flex items-center justify-center text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando plantillas...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-300">
                        <FileSpreadsheet className="w-12 h-12" />
                        <p className="text-sm text-slate-400">
                            {templates.length === 0
                                ? "Aún no hay plantillas personalizadas"
                                : "Ningún resultado coincide con la búsqueda"}
                        </p>
                        {canCreate && templates.length === 0 && (
                            <Button
                                size="sm"
                                onClick={() => { setEditingTemplate(null); setBuilderOpen(true); }}
                                className="gap-1.5 mt-2 bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <Plus className="w-4 h-4" /> Crear la primera
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {filtered.map((tpl) => {
                            const owns = isOwnTemplate(tpl);
                            const canEditThis = canEdit && (isAdminUser || owns);
                            const canDeleteThis = canDelete && (isAdminUser || owns);
                            const numCols = tpl.definition?.columns?.length || 0;
                            return (
                                <div
                                    key={tpl.id}
                                    className="bg-white/80 backdrop-blur border border-white rounded-2xl shadow-sm p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold text-slate-900 truncate">{tpl.name}</h3>
                                                {tpl.is_shared
                                                    ? <Globe2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                                                    : <LockIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                                                {tpl.description || <span className="italic text-slate-300">Sin descripción</span>}
                                            </p>
                                        </div>
                                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${tpl.scope === "single_campaign" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
                                            {tpl.scope === "single_campaign" ? "1 campaña" : "Multi"}
                                        </span>
                                    </div>

                                    <div className="text-xs text-slate-500 flex items-center gap-3 border-t border-slate-100 pt-2">
                                        <span><span className="font-mono text-slate-700">{numCols}</span> col.</span>
                                        {tpl.owner_username && <span>· {tpl.owner_username}</span>}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            onClick={() => onRun(tpl)}
                                            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white flex-1"
                                        >
                                            <Play className="w-3.5 h-3.5" /> Ejecutar
                                        </Button>
                                        {canEditThis && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => { setEditingTemplate(tpl); setBuilderOpen(true); }}
                                                className="gap-1"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                        {canDeleteThis && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleDelete(tpl)}
                                                disabled={deletingId === tpl.id}
                                                className="gap-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-100"
                                            >
                                                {deletingId === tpl.id
                                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    : <Trash2 className="w-3.5 h-3.5" />}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <CustomReportBuilder
                open={builderOpen}
                onClose={() => setBuilderOpen(false)}
                template={editingTemplate}
                onSaved={handleSaved}
            />
        </div>
    );
}
