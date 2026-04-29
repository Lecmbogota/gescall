import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { StandardPageHeader } from './ui/layout/StandardPageHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { toast } from 'react-hot-toast';
import { Loader2, Plus, Edit2, Trash2, Mic, Activity } from 'lucide-react';
import api from '@/services/api';

interface TTSNode {
    id: number;
    name: string;
    url: string;
    is_active: boolean;
    created_at?: string;
}

export function TTSNodesManager() {
    const [nodes, setNodes] = useState<TTSNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingNode, setEditingNode] = useState<TTSNode | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [isActive, setIsActive] = useState(true);

    const loadNodes = async () => {
        try {
            setLoading(true);
            const res = await api.getTTSNodes();
            if (Array.isArray(res)) {
                setNodes(res);
            } else {
                toast.error('Error cargando nodos');
            }
        } catch (error) {
            toast.error('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadNodes();
    }, []);

    const handleOpenDialog = (node?: TTSNode) => {
        if (node) {
            setEditingNode(node);
            setName(node.name);
            setUrl(node.url);
            setIsActive(node.is_active);
        } else {
            setEditingNode(null);
            setName('');
            setUrl('');
            setIsActive(true);
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!name.trim() || !url.trim()) {
            toast.error('Nombre y URL son requeridos');
            return;
        }

        try {
            setSaving(true);
            if (editingNode) {
                await api.updateTTSNode(editingNode.id, { name, url, is_active: isActive });
                toast.success('Nodo actualizado exitosamente');
            } else {
                await api.createTTSNode({ name, url, is_active: isActive });
                toast.success('Nodo creado exitosamente');
            }
            setIsDialogOpen(false);
            loadNodes();
        } catch (error: any) {
            toast.error(`Error guardando nodo: ${error.message || 'Desconocido'}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('¿Está seguro de eliminar este nodo TTS?')) {
            return;
        }

        try {
            await api.deleteTTSNode(id);
            toast.success('Nodo eliminado');
            loadNodes();
        } catch (error: any) {
            toast.error(`Error eliminando nodo: ${error.message || 'Desconocido'}`);
        }
    };

    const handleToggleActive = async (id: number, currentActive: boolean) => {
        try {
            await api.updateTTSNode(id, { is_active: !currentActive });
            loadNodes();
        } catch (error: any) {
            toast.error(`Error actualizando nodo: ${error.message || 'Desconocido'}`);
        }
    };

    if (loading && nodes.length === 0) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            <div className="flex-shrink-0 px-6 pt-4 pb-4 relative z-20">
                <div className="flex items-center justify-between">
                    <StandardPageHeader
                        title="Gestión de Nodos TTS"
                        username=""
                        description="Configure y administre los servicios Text-to-Speech utilizados para Locución y Rutas IVR."
                    />
                    <Button
                        onClick={() => handleOpenDialog()}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nuevo Nodo
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50 border-b border-slate-100">
                            <TableRow>
                                <TableHead className="font-semibold text-slate-700">Nombre</TableHead>
                                <TableHead className="font-semibold text-slate-700">URL</TableHead>
                                <TableHead className="font-semibold text-slate-700 text-center">Estado</TableHead>
                                <TableHead className="font-semibold text-slate-700 text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {nodes.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-32 text-center text-slate-500">
                                        <Mic className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                                        <p>No hay nodos TTS configurados</p>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                nodes.map((node) => (
                                    <TableRow key={node.id} className="hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="font-medium text-slate-900">{node.name}</TableCell>
                                        <TableCell className="text-slate-500 text-sm max-w-xs truncate" title={node.url}>
                                            {node.url}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <Switch
                                                    checked={node.is_active}
                                                    onCheckedChange={() => handleToggleActive(node.id, node.is_active)}
                                                />
                                                <span className={`text-xs font-medium px-2 py-1 rounded-full ${node.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {node.is_active ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-8 h-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                                    onClick={() => handleOpenDialog(node)}
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-8 h-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => handleDelete(node.id)}
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
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{editingNode ? 'Editar Nodo TTS' : 'Nuevo Nodo TTS'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre del Nodo</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ej: Piper TTS Principal"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="url">URL Endpoint</Label>
                            <Input
                                id="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="Ej: https://.../tts"
                            />
                        </div>
                        <div className="flex items-center justify-between pt-2">
                            <div className="space-y-0.5">
                                <Label>Estado del Nodo</Label>
                                <p className="text-xs text-slate-500">¿Permitir que el motor IVR utilice este nodo?</p>
                            </div>
                            <Switch checked={isActive} onCheckedChange={setIsActive} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Guardar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
