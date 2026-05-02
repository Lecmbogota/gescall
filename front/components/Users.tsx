import { useState, useEffect } from "react";
import {
    Plus,
    Search,
    Trash2,
    RefreshCw,
    Edit,
    ShieldAlert,
    UserCheck,
    UserRound,
    FolderSymlink,
    Copy,
    Key
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";
import { ScrollArea } from "./ui/scroll-area";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { toast } from "sonner";
import api from "../services/api";
import socketService from "../services/socket";
import { useAuthStore, Campaign } from "../stores/authStore";

interface User {
    user_id: string;
    username: string;
    role_id: number;
    role: string;
    active: boolean;
    created_at: string;
    api_token?: string | null;
    sip_extension?: string | null;
    extension_status?: string;
}

interface UsersProps {
    username: string;
}

export function Users({ username: loggedInUsername }: UsersProps) {
    const { session, hasRolePermission, isAdmin } = useAuthStore();
    const currentUserRoleId = session?.permissions?.role_id;

    const canCreateUsers = isAdmin() || hasRolePermission('create_users');
    const canEditUsers = isAdmin() || hasRolePermission('edit_users');
    const canDeleteUsers = isAdmin() || hasRolePermission('delete_users');
    const canAssignCampaigns = isAdmin() || hasRolePermission('assign_user_campaigns');

    const getRoleLevel = (role_id: number | undefined) => {
        const foundRole = roles.find(r => r.id === role_id);
        if (foundRole?.is_system) return 100;
        
        switch (foundRole?.role?.toUpperCase()) {
            case 'MANAGER': return 50;
            case 'AGENT': return 10;
            default: return 20; // Custom roles
        }
    };

    const canModifyUser = (targetRoleId: number | undefined) => {
        const currentLevel = getRoleLevel(currentUserRoleId);
        const targetLevel = getRoleLevel(targetRoleId);
        if (currentLevel === 100) return true;
        if (targetLevel === 100) return false;
        return currentLevel >= targetLevel;
    };

    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<{ id: number, role: string, is_system: boolean }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Campaigns Modal state
    const [isCampaignsModalOpen, setIsCampaignsModalOpen] = useState(false);
    const [userCampaigns, setUserCampaigns] = useState<string[]>([]);
    const [isSavingCampaigns, setIsSavingCampaigns] = useState(false);
    const [allSystemCampaigns, setAllSystemCampaigns] = useState<{id: string, name: string}[]>([]);

    const [formData, setFormData] = useState({
        username: "",
        password: "",
        role_id: "",
        active: true,
    });

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [usersRes, rolesRes] = await Promise.all([
                api.getUsers(),
                api.getRoles()
            ]);

            if (usersRes.success) {
                setUsers(usersRes.data);
            } else {
                toast.error("Error al obtener usuarios: " + usersRes.error);
            }

            if (rolesRes.success && rolesRes.data) {
                setRoles(rolesRes.data);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error("Error de conexión al obtener datos");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Periodic lightweight poll for extension statuses (every 30s)
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await api.getUsers();
                if (res.success && res.data) {
                    setUsers(prev => prev.map(user => {
                        const fresh = res.data.find((u: any) => u.user_id === user.user_id);
                        if (fresh) {
                            return { ...user, extension_status: fresh.extension_status || user.extension_status };
                        }
                        return user;
                    }));
                }
            } catch (e) {}
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    // Real-time WebSocket: extension status + agent state updates
    useEffect(() => {
        const handleRealtime = (data: any) => {
            if (!data) return;

            // Extension statuses from periodic broadcast
            if (data.extensions && typeof data.extensions === 'object') {
                const keys = Object.keys(data.extensions);
                if (keys.length > 0) console.log('[Users WS] extensions:', keys.length, 'keys');
                setUsers(prev => prev.map(user => {
                    const extStatus = data.extensions[user.username];
                    if (extStatus) {
                        return { ...user, extension_status: extStatus };
                    }
                    return user;
                }));
            }

            // Single agent update (includes extension_status)
            if (data.agent_update) {
                const upd = data.agent_update;
                console.log('[Users WS] agent_update:', upd.username, upd.state, 'ext:', upd.extension_status);
                setUsers(prev => prev.map(user => {
                    if (user.username === upd.username && upd.extension_status) {
                        return { ...user, extension_status: upd.extension_status };
                    }
                    return user;
                }));
            }
        };

        console.log('[Users] Subscribing to WebSocket dashboard:realtime:update');
        socketService.connect();
        socketService.on('dashboard:realtime:update', handleRealtime as any);

        return () => {
            console.log('[Users] Unsubscribing from WebSocket');
            socketService.off('dashboard:realtime:update', handleRealtime as any);
        };
    }, []);

    const handleOpenCreateModal = () => {
        setIsEditing(false);
        setSelectedUser(null);
        setFormData({
            username: "",
            password: "",
            role_id: roles.length > 0 ? roles[0].id.toString() : "",
            active: true,
        });
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (user: User) => {
        setIsEditing(true);
        setSelectedUser(user);
        setFormData({
            username: user.username,
            password: "", // Don't normally send passwords back; empty means keep current if editing
            role_id: user.role_id.toString(),
            active: user.active,
        });
        setIsModalOpen(true);
    };

    const handleOpenCampaignsModal = async (user: User) => {
        setSelectedUser(user);
        setIsCampaignsModalOpen(true);
        setUserCampaigns([]); // Reset while loading

        try {
            // Fetch all system campaigns AND this user's assigned campaigns in parallel
            const [campaignsRes, userCampsRes] = await Promise.all([
                api.getCampaigns({}),
                api.getUserCampaigns(user.user_id)
            ]);

            if (campaignsRes.success && campaignsRes.data) {
                setAllSystemCampaigns(campaignsRes.data.map((c: any) => ({
                    id: c.campaign_id,
                    name: c.campaign_name || c.campaign_id
                })));
            }

            if (userCampsRes.success) {
                setUserCampaigns(userCampsRes.data || []);
            } else {
                toast.error("Error al cargar campañas del usuario");
            }
        } catch (error) {
            toast.error("Error de conexión");
        }
    };

    const handleToggleCampaign = (campaignId: string, checked: boolean) => {
        setUserCampaigns(prev =>
            checked ? [...prev, campaignId] : prev.filter(id => id !== campaignId)
        );
    };

    const handleSaveCampaigns = async () => {
        if (!selectedUser) return;

        setIsSavingCampaigns(true);
        try {
            const res = await api.updateUserCampaigns(selectedUser.user_id, userCampaigns);
            if (res.success) {
                toast.success("Campañas asignadas correctamente");
                setIsCampaignsModalOpen(false);
            } else {
                toast.error("Error al asignar campañas: " + res.error);
            }
        } catch (error) {
            toast.error("Error al guardar asignaciones");
        } finally {
            setIsSavingCampaigns(false);
        }
    };

    const handleDeleteUser = async (id: string) => {
        if (!confirm("¿Está seguro de que desea eliminar este usuario?")) return;

        try {
            const res = await api.deleteUser(id);
            if (res.success) {
                toast.success("Usuario eliminado correctamente");
                fetchData();
            } else {
                toast.error("Error al eliminar usuario: " + res.error);
            }
        } catch (error) {
            console.error("Error deleting user:", error);
            toast.error("Error al comunicar con el servidor");
        }
    };

    const handleGenerateToken = async (id: string) => {
        if (!confirm("¿Está seguro de generar un nuevo token API? El token anterior dejará de funcionar.")) return;
        try {
            const res = await api.generateApiToken(id);
            if (res.success) {
                toast.success("Token generado. Por favor cópielo de la tabla.");
                fetchData();
            } else {
                toast.error("Error al generar token: " + res.error);
            }
        } catch (_) {
            toast.error("Error de conexión");
        }
    };

    const handleRevokeToken = async (id: string) => {
        if (!confirm("¿Está seguro de revocar el token API? El usuario perderá acceso inmediato a la API.")) return;
        try {
            const res = await api.revokeApiToken(id);
            if (res.success) {
                toast.success("Token revocado correctamente");
                fetchData();
            } else {
                toast.error("Error al revocar token: " + res.error);
            }
        } catch (_) {
            toast.error("Error de conexión");
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Token copiado al portapapeles");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (isEditing && selectedUser) {
                const res = await api.updateUser(selectedUser.user_id, formData);
                if (res.success) {
                    toast.success("Usuario actualizado correctamente");
                    setIsModalOpen(false);
                    fetchData();
                } else {
                    toast.error("Error al actualizar usuario: " + res.error);
                }
            } else {
                // Enforce password for new users
                if (!formData.password) {
                    toast.error("Se requiere contraseña para usuarios nuevos");
                    setIsSubmitting(false);
                    return;
                }

                const res = await api.createUser(formData);
                if (res.success) {
                    toast.success("Usuario creado correctamente");
                    setIsModalOpen(false);
                    fetchData();
                } else {
                    toast.error("Error al crear usuario: " + res.error);
                }
            }
        } catch (error: any) {
            console.error("Error saving user:", error);
            toast.error("Error al guardar: " + (error.message || "Problema de red"));
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredUsers = users.filter(user =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/60 backdrop-blur-md p-6 rounded-2xl border border-white/80 shadow-sm relative z-20">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        Administración de Usuarios
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Gestione los usuarios y accesos del sistema GesCall
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchData}
                        disabled={isLoading}
                        className="text-slate-600 border-slate-200 bg-white/80 backdrop-blur shadow-sm hover:bg-white"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </Button>
                    <Button
                        onClick={handleOpenCreateModal}
                        disabled={!canCreateUsers}
                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        title={canCreateUsers ? "Crear Nuevo Usuario" : "Sin permiso para crear usuarios"}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nuevo Usuario
                    </Button>
                </div>
            </div>

            <div className="bg-white/60 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                {/* Toolbar */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white/40">
                    <div className="relative w-72">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                            placeholder="Buscar por usuario..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 bg-white border-slate-200 shadow-sm"
                        />
                    </div>
                    <div className="text-sm text-slate-500">
                        Mostrando {filteredUsers.length} de {users.length} usuarios
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
                            <TableRow className="border-slate-100 hover:bg-transparent">
                                <TableHead className="font-semibold text-slate-600">ID</TableHead>
                                <TableHead className="font-semibold text-slate-600">Usuario</TableHead>
                                <TableHead className="font-semibold text-slate-600">Rol</TableHead>
                                <TableHead className="font-semibold text-slate-600">Estado</TableHead>
                                <TableHead className="font-semibold text-slate-600">Extensión</TableHead>
                                <TableHead className="font-semibold text-slate-600">Ext. Estado</TableHead>
                                <TableHead className="font-semibold text-slate-600">Creado</TableHead>
                                <TableHead className="font-semibold text-slate-600">API Token</TableHead>
                                <TableHead className="text-right font-semibold text-slate-600">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-48 text-center text-slate-500">
                                        <div className="flex flex-col items-center justify-center space-y-3">
                                            <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                                            <p>Cargando usuarios...</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-48 text-center text-slate-500">
                                        No se encontraron usuarios que coincidan con la búsqueda.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredUsers.map((user) => (
                                    <TableRow key={user.user_id} className="border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="font-mono text-slate-500 text-xs">{user.user_id}</TableCell>
                                        <TableCell>
                                            <div className="font-medium text-slate-900">{user.username}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5">
                                                {roles.find(r => r.role === user.role)?.is_system ? <ShieldAlert className="w-4 h-4 text-purple-500" /> :
                                                    user.role === 'MANAGER' ? <UserCheck className="w-4 h-4 text-blue-500" /> :
                                                        <UserRound className="w-4 h-4 text-slate-500" />}
                                                <span className="text-sm font-medium text-slate-700 capitalize">
                                                    {user.role.toLowerCase()}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className={user.active
                                                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100/80"
                                                    : "bg-slate-100 text-slate-700 hover:bg-slate-100/80"
                                                }
                                            >
                                                {user.active ? 'Activo' : 'Inactivo'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {user.sip_extension ? (
                                                <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-mono">
                                                    {user.sip_extension}
                                                </code>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">Sin extensión</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {user.sip_extension ? (
                                                <Badge
                                                    variant="secondary"
                                                    className={user.extension_status === 'Online'
                                                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100/80"
                                                        : "bg-slate-100 text-slate-500 hover:bg-slate-100/80"
                                                    }
                                                >
                                                    {user.extension_status === 'Online' ? 'Online' : 'Offline'}
                                                </Badge>
                                            ) : (
                                                <span className="text-xs text-slate-400">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-slate-500 text-sm">
                                            {new Date(user.created_at).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            {user.api_token ? (
                                                <div className="flex items-center gap-2">
                                                    <code className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded truncate max-w-[120px]" title={user.api_token}>
                                                        {user.api_token.substring(0, 8)}...
                                                    </code>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(user.api_token!)}>
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">No asignado</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <div className="flex items-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleGenerateToken(user.user_id.toString())}
                                                        disabled={!canEditUsers || !canModifyUser(user.role_id)}
                                                        className="h-8 w-8 text-slate-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                                                        title={canEditUsers && canModifyUser(user.role_id) ? (user.api_token ? "Regenerar Token" : "Generar Token") : "Sin permisos"}
                                                    >
                                                        <Key className="w-4 h-4" />
                                                    </Button>
                                                    {user.api_token && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleRevokeToken(user.user_id.toString())}
                                                            disabled={!canEditUsers || !canModifyUser(user.role_id)}
                                                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                            title={canEditUsers && canModifyUser(user.role_id) ? "Revocar Token" : "Sin permisos"}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                                {!roles.find(r => r.role === user.role)?.is_system && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleOpenCampaignsModal(user)}
                                                        disabled={!canAssignCampaigns || !canModifyUser(user.role_id)}
                                                        className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                                                        title="Asignar Campañas"
                                                    >
                                                        <FolderSymlink className="w-4 h-4" />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleOpenEditModal(user)}
                                                    disabled={!canEditUsers || !canModifyUser(user.role_id)}
                                                    className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                                                    title={canEditUsers && canModifyUser(user.role_id) ? "Editar" : "Sin permisos"}
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDeleteUser(user.user_id.toString())}
                                                    disabled={!canDeleteUsers || !canModifyUser(user.role_id)}
                                                    className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                    title={canDeleteUsers && canModifyUser(user.role_id) ? "Eliminar" : "Sin permisos"}
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

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
                        <DialogDescription>
                            {isEditing
                                ? 'Modifique los datos del usuario. Deje la contraseña en blanco si no desea cambiarla.'
                                : 'Complete los datos para crear un nuevo usuario en el sistema.'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Nombre de Usuario</Label>
                            <Input
                                id="username"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                placeholder="ej. jdoe"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <Input
                                id="password"
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                placeholder={isEditing ? "(Sin cambios)" : "••••••••"}
                                required={!isEditing}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="role">Rol</Label>
                            <Select
                                value={formData.role_id}
                                onValueChange={(value) => setFormData({ ...formData, role_id: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccione un rol" />
                                </SelectTrigger>
                                <SelectContent>
                                    {roles.length > 0 ? (
                                        roles.filter(r => canModifyUser(r.id)).map(r => (
                                            <SelectItem key={r.id} value={r.id.toString()}>{r.role}</SelectItem>
                                        ))
                                    ) : (
                                        <>
                                            <SelectItem value="">AGENT</SelectItem>
                                        </>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <Label htmlFor="active" className="cursor-pointer">Usuario Activo</Label>
                            <Switch
                                id="active"
                                checked={formData.active}
                                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                            />
                        </div>

                        <DialogFooter className="pt-4">
                            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Guardando...' : 'Guardar'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Campaign Assignments Modal */}
            <Dialog open={isCampaignsModalOpen} onOpenChange={setIsCampaignsModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Asignar Campañas</DialogTitle>
                        <DialogDescription>
                            Seleccione las campañas a las que tendrá acceso el usuario <span className="font-semibold">{selectedUser?.username}</span>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 border-t border-slate-100 mt-2">
                        {roles.find(r => r.role === selectedUser?.role)?.is_system && (
                            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                <p className="text-xs text-amber-700 font-medium">
                                    ⚠️ Este usuario tiene un rol de sistema (acceso total). Las asignaciones de campaña que configure aquí se guardarán, pero solo tendrán efecto si cambia su rol a uno no administrativo.
                                </p>
                            </div>
                        )}
                        {allSystemCampaigns.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-4">Cargando campañas...</p>
                        ) : (
                            <ScrollArea className="h-[300px] pr-4">
                                <div className="space-y-3">
                                    {allSystemCampaigns.map(camp => (
                                        <div key={camp.id} className={`flex items-center justify-between space-x-3 p-3 border rounded-xl transition-colors ${userCampaigns.includes(camp.id) ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}>
                                            <div className="flex flex-col space-y-0.5">
                                                <Label className="text-sm font-medium leading-none text-slate-700">
                                                    {camp.name}
                                                </Label>
                                                <span className="text-[11px] text-slate-400 font-mono">
                                                    {camp.id}
                                                </span>
                                            </div>
                                            <Switch
                                                checked={userCampaigns.includes(camp.id)}
                                                onCheckedChange={(checked) => handleToggleCampaign(camp.id, checked)}
                                                className="data-[state=checked]:bg-indigo-600"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsCampaignsModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSaveCampaigns}
                            disabled={isSavingCampaigns}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {isSavingCampaigns ? 'Guardando...' : 'Guardar Asignaciones'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
