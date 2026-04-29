import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { StandardPageHeader } from "./ui/layout/StandardPageHeader";
import { useAuthStore } from "@/stores/authStore";
import { Input } from "./ui/input";
import {
    ShieldBan, Plus, Trash2, Upload, Download, Search, X,
    ChevronLeft, ChevronRight, Brain, ToggleLeft, ToggleRight, Edit2, Globe
} from "lucide-react";
import { toast } from "sonner";
import api from "@/services/api";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "./ui/alert-dialog";

interface DncEntry {
    id: number;
    phone_number: string;
    campaign_id: string | null;
    added_at: string;
}

interface DncRule {
    id: number;
    name: string;
    country_code: string;
    max_calls: number;
    period_hours: number;
    is_active: boolean;
    applies_to: string;
    created_at: string;
}

interface Campaign {
    campaign_id: string;
    campaign_name: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
    CO: '🇨🇴', MX: '🇲🇽', US: '🇺🇸', AR: '🇦🇷', CL: '🇨🇱', PE: '🇵🇪', EC: '🇪🇨', BR: '🇧🇷', ES: '🇪🇸',
};

export function BlacklistManager() {
    const { hasRolePermission, getUser } = useAuthStore();
    const currentUser = getUser();
    const [activeTab, setActiveTab] = useState<'numbers' | 'rules'>('numbers');

    // Numbers tab state
    const [numbers, setNumbers] = useState<DncEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [newNumber, setNewNumber] = useState("");
    const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, pages: 0 });
    const [numberToDelete, setNumberToDelete] = useState<string | null>(null);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState<string>("");

    // Rules tab state
    const [rules, setRules] = useState<DncRule[]>([]);
    const [rulesLoading, setRulesLoading] = useState(false);
    const [showRuleForm, setShowRuleForm] = useState(false);
    const [editingRule, setEditingRule] = useState<DncRule | null>(null);
    const [ruleForm, setRuleForm] = useState({ name: '', country_code: 'CO', max_calls: 3, period_hours: 720, applies_to: 'ALL' });

    // Load campaigns on mount
    useEffect(() => {
        loadCampaigns();
    }, []);

    // Load numbers when campaign changes
    useEffect(() => {
        fetchNumbers(1, searchTerm);
    }, [selectedCampaign]);

    const loadCampaigns = async () => {
        try {
            const result = await api.getCampaigns();
            if (result.success && result.data) {
                setCampaigns(result.data);
            }
        } catch (error) {
            console.error('Error loading campaigns:', error);
        }
    };

    const fetchNumbers = async (page = 1, search = "") => {
        setLoading(true);
        try {
            const result = await api.getDncList(20, page, search, selectedCampaign || undefined);
            if (result.success) {
                setNumbers(result.data || []);
                setPagination(result.pagination || { total: 0, page: 1, limit: 20, pages: 0 });
            }
        } catch (error) {
            toast.error("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const fetchRules = async () => {
        setRulesLoading(true);
        try {
            const result = await api.getDncRules();
            if (result.success) {
                setRules(result.data || []);
            }
        } catch (error) {
            toast.error("Error al cargar reglas");
        } finally {
            setRulesLoading(false);
        }
    };

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= pagination.pages) {
            fetchNumbers(newPage, searchTerm);
        }
    };

    const handleAddNumber = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newNumber.trim()) return;

        try {
            await api.addDncNumber(newNumber.trim(), selectedCampaign || undefined);
            toast.success("Número agregado a la blacklist");
            setNewNumber("");
            fetchNumbers(pagination.page, searchTerm);
        } catch (error: any) {
            toast.error(error.message || "Error al agregar número");
        }
    };

    const handleDownloadTemplate = () => {
        const csvContent = "phone_number\n3001234567\n3009876543\n";
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "blacklist_template.csv";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Plantilla descargada");
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const result = await api.uploadDncFile(file, selectedCampaign || undefined);
            if (result.success) {
                toast.success(`Importados: ${result.data.inserted}, Omitidos: ${result.data.skipped}`);
                fetchNumbers(1, searchTerm);
            }
        } catch (error: any) {
            toast.error(error.message || "Error al importar");
        }
        e.target.value = "";
    };

    const handleDeleteNumber = async (itemCampaignId?: string | null) => {
        if (!numberToDelete) return;
        try {
            await api.removeDncNumber(numberToDelete, itemCampaignId || selectedCampaign || undefined);
            toast.success("Número eliminado");
            setNumberToDelete(null);
            fetchNumbers(pagination.page, searchTerm);
        } catch (error: any) {
            toast.error(error.message || "Error al eliminar");
        }
    };

    const handleClearAll = async () => {
        try {
            const result = await api.clearAllDncNumbers(selectedCampaign || undefined);
            if (result.success) {
                toast.success(result.message || "Blacklist limpiada");
                fetchNumbers(1, "");
                setSearchTerm("");
            }
        } catch (error: any) {
            toast.error(error.message || "Error al limpiar");
        }
    };

    // Rules handlers
    const handleSaveRule = async () => {
        try {
            if (editingRule) {
                await api.updateDncRule(editingRule.id, ruleForm);
                toast.success("Regla actualizada");
            } else {
                await api.createDncRule(ruleForm);
                toast.success("Regla creada");
            }
            setShowRuleForm(false);
            setEditingRule(null);
            setRuleForm({ name: '', country_code: 'CO', max_calls: 3, period_hours: 720, applies_to: 'ALL' });
            fetchRules();
        } catch (error: any) {
            toast.error(error.message || "Error al guardar regla");
        }
    };

    const handleToggleRule = async (rule: DncRule) => {
        try {
            await api.updateDncRule(rule.id, { is_active: !rule.is_active });
            toast.success(rule.is_active ? "Regla desactivada" : "Regla activada");
            fetchRules();
        } catch (error: any) {
            toast.error(error.message || "Error");
        }
    };

    const handleDeleteRule = async (id: number) => {
        try {
            await api.deleteDncRule(id);
            toast.success("Regla eliminada");
            fetchRules();
        } catch (error: any) {
            toast.error(error.message || "Error al eliminar");
        }
    };

    const handleEditRule = (rule: DncRule) => {
        setEditingRule(rule);
        setRuleForm({
            name: rule.name,
            country_code: rule.country_code,
            max_calls: rule.max_calls,
            period_hours: rule.period_hours,
            applies_to: rule.applies_to,
        });
        setShowRuleForm(true);
    };

    const periodToLabel = (hours: number) => {
        if (hours < 24) return `${hours} horas`;
        const days = Math.round(hours / 24);
        if (days === 1) return '1 día';
        if (days === 7) return '1 semana';
        if (days === 30) return '1 mes';
        return `${days} días`;
    };

    return (
        <div className="space-y-6">
        <div className="space-y-6 relative z-20">
            <StandardPageHeader
                title="BLACKLIST"
                username={currentUser?.name || ''}
                description="Administra los números bloqueados por campaña y reglas inteligentes."
            />

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('numbers')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'numbers'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <ShieldBan className="w-4 h-4 inline mr-2" />
                    Números Bloqueados
                </button>
                <button
                    onClick={() => { setActiveTab('rules'); if (rules.length === 0) fetchRules(); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'rules'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Brain className="w-4 h-4 inline mr-2" />
                    Reglas Inteligentes
                </button>
            </div>
        </div>

            {/* === NUMBERS TAB === */}
            {activeTab === 'numbers' && (
                <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/60 p-6">
                    {/* Campaign Selector + Actions Row */}
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        {/* Campaign selector */}
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-slate-600">Campaña:</label>
                            <select
                                value={selectedCampaign}
                                onChange={(e) => setSelectedCampaign(e.target.value)}
                                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
                            >
                                <option value="">Todas las campañas</option>
                                {campaigns.map((c) => (
                                    <option key={c.campaign_id} value={c.campaign_id}>
                                        {c.campaign_name || c.campaign_id}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex-1" />

                        {/* Actions */}
                        <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                            <Download className="w-4 h-4 mr-1" /> Descargar Plantilla
                        </Button>

                        <label className="cursor-pointer">
                            <Button variant="outline" size="sm" asChild>
                                <span><Upload className="w-4 h-4 mr-1" /> Importar CSV</span>
                            </Button>
                            <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
                        </label>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                    <Trash2 className="w-4 h-4 mr-1" /> Limpiar Todo
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Limpiar toda la blacklist{selectedCampaign ? ` de ${selectedCampaign}` : ''}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción eliminará {selectedCampaign ? `todos los números bloqueados de la campaña ${selectedCampaign}` : 'TODOS los números bloqueados de TODAS las campañas'}. No se puede deshacer.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleClearAll} className="bg-red-600 hover:bg-red-700">Eliminar Todo</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>

                    {/* Search + Add Row */}
                    <div className="flex gap-3 mb-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Buscar número..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    fetchNumbers(1, e.target.value);
                                }}
                                className="pl-9 bg-white"
                            />
                        </div>

                        <form onSubmit={handleAddNumber} className="flex gap-2">
                            <Input
                                placeholder="Ej: 3001234567"
                                value={newNumber}
                                onChange={(e) => setNewNumber(e.target.value)}
                                className="w-48 bg-white"
                            />
                            <Button type="submit" size="sm" className="bg-slate-900 hover:bg-slate-800">
                                <Plus className="w-4 h-4 mr-1" /> Añadir Número
                            </Button>
                        </form>
                    </div>

                    {/* Table */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Número Telefónico</th>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Campaña</th>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Fecha</th>
                                    <th className="text-right px-4 py-3 font-semibold text-slate-700">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={4} className="text-center py-8 text-slate-400">Cargando...</td></tr>
                                ) : numbers.length === 0 ? (
                                    <tr><td colSpan={4} className="text-center py-8 text-blue-400 italic">No hay números en la lista negra.</td></tr>
                                ) : (
                                    numbers.map((entry) => (
                                        <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                            <td className="px-4 py-3 font-mono text-slate-800">{entry.phone_number}</td>
                                            <td className="px-4 py-3">
                                                {entry.campaign_id ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                                        {entry.campaign_id}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-50 text-slate-500 border border-slate-200">
                                                        <Globe className="w-3 h-3 mr-1" /> Global
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 text-xs">
                                                {new Date(entry.added_at).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>¿Eliminar {entry.phone_number}?</AlertDialogTitle>
                                                            <AlertDialogDescription>El número será removido de la blacklist.</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => {
                                                                    setNumberToDelete(entry.phone_number);
                                                                    // Usamos el ID de la campaña específica de esta fila si existe, no del filtro general
                                                                    setTimeout(() => handleDeleteNumber(entry.campaign_id), 0);
                                                                }}
                                                                className="bg-red-600 hover:bg-red-700"
                                                            >
                                                                Eliminar
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {pagination.pages > 1 && (
                        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
                            <span>{pagination.total} números en total</span>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => handlePageChange(pagination.page - 1)}>
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <span>Página {pagination.page} de {pagination.pages}</span>
                                <Button variant="outline" size="sm" disabled={pagination.page >= pagination.pages} onClick={() => handlePageChange(pagination.page + 1)}>
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* === RULES TAB === */}
            {activeTab === 'rules' && (
                <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/60 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800">Reglas de Auto-Bloqueo</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                Define límites de llamadas por período. Los números que excedan el límite serán bloqueados automáticamente.
                            </p>
                        </div>
                        <Button
                            size="sm"
                            className="bg-slate-900 hover:bg-slate-800"
                            onClick={() => {
                                setEditingRule(null);
                                setRuleForm({ name: '', country_code: 'CO', max_calls: 3, period_hours: 720, applies_to: 'ALL' });
                                setShowRuleForm(true);
                            }}
                        >
                            <Plus className="w-4 h-4 mr-1" /> Nueva Regla
                        </Button>
                    </div>

                    {/* Rule Form */}
                    {showRuleForm && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
                            <h4 className="font-medium text-slate-700 mb-4">
                                {editingRule ? 'Editar Regla' : 'Nueva Regla'}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Nombre</label>
                                    <Input
                                        value={ruleForm.name}
                                        onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                                        placeholder="Ej: Ley Dejen de Fregar"
                                        className="bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">País</label>
                                    <select
                                        value={ruleForm.country_code}
                                        onChange={(e) => setRuleForm({ ...ruleForm, country_code: e.target.value })}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                                    >
                                        <option value="CO">🇨🇴 Colombia</option>
                                        <option value="MX">🇲🇽 México</option>
                                        <option value="US">🇺🇸 Estados Unidos</option>
                                        <option value="AR">🇦🇷 Argentina</option>
                                        <option value="CL">🇨🇱 Chile</option>
                                        <option value="PE">🇵🇪 Perú</option>
                                        <option value="EC">🇪🇨 Ecuador</option>
                                        <option value="BR">🇧🇷 Brasil</option>
                                        <option value="ES">🇪🇸 España</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Máx. Llamadas</label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={ruleForm.max_calls}
                                        onChange={(e) => setRuleForm({ ...ruleForm, max_calls: parseInt(e.target.value) })}
                                        className="bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Período</label>
                                    <select
                                        value={ruleForm.period_hours}
                                        onChange={(e) => setRuleForm({ ...ruleForm, period_hours: parseInt(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                                    >
                                        <option value={24}>24 horas</option>
                                        <option value={48}>48 horas</option>
                                        <option value={168}>1 semana</option>
                                        <option value={336}>2 semanas</option>
                                        <option value={720}>30 días</option>
                                        <option value={2160}>90 días</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Aplica a</label>
                                    <select
                                        value={ruleForm.applies_to}
                                        onChange={(e) => setRuleForm({ ...ruleForm, applies_to: e.target.value })}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                                    >
                                        <option value="ALL">Todas las campañas</option>
                                        {campaigns.map((c) => (
                                            <option key={c.campaign_id} value={c.campaign_id}>
                                                {c.campaign_name || c.campaign_id}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-2 mt-4">
                                <Button size="sm" onClick={handleSaveRule} className="bg-blue-600 hover:bg-blue-700">
                                    {editingRule ? 'Actualizar' : 'Crear'} Regla
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setShowRuleForm(false); setEditingRule(null); }}>
                                    Cancelar
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Rules Table */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Estado</th>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Nombre</th>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-700">País</th>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Límite</th>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Aplica a</th>
                                    <th className="text-right px-4 py-3 font-semibold text-slate-700">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rulesLoading ? (
                                    <tr><td colSpan={6} className="text-center py-8 text-slate-400">Cargando...</td></tr>
                                ) : rules.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-8 text-blue-400 italic">No hay reglas configuradas.</td></tr>
                                ) : (
                                    rules.map((rule) => (
                                        <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                            <td className="px-4 py-3">
                                                <button onClick={() => handleToggleRule(rule)} className="focus:outline-none">
                                                    {rule.is_active ? (
                                                        <ToggleRight className="w-6 h-6 text-green-500" />
                                                    ) : (
                                                        <ToggleLeft className="w-6 h-6 text-slate-300" />
                                                    )}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 font-medium text-slate-800">{rule.name}</td>
                                            <td className="px-4 py-3">
                                                <span className="text-lg mr-1">{COUNTRY_FLAGS[rule.country_code.trim()] || '🌐'}</span>
                                                <span className="text-sm text-slate-600">{rule.country_code.trim()}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                                    {rule.max_calls} llamadas / {periodToLabel(rule.period_hours)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {rule.applies_to === 'ALL' ? (
                                                    <span className="text-sm text-slate-500">Todas</span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                                        {rule.applies_to}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="sm" onClick={() => handleEditRule(rule)} className="text-slate-500 hover:text-blue-600">
                                                        <Edit2 className="w-4 h-4" />
                                                    </Button>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>¿Eliminar regla "{rule.name}"?</AlertDialogTitle>
                                                                <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDeleteRule(rule.id)} className="bg-red-600 hover:bg-red-700">
                                                                    Eliminar
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
