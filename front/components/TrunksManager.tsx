import React, { useState, useEffect } from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from './ui/table';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import {
    Server,
    Network,
    Plus,
    Edit2,
    Trash2,
    RefreshCw,
    Search,
    CheckCircle2,
    XCircle,
    AlertCircle
} from 'lucide-react';
import api from '../services/api';
import { toast } from 'sonner';

interface Trunk {
    trunk_id: string;
    trunk_name: string;
    provider_host: string;
    provider_port: number;
    auth_user?: string;
    auth_password?: string;
    registration: boolean;
    max_channels: number;
    dial_prefix?: string;
    codecs: string;
    active: boolean;
    max_cps: number;
    created_at?: string;
}

export function TrunksManager() {
    const [trunks, setTrunks] = useState<Trunk[]>([]);
    const [trunkStatuses, setTrunkStatuses] = useState<Record<string, { status: string, rtt: string }>>({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [currentTrunk, setCurrentTrunk] = useState<Partial<Trunk>>({
        provider_port: 5060,
        registration: true,
        max_channels: 50,
        max_cps: 50,
        codecs: 'ulaw,alaw',
        active: true
    });
    const [isEdit, setIsEdit] = useState(false);

    const fetchTrunks = async () => {
        try {
            setLoading(true);
            const data = await api.getTrunks();
            setTrunks(data);
        } catch (error) {
            console.error('Error fetching trunks:', error);
            toast.error('Error al cargar la lista de troncales');
        } finally {
            setLoading(false);
        }
    };

    const fetchStatuses = async () => {
        try {
            const res = await api.getTrunkStatuses();
            if (res && typeof res === 'object' && !res.error) {
                setTrunkStatuses(res);
            }
        } catch (error) {
            console.error('Error fetching trunk statuses:', error);
        }
    };

    useEffect(() => {
        fetchTrunks();
        fetchStatuses();

        // Poll for realtime status every 5 seconds
        const interval = setInterval(fetchStatuses, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleOpenCreateModal = () => {
        setCurrentTrunk({
            trunk_id: `trunk_${Date.now()}`,
            provider_port: 5060,
            registration: true,
            max_channels: 50,
            max_cps: 50,
            codecs: 'ulaw,alaw',
            active: true
        });
        setIsEdit(false);
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (trunk: Trunk) => {
        setCurrentTrunk({ ...trunk });
        setIsEdit(true);
        setIsModalOpen(true);
    };

    const handleSaveTrunk = async () => {
        if (!currentTrunk.trunk_id || !currentTrunk.trunk_name || !currentTrunk.provider_host) {
            toast.error('Por favor complete los campos obligatorios');
            return;
        }

        try {
            if (isEdit) {
                await api.updateTrunk(currentTrunk.trunk_id, currentTrunk);
                toast.success('Troncal actualizada exitosamente');
            } else {
                await api.createTrunk(currentTrunk);
                toast.success('Troncal creada exitosamente');
            }
            setIsModalOpen(false);
            fetchTrunks();
        } catch (error: any) {
            console.error('Error saving trunk:', error);
            toast.error(error.message || 'Error al guardar la troncal');
        }
    };

    const handleDeleteTrunk = async (trunkId: string) => {
        if (!confirm('¿Está seguro de que desea eliminar esta troncal? Esta acción afectará el ruteo de llamadas.')) {
            return;
        }

        try {
            setIsDeleting(trunkId);
            await api.deleteTrunk(trunkId);
            toast.success('Troncal eliminada exitosamente');
            fetchTrunks();
        } catch (error: any) {
            console.error('Error deleting trunk:', error);
            toast.error(error.message || 'Error al eliminar la troncal');
        } finally {
            setIsDeleting(null);
        }
    };

    const handleReloadConfigs = async () => {
        try {
            toast.info('Recargando configuración SIP...');
            await api.reloadTrunks();
            toast.success('Configuración recargada exitosamente');
        } catch (error: any) {
            console.error('Error reloading trunks:', error);
            toast.error(error.message || 'Error al recargar la configuración');
        }
    };

    const filteredTrunks = trunks.filter(trunk =>
        trunk.trunk_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trunk.provider_host.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trunk.trunk_id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center relative z-20">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Network className="w-6 h-6 text-blue-600" />
                        Gestión de Troncales
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Administra las conexiones SIP/PJSIP hacia proveedores externos
                    </p>
                </div>

                <div className="flex gap-3">
                    <Button variant="outline" onClick={handleReloadConfigs} className="gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Recargar SIP
                    </Button>
                    <Button onClick={handleOpenCreateModal} className="bg-blue-600 hover:bg-blue-700 gap-2">
                        <Plus className="w-4 h-4" />
                        Nueva Troncal
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-3 border-b border-slate-100">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-lg font-medium">Troncales Configuradas</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar troncal..."
                                className="pl-8"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead>Troncal</TableHead>
                                <TableHead>Servidor / Host</TableHead>
                                <TableHead>Autenticación</TableHead>
                                <TableHead>Canales</TableHead>
                                <TableHead>Límite CPS</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                        <div className="flex justify-center items-center gap-2">
                                            <RefreshCw className="w-5 h-5 animate-spin" />
                                            Cargando troncales...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredTrunks.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                                        No se encontraron troncales
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredTrunks.map((trunk) => (
                                    <TableRow key={trunk.trunk_id}>
                                        <TableCell>
                                            <div className="font-medium text-slate-900">{trunk.trunk_name}</div>
                                            <div className="text-xs text-slate-500 font-mono">{trunk.trunk_id}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5">
                                                <Server className="w-4 h-4 text-slate-400" />
                                                <span>{trunk.provider_host}:{trunk.provider_port}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {trunk.auth_user ? (
                                                <Badge variant="outline" className="bg-blue-50 text-blue-700 hover:bg-blue-50">
                                                    Sí ({trunk.auth_user})
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-slate-500">No (IP Auth)</Badge>
                                            )}
                                            {trunk.registration && (
                                                <Badge variant="outline" className="ml-1 bg-purple-50 text-purple-700">Reg</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {trunk.max_channels}
                                        </TableCell>
                                        <TableCell>
                                            {trunk.max_cps} <span className="text-xs text-slate-400">CPS</span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1.5">
                                                {trunk.active ? (
                                                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 flex gap-1 w-fit items-center">
                                                        <CheckCircle2 className="w-3 h-3" /> Configurada Activa
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 flex gap-1 w-fit items-center">
                                                        <XCircle className="w-3 h-3" /> Configurada Inactiva
                                                    </Badge>
                                                )}

                                                {trunk.active && trunkStatuses[trunk.trunk_name] && (
                                                    <div className="flex items-center gap-2 text-xs mt-1">
                                                        <span className={
                                                            trunkStatuses[trunk.trunk_name].status === 'Avail' ? 'text-emerald-600 font-semibold' :
                                                                'text-amber-600 font-semibold'
                                                        }>
                                                            {trunkStatuses[trunk.trunk_name].status === 'Avail' ? 'SIP Conectado' :
                                                                trunkStatuses[trunk.trunk_name].status === 'Unavail' ? 'Inalcanzable' :
                                                                    trunkStatuses[trunk.trunk_name].status === 'Unknown' ? 'Desconocido' :
                                                                        trunkStatuses[trunk.trunk_name].status}
                                                        </span>

                                                        {trunkStatuses[trunk.trunk_name].rtt && trunkStatuses[trunk.trunk_name].rtt !== 'nan' && (
                                                            <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                                {trunkStatuses[trunk.trunk_name].rtt} ms
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleOpenEditModal(trunk)}
                                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDeleteTrunk(trunk.trunk_id)}
                                                    disabled={isDeleting === trunk.trunk_id}
                                                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[700px] bg-white text-black p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-slate-50">
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            {isEdit ? <Edit2 className="w-5 h-5 text-blue-600" /> : <Plus className="w-5 h-5 text-blue-600" />}
                            {isEdit ? 'Editar Troncal' : 'Nueva Troncal'}
                        </DialogTitle>
                        <DialogDescription>
                            Configura los detalles de conexión SIP para esta troncal.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="trunk_id">ID de Troncal <span className="text-red-500">*</span></Label>
                                <Input
                                    id="trunk_id"
                                    value={currentTrunk.trunk_id || ''}
                                    onChange={(e) => setCurrentTrunk({ ...currentTrunk, trunk_id: e.target.value })}
                                    disabled={isEdit}
                                    placeholder="ej. trunk_salida_1"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="trunk_name">Nombre visible <span className="text-red-500">*</span></Label>
                                <Input
                                    id="trunk_name"
                                    value={currentTrunk.trunk_name || ''}
                                    onChange={(e) => setCurrentTrunk({ ...currentTrunk, trunk_name: e.target.value })}
                                    placeholder="ej. Proveedor Principal"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2 col-span-2">
                                <Label htmlFor="provider_host">Host / IP del Proveedor <span className="text-red-500">*</span></Label>
                                <Input
                                    id="provider_host"
                                    value={currentTrunk.provider_host || ''}
                                    onChange={(e) => setCurrentTrunk({ ...currentTrunk, provider_host: e.target.value })}
                                    placeholder="ej. sip.proveedor.com o 192.168.1.50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="provider_port">Puerto <span className="text-red-500">*</span></Label>
                                <Input
                                    id="provider_port"
                                    type="number"
                                    value={currentTrunk.provider_port || 5060}
                                    onChange={(e) => setCurrentTrunk({ ...currentTrunk, provider_port: parseInt(e.target.value) || 5060 })}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                            <div className="space-y-2">
                                <Label htmlFor="auth_user">Usuario (Opcional si es IP Auth)</Label>
                                <Input
                                    id="auth_user"
                                    value={currentTrunk.auth_user || ''}
                                    onChange={(e) => setCurrentTrunk({ ...currentTrunk, auth_user: e.target.value })}
                                    placeholder="Usuario SIP"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="auth_password">Contraseña (Opcional si es IP Auth)</Label>
                                <Input
                                    id="auth_password"
                                    type="password"
                                    value={currentTrunk.auth_password || ''}
                                    onChange={(e) => setCurrentTrunk({ ...currentTrunk, auth_password: e.target.value })}
                                    placeholder="Contraseña SIP"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="max_channels">Límite de Canales</Label>
                                <Input
                                    id="max_channels"
                                    type="number"
                                    value={currentTrunk.max_channels || 50}
                                    onChange={(e) => setCurrentTrunk({ ...currentTrunk, max_channels: parseInt(e.target.value) || 50 })}
                                />
                                <p className="text-xs text-slate-500">Máximo de llamadas simultáneas (0 = ilimitado)</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max_cps">Límite de CPS</Label>
                                <Input
                                    id="max_cps"
                                    type="number"
                                    value={currentTrunk.max_cps || 50}
                                    onChange={(e) => setCurrentTrunk({ ...currentTrunk, max_cps: parseInt(e.target.value) || 50 })}
                                />
                                <p className="text-xs text-slate-500">Bolsa global de llamadas por segundo</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="codecs">Codecs Permitidos</Label>
                                <Input
                                    id="codecs"
                                    value={currentTrunk.codecs || 'ulaw,alaw'}
                                    onChange={(e) => setCurrentTrunk({ ...currentTrunk, codecs: e.target.value })}
                                />
                                <p className="text-xs text-slate-500">Separados por coma</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="dial_prefix">Prefijo de Marcación (Opcional)</Label>
                                <Input
                                    id="dial_prefix"
                                    value={currentTrunk.dial_prefix || ''}
                                    onChange={(e) => setCurrentTrunk({ ...currentTrunk, dial_prefix: e.target.value })}
                                    placeholder="ej. 011"
                                />
                                <p className="text-xs text-slate-500">Prefijo a añadir antes de marcar</p>
                            </div>
                        </div>

                        <div className="flex gap-8 p-4 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="trunk_active"
                                    checked={currentTrunk.active !== false}
                                    onCheckedChange={(checked) => setCurrentTrunk({ ...currentTrunk, active: checked })}
                                />
                                <Label htmlFor="trunk_active" className="cursor-pointer">Activa</Label>
                            </div>

                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="trunk_registration"
                                    checked={currentTrunk.registration !== false}
                                    onCheckedChange={(checked) => setCurrentTrunk({ ...currentTrunk, registration: checked })}
                                />
                                <div>
                                    <Label htmlFor="trunk_registration" className="cursor-pointer">Requiere Registro</Label>
                                    <p className="text-xs text-slate-500 leading-tight">Envía requirimiento REGISTER al proveedor</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-4 border-t border-slate-100 bg-slate-50">
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveTrunk} className="bg-blue-600 hover:bg-blue-700">Guardar Troncal</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
