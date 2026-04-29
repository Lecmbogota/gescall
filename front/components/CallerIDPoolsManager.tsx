import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { StandardPageHeader } from "./ui/layout/StandardPageHeader";
import { useAuthStore } from "@/stores/authStore";
import { Input } from "./ui/input";
import { Search, Plus, Trash2, ArrowLeft, ArrowRight, Phone, Users, ToggleLeft, ToggleRight, Upload, FileText, ArrowLeftCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import apiService from "../services/api";
import { toast } from "sonner";
import { Badge } from "./ui/badge";
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

interface Pool {
    id: number;
    name: string;
    description: string;
    country_code: string;
    is_active: number;
    total_numbers: number;
    active_numbers: number;
    created_at: string;
}

interface PoolNumber {
    id: number;
    pool_id: number;
    callerid: string;
    area_code: string;
    is_active: number;
    last_used_at: string | null;
    use_count: number;
}

interface AreaCode {
    area_code: string;
    count: number;
    total_uses: number;
}

export function CallerIDPoolsManager() {
    // Pool list state
    const [pools, setPools] = useState<Pool[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });

    // Pool detail state
    const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
    const [poolNumbers, setPoolNumbers] = useState<PoolNumber[]>([]);
    const [poolAreaCodes, setPoolAreaCodes] = useState<AreaCode[]>([]);
    const [numbersPagination, setNumbersPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
    const [numbersSearch, setNumbersSearch] = useState("");
    const [activeTab, setActiveTab] = useState("numbers");

    // Create/Edit modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPool, setEditingPool] = useState<Pool | null>(null);
    const [poolName, setPoolName] = useState("");
    const [poolDescription, setPoolDescription] = useState("");
    const [poolCountry, setPoolCountry] = useState("CO");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Add number modal
    const [isAddNumberOpen, setIsAddNumberOpen] = useState(false);
    const [newCallerID, setNewCallerID] = useState("");

    // Import modal
    const [importText, setImportText] = useState("");
    const [isImporting, setIsImporting] = useState(false);

    // Delete dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [poolToDelete, setPoolToDelete] = useState<Pool | null>(null);

    const user = useAuthStore(state => state.getUser());

    // Fetch pools
    const fetchPools = async (page = 1, search = "") => {
        setLoading(true);
        try {
            const response = await apiService.getCallerIdPools(pagination.limit, page, search);
            if (response.success) {
                setPools(response.data);
                setPagination(response.pagination);
            } else {
                toast.error("Error al cargar pools");
            }
        } catch (error: any) {
            console.error("Error fetching pools:", error);
            toast.error("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    // Fetch pool numbers
    const fetchPoolNumbers = async (poolId: number, page = 1, search = "") => {
        try {
            const response = await apiService.getPoolNumbers(poolId, numbersPagination.limit, page, search);
            if (response.success) {
                setPoolNumbers(response.data);
                setNumbersPagination(response.pagination);
            }
        } catch (error) {
            console.error("Error fetching numbers:", error);
        }
    };

    // Fetch area codes
    const fetchAreaCodes = async (poolId: number) => {
        try {
            const response = await apiService.getPoolAreaCodes(poolId);
            if (response.success) {
                setPoolAreaCodes(response.data);
            }
        } catch (error) {
            console.error("Error fetching area codes:", error);
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (selectedPool) {
                fetchPoolNumbers(selectedPool.id, 1, numbersSearch);
            } else {
                fetchPools(1, searchTerm);
            }
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [searchTerm, numbersSearch]);

    useEffect(() => {
        if (!selectedPool) {
            fetchPools(1, "");
        }
    }, [selectedPool]);

    // Pool detail view
    const viewPoolDetails = async (pool: Pool) => {
        setSelectedPool(pool);
        setActiveTab("numbers");
        await fetchPoolNumbers(pool.id, 1, "");
        await fetchAreaCodes(pool.id);
    };

    const backToList = () => {
        setSelectedPool(null);
        setPoolNumbers([]);
        setPoolAreaCodes([]);
        setNumbersSearch("");
    };

    // Create/Edit pool
    const openCreateModal = () => {
        setEditingPool(null);
        setPoolName("");
        setPoolDescription("");
        setPoolCountry("CO");
        setIsModalOpen(true);
    };

    const openEditModal = (pool: Pool) => {
        setEditingPool(pool);
        setPoolName(pool.name);
        setPoolDescription(pool.description || "");
        setPoolCountry(pool.country_code || "CO");
        setIsModalOpen(true);
    };

    const handleSavePool = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!poolName.trim()) return;

        setIsSubmitting(true);
        try {
            if (editingPool) {
                await apiService.updateCallerIdPool(editingPool.id, {
                    name: poolName.trim(),
                    description: poolDescription,
                    country_code: poolCountry
                });
                toast.success("Pool actualizado");
            } else {
                await apiService.createCallerIdPool(poolName.trim(), poolDescription, poolCountry);
                toast.success("Pool creado");
            }
            setIsModalOpen(false);
            fetchPools(pagination.page, searchTerm);
        } catch (error: any) {
            toast.error(error.message || "Error al guardar");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Delete pool
    const confirmDeletePool = (pool: Pool) => {
        setPoolToDelete(pool);
        setDeleteDialogOpen(true);
    };

    const handleDeletePool = async () => {
        if (!poolToDelete) return;
        try {
            await apiService.deleteCallerIdPool(poolToDelete.id);
            toast.success("Pool eliminado");
            fetchPools(pagination.page, searchTerm);
        } catch (error: any) {
            toast.error(error.message || "Error al eliminar");
        } finally {
            setDeleteDialogOpen(false);
            setPoolToDelete(null);
        }
    };

    // Toggle pool active
    const togglePoolActive = async (pool: Pool) => {
        try {
            await apiService.updateCallerIdPool(pool.id, { is_active: !pool.is_active });
            toast.success(pool.is_active ? "Pool desactivado" : "Pool activado");
            fetchPools(pagination.page, searchTerm);
        } catch (error: any) {
            toast.error(error.message || "Error al actualizar");
        }
    };

    // Add single number
    const handleAddNumber = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPool || !newCallerID.trim()) return;

        try {
            await apiService.addPoolNumber(selectedPool.id, newCallerID.trim());
            toast.success("Número agregado");
            setNewCallerID("");
            setIsAddNumberOpen(false);
            fetchPoolNumbers(selectedPool.id, numbersPagination.page, numbersSearch);
            fetchAreaCodes(selectedPool.id);
        } catch (error: any) {
            toast.error(error.message || "Error al agregar");
        }
    };

    // Import numbers
    const handleImport = async () => {
        if (!selectedPool || !importText.trim()) return;

        setIsImporting(true);
        try {
            const response = await apiService.importPoolNumbers(selectedPool.id, importText);
            if (response.success) {
                toast.success(`Importados: ${response.data.inserted}, Omitidos: ${response.data.skipped}, Inválidos: ${response.data.invalid}`);
                setImportText("");
                fetchPoolNumbers(selectedPool.id, 1, numbersSearch);
                fetchAreaCodes(selectedPool.id);
            } else {
                toast.error(response.error || "Error en importación");
            }
        } catch (error: any) {
            toast.error(error.message || "Error al importar");
        } finally {
            setIsImporting(false);
        }
    };

    // File upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedPool) return;

        try {
            toast.info("Subiendo archivo...");
            const response = await apiService.uploadPoolNumbersFile(selectedPool.id, file);
            if (response.success) {
                toast.success(`Importados: ${response.data.inserted}, Omitidos: ${response.data.skipped}`);
                fetchPoolNumbers(selectedPool.id, 1, numbersSearch);
                fetchAreaCodes(selectedPool.id);
            } else {
                toast.error(response.error || "Error en importación");
            }
        } catch (error: any) {
            toast.error(error.message || "Error al subir");
        } finally {
            e.target.value = '';
        }
    };

    // Toggle number active
    const toggleNumberActive = async (num: PoolNumber) => {
        if (!selectedPool) return;
        try {
            await apiService.togglePoolNumber(selectedPool.id, num.id, !num.is_active);
            toast.success(num.is_active ? "Número desactivado" : "Número activado");
            fetchPoolNumbers(selectedPool.id, numbersPagination.page, numbersSearch);
        } catch (error: any) {
            toast.error(error.message || "Error al actualizar");
        }
    };

    // Delete number
    const deleteNumber = async (num: PoolNumber) => {
        if (!selectedPool) return;
        try {
            await apiService.deletePoolNumber(selectedPool.id, num.id);
            toast.success("Número eliminado");
            fetchPoolNumbers(selectedPool.id, numbersPagination.page, numbersSearch);
            fetchAreaCodes(selectedPool.id);
        } catch (error: any) {
            toast.error(error.message || "Error al eliminar");
        }
    };

    // ==================== RENDER ====================

    // Pool detail view
    if (selectedPool) {
        return (
            <div className="flex flex-col h-full animate-in fade-in duration-300">
                {/* Header */}
                <div className="flex-shrink-0 mb-4">
                    <div className="flex items-center gap-4 mb-2">
                        <Button variant="ghost" size="sm" onClick={backToList}>
                            <ArrowLeftCircle className="w-4 h-4 mr-2" />
                            Volver
                        </Button>
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">{selectedPool.name}</h1>
                            <p className="text-slate-500 text-sm">{selectedPool.description || "Sin descripción"}</p>
                        </div>
                        <div className="flex gap-2">
                            <Badge variant="outline">{selectedPool.country_code}</Badge>
                            <Badge variant={selectedPool.is_active ? "default" : "secondary"}>
                                {selectedPool.is_active ? "Activo" : "Inactivo"}
                            </Badge>
                        </div>
                    </div>
                </div>

                {/* Tabs, Stats & Actions Toolbar */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-4">
                        {/* Left Group: Stats & Tabs */}
                        <div className="flex items-center gap-4 overflow-x-auto pb-2 xl:pb-0 no-scrollbar">
                            {/* Inline Stats */}
                            <div className="flex items-center gap-3 text-sm shrink-0">
                                <span className="font-medium text-slate-700">{selectedPool.total_numbers} <span className="text-slate-500 font-normal">números</span></span>
                                <span className="font-medium text-emerald-600">{selectedPool.active_numbers} <span className="text-slate-500 font-normal">activos</span></span>

                                {poolAreaCodes.length > 0 && (
                                    <>
                                        <div className="h-4 w-px bg-slate-200 mx-1" />
                                        <div className="flex items-center gap-2">
                                            {poolAreaCodes.slice(0, 4).map(ac => (
                                                <div key={ac.area_code} className="flex items-center gap-1 bg-slate-100/50 px-1.5 py-0.5 rounded-md border border-slate-200/50">
                                                    <span className="font-mono text-xs font-medium text-slate-700">{ac.area_code}</span>
                                                    <span className="text-[10px] text-slate-400">({ac.count})</span>
                                                </div>
                                            ))}
                                            {poolAreaCodes.length > 4 && <span className="text-xs text-slate-400">+{poolAreaCodes.length - 4}</span>}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="h-6 w-px bg-slate-200 hidden xl:block" />

                            <TabsList className="bg-slate-100/50">
                                <TabsTrigger value="numbers">Números</TabsTrigger>
                                <TabsTrigger value="import">Importar</TabsTrigger>
                            </TabsList>
                        </div>

                        {/* Right Group: Search & Actions */}
                        {activeTab === 'numbers' && (
                            <div className="flex items-center gap-3 w-full xl:w-auto">
                                <div className="relative flex-1 xl:w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        placeholder="Buscar número..."
                                        value={numbersSearch}
                                        onChange={(e) => setNumbersSearch(e.target.value)}
                                        className="pl-9 bg-white"
                                    />
                                </div>
                                <Button onClick={() => setIsAddNumberOpen(true)} className="shrink-0">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Agregar
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Numbers Tab Content */}
                    <TabsContent value="numbers" className="flex-1 flex flex-col min-h-0 mt-0">
                        <div className="flex-1 overflow-auto bg-white rounded-lg border">
                            <Table>
                                <TableHeader className="sticky top-0 bg-white">
                                    <TableRow>
                                        <TableHead>CallerID</TableHead>
                                        <TableHead>LADA</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead>Usos</TableHead>
                                        <TableHead>Último uso</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {poolNumbers.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                                                No hay números en este pool.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        poolNumbers.map((num) => (
                                            <TableRow key={num.id}>
                                                <TableCell className="font-mono font-medium">{num.callerid}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="font-mono">{num.area_code}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={num.is_active ? "default" : "secondary"} className={num.is_active ? "bg-green-100 text-green-800 border-0" : ""}>
                                                        {num.is_active ? "Activo" : "Inactivo"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{num.use_count}</TableCell>
                                                <TableCell className="text-slate-500 text-sm">
                                                    {num.last_used_at ? new Date(num.last_used_at).toLocaleString() : "-"}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="sm" onClick={() => toggleNumberActive(num)}>
                                                        {num.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => deleteNumber(num)} className="text-red-500 hover:text-red-700">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {numbersPagination.pages > 1 && (
                            <div className="flex-shrink-0 mt-4 flex items-center justify-between">
                                <span className="text-sm text-slate-500">
                                    {numbersPagination.total} números
                                </span>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => fetchPoolNumbers(selectedPool.id, numbersPagination.page - 1, numbersSearch)} disabled={numbersPagination.page <= 1}>
                                        <ArrowLeft className="w-4 h-4" />
                                    </Button>
                                    <span className="text-sm py-1 px-2">{numbersPagination.page} / {numbersPagination.pages}</span>
                                    <Button variant="outline" size="sm" onClick={() => fetchPoolNumbers(selectedPool.id, numbersPagination.page + 1, numbersSearch)} disabled={numbersPagination.page >= numbersPagination.pages}>
                                        <ArrowRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* Import Tab */}
                    <TabsContent value="import" className="flex-1 flex flex-col gap-4 mt-4">
                        <div className="p-4 bg-slate-50 rounded-lg border">
                            <h3 className="font-semibold mb-2">Importar desde archivo</h3>
                            <div className="flex gap-2">
                                <input type="file" accept=".csv,.txt" className="hidden" id="pool-file-upload" onChange={handleFileUpload} />
                                <label htmlFor="pool-file-upload">
                                    <Button variant="outline" className="cursor-pointer" asChild>
                                        <span><Upload className="w-4 h-4 mr-2" />Cargar CSV/TXT</span>
                                    </Button>
                                </label>
                            </div>
                            <p className="text-sm text-slate-500 mt-2">Formato: un número por línea o separados por comas.</p>
                        </div>

                        <div className="flex-1 flex flex-col">
                            <h3 className="font-semibold mb-2">Pegar números</h3>
                            <Textarea
                                placeholder="Pega aquí los CallerIDs (uno por línea)&#10;Ejemplo:&#10;3001234567&#10;3101234567&#10;3201234567"
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                className="flex-1 min-h-[200px] font-mono"
                            />
                            <Button onClick={handleImport} disabled={isImporting || !importText.trim()} className="mt-2 self-start">
                                {isImporting ? "Importando..." : "Importar Números"}
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>

                {/* Add Number Modal */}
                <Dialog open={isAddNumberOpen} onOpenChange={setIsAddNumberOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Agregar CallerID</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleAddNumber}>
                            <div className="py-4">
                                <Label>CallerID ({selectedPool.country_code})</Label>
                                <Input
                                    placeholder="Ej: 3001234567"
                                    value={newCallerID}
                                    onChange={(e) => setNewCallerID(e.target.value.replace(/[^0-9]/g, ''))}
                                    maxLength={15}
                                    className="font-mono"
                                    autoFocus
                                />
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsAddNumberOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={!newCallerID.trim()}>Agregar</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    // Pool list view
    return (
        <div className="flex flex-col h-full p-6 animate-in fade-in duration-500">
            <StandardPageHeader
                title="CallerID Pools"
                username={user?.name || ''}
                description="Administra los pools de CallerIDs para rotación por campaña."
            >
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between w-full">
                    <div className="relative flex-1 sm:max-w-xs w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input placeholder="Buscar pool..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
                    </div>
                    <Button onClick={openCreateModal}>
                        <Plus className="w-4 h-4 mr-2" />
                        Crear Pool
                    </Button>
                </div>
            </StandardPageHeader>

            {/* Table */}
            <div className="flex-1 overflow-auto bg-white rounded-lg border shadow-sm">
                <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>País</TableHead>
                            <TableHead>Números</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-slate-500">Cargando...</TableCell>
                            </TableRow>
                        ) : pools.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-slate-500">
                                    {searchTerm ? "No se encontraron pools." : "No hay pools creados."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            pools.map((pool) => (
                                <TableRow key={pool.id} className="cursor-pointer hover:bg-slate-50" onClick={() => viewPoolDetails(pool)}>
                                    <TableCell>
                                        <div className="font-medium text-slate-900">{pool.name}</div>
                                        <div className="text-sm text-slate-500">{pool.description || "-"}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{pool.country_code}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            <Phone className="w-4 h-4 text-slate-400" />
                                            <span>{pool.active_numbers || 0}</span>
                                            <span className="text-slate-400">/ {pool.total_numbers || 0}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={pool.is_active ? "default" : "secondary"} className={pool.is_active ? "bg-green-100 text-green-800 border-0" : ""}>
                                            {pool.is_active ? "Activo" : "Inactivo"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="sm" onClick={() => togglePoolActive(pool)}>
                                            {pool.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => openEditModal(pool)}>
                                            <FileText className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => confirmDeletePool(pool)} className="text-red-500 hover:text-red-700">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
                <div className="flex-shrink-0 mt-4 flex items-center justify-between">
                    <span className="text-sm text-slate-500">{pagination.total} pools</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => fetchPools(pagination.page - 1, searchTerm)} disabled={pagination.page <= 1}>
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm py-1 px-2">{pagination.page} / {pagination.pages}</span>
                        <Button variant="outline" size="sm" onClick={() => fetchPools(pagination.page + 1, searchTerm)} disabled={pagination.page >= pagination.pages}>
                            <ArrowRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Create/Edit Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingPool ? "Editar Pool" : "Crear Pool"}</DialogTitle>
                        <DialogDescription>
                            Un pool contiene una lista de CallerIDs para usar en campañas.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSavePool}>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Nombre</Label>
                                <Input placeholder="Ej: Pool Colombia Claro" value={poolName} onChange={(e) => setPoolName(e.target.value)} required autoFocus />
                            </div>
                            <div className="space-y-2">
                                <Label>Descripción (opcional)</Label>
                                <Input placeholder="Ej: Números Claro 300-310" value={poolDescription} onChange={(e) => setPoolDescription(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>País</Label>
                                <Select value={poolCountry} onValueChange={setPoolCountry}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="CO">Colombia (CO)</SelectItem>
                                        <SelectItem value="MX">México (MX)</SelectItem>
                                        <SelectItem value="US">Estados Unidos (US)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting || !poolName.trim()}>
                                {isSubmitting ? "Guardando..." : editingPool ? "Guardar" : "Crear"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar pool?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción eliminará el pool <strong>{poolToDelete?.name}</strong> y todos sus {poolToDelete?.total_numbers} números.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeletePool} className="bg-red-600 hover:bg-red-700 text-white">
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
