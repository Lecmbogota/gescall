import { useState, useEffect } from 'react';
import { StandardPageHeader } from './ui/layout/StandardPageHeader';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { toast } from 'react-hot-toast';
import { Loader2, Save, Shield, Plus, Trash2, Search, ArrowRight, ChevronRight, CheckCircle2, Lock } from 'lucide-react';
import { 
    Accordion, 
    AccordionContent, 
    AccordionItem, 
    AccordionTrigger 
} from './ui/accordion';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

interface RolesPermissionsMap {
    [role_id: number]: string[];
}

interface RoleDef {
    id: number;
    role: string;
    is_system: boolean;
}

const PERMISSION_CATEGORIES = [
    {
        id: 'core',
        label: 'Core & Dashboard',
        permissions: [
            { id: 'view_dashboard', label: 'Ver Panel Principal', desc: 'Acceso a la vista de inicio y métricas rápidas' },
            { id: 'view_reports', label: 'Ver Reportes', desc: 'Permiso para acceder a tablas de reportes y exportar datos' },
        ]
    },
    {
        id: 'ops',
        label: 'Operaciones Discado',
        permissions: [
            { id: 'view_campaigns', label: 'Ver Campañas', desc: 'Acceso a la vista de grilla de campañas' },
            { id: 'manage_campaigns', label: 'Crear y Editar Campañas', desc: 'Permite crear campañas, asignar usuarios y cambiar configuraciones' },
            { id: 'manage_audio', label: 'Gestión de Audios', desc: 'Permite subir audios y campañas de locución' },
            { id: 'manage_ivr', label: 'IVR Builder', desc: 'Acceso al Creador Visual de IVR' },
            { id: 'manage_callerid', label: 'Gestión de CallerID', desc: 'Permite configurar grupos y rotación de CallerIDs' },
            { id: 'manage_trunks', label: 'Gestionar Troncales', desc: 'Permite modificar configuración SIP de troncales' },
            { id: 'manage_blacklist', label: 'Gestionar Blacklist', desc: 'Permite la gestión de números bloqueados (DNC)' },
            { id: 'manage_tts_nodes', label: 'Gestión de Nodos TTS', desc: 'Permite configurar y administrar los nodos de Text-to-Speech' },
            { id: 'manage_schedules', label: 'Programador', desc: 'Permite programar activaciones/pausas automatizadas' },
        ]
    },
    {
        id: 'users',
        label: 'Usuarios y Control',
        permissions: [
            { id: 'view_users', label: 'Ver Usuarios', desc: 'Permite listar los usuarios en la sección configuración' },
            { id: 'create_users', label: 'Crear Usuarios', desc: 'Permite dar de alta a nuevos agentes o managers' },
            { id: 'edit_users', label: 'Editar Usuarios', desc: 'Permite cambiar información o rol de un usuario' },
            { id: 'delete_users', label: 'Eliminar Usuarios', desc: 'Permite borrar usuarios del sistema de forma permanente' },
            { id: 'assign_user_campaigns', label: 'Asignar Campañas', desc: 'Permite vincular usuarios a campañas específicas' },
            { id: 'view_roles', label: 'Ver Roles y Permisos', desc: 'Accede a esta vista actual' },
            { id: 'manage_roles', label: 'Modificar Permisos', desc: 'Modifica los permisos de cada rol' },
        ]
    },
    {
        id: 'api',
        label: 'API e Integraciones',
        permissions: [
            { id: 'view_api_docs', label: 'Ver Documentación API', desc: 'Permite acceder a los endpoints técnicos de integración' },
            { id: 'api_docs_campaigns', label: 'API: Campañas y Listas', desc: 'Endpoints para crear, listar y asignar campañas o listas' },
            { id: 'api_docs_leads', label: 'API: Leads', desc: 'Endpoints para cargar, listar y gestionar prospectos' },
            { id: 'api_docs_audio', label: 'API: Audio', desc: 'Endpoints para gestionar audios (grabaciones, TTS)' },
            { id: 'api_docs_callerid', label: 'API: CallerID', desc: 'Endpoints de asignación e importación de los CallerIDs' },
            { id: 'api_docs_schedules', label: 'API: Horarios', desc: 'Endpoints de programación y schedules' },
            { id: 'api_docs_ivr', label: 'API: IVR', desc: 'Endpoints para gestionar flujos y ejecuciones de IVRs' },
            { id: 'api_docs_trunks', label: 'API: Troncales', desc: 'Endpoints para administración SIP/Troncales' },
            { id: 'api_docs_users', label: 'API: Usuarios', desc: 'Endpoints para consultar o proveer accesos a usuarios' },
            { id: 'api_docs_roles', label: 'API: Roles', desc: 'Endpoints para consultar estructuras de permisos de API' },
            { id: 'api_docs_tts', label: 'API: Nodos TTS', desc: 'Endpoints de generación y verificación TTS' },
            { id: 'api_docs_dnc', label: 'API: DNC/Blacklist', desc: 'Endpoints para listar o bloquear teléfonos del discador' }
        ]
    }
];

const ALL_PERMISSIONS_COUNT = PERMISSION_CATEGORIES.reduce((acc, cat) => acc + cat.permissions.length, 0);

interface RolesProps {
    username: string;
}

export function Roles({ username }: RolesProps) {
    const [permissions, setPermissions] = useState<RolesPermissionsMap>({});
    const [roles, setRoles] = useState<RoleDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showNewRoleInput, setShowNewRoleInput] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
    const { getUser } = useAuthStore();
    const currentUser = getUser();

    const loadData = async () => {
        try {
            setLoading(true);
            const [permsRes, rolesRes] = await Promise.all([
                api.getRolePermissions(),
                api.getRoles()
            ]);

            if (permsRes.success && permsRes.data) {
                setPermissions(permsRes.data);
            }
            if (rolesRes.success && rolesRes.data) {
                setRoles(rolesRes.data);
                if (rolesRes.data.length > 0 && !selectedRoleId) {
                    setSelectedRoleId(rolesRes.data[0].id);
                }
            } else {
                toast.error('No se pudieron cargar los roles');
            }
        } catch (e) {
            toast.error('Error al cargar la información de roles');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleToggle = (role_id: number, permId: string, checked: boolean) => {
        setPermissions(prev => {
            const rolePerms = prev[role_id] || [];
            const updated = checked
                ? [...rolePerms, permId]
                : rolePerms.filter(p => p !== permId);

            return { ...prev, [role_id]: updated };
        });
    };

    const handleToggleAllInCategory = (role_id: number, categoryId: string, checked: boolean) => {
        const category = PERMISSION_CATEGORIES.find(c => c.id === categoryId);
        if (!category) return;

        const catPermIds = category.permissions.map(p => p.id);

        setPermissions(prev => {
            const rolePerms = prev[role_id] || [];
            let updated;
            if (checked) {
                // Add all category perms that aren't already there
                updated = [...new Set([...rolePerms, ...catPermIds])];
            } else {
                // Remove all category perms
                updated = rolePerms.filter(p => !catPermIds.includes(p));
            }
            return { ...prev, [role_id]: updated };
        });
    };

    const handleSaveRole = async (role_id: number, role_name: string) => {
        try {
            setSaving(role_id);
            const permsToSave = permissions[role_id] || [];
            const res = await api.updateRolePermissions(role_id, permsToSave);

            if (res.success) {
                toast.success(`Permisos de ${role_name} actualizados`, {
                    style: { background: '#10B981', color: '#fff' }
                });
            } else {
                toast.error(`Error guardando: ${res.error}`);
            }
        } catch (error) {
            toast.error('Error al guardar permisos');
        } finally {
            setSaving(null);
        }
    };

    const handleCreateRole = () => {
        setShowNewRoleInput(true);
    };

    const handleConfirmCreateRole = async () => {
        if (!newRoleName.trim()) {
            setShowNewRoleInput(false);
            return;
        }

        try {
            setCreating(true);
            const res = await api.createRole(newRoleName.toUpperCase().trim());
            if (res.success) {
                toast.success(`Rol ${res.role} creado exitosamente`);
                setNewRoleName('');
                setShowNewRoleInput(false);
                loadData();
            } else {
                toast.error(`Error: ${res.error}`);
            }
        } catch (error: any) {
            toast.error(`Error al crear rol: ${error.message || 'Desconocido'}`);
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteRole = async (role_id: number, role_name: string) => {
        if (!window.confirm(`¿Estás seguro de eliminar el rol ${role_name}? Los usuarios con este rol pasarán a ser AGENT.`)) {
            return;
        }

        try {
            const res = await api.deleteRole(role_id);
            if (res.success) {
                toast.success(res.message);
                loadData();
            } else {
                toast.error(`Error: ${res.error}`);
            }
        } catch (error: any) {
            toast.error(`Error al eliminar rol: ${error.message || 'Desconocido'}`);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    const activeRoleDef = roles.find(r => r.id === selectedRoleId);
    const activeRolePerms = selectedRoleId ? (permissions[selectedRoleId] || []) : [];
    const isSaving = saving === selectedRoleId;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 p-6 lg:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/60 shadow-sm relative z-20">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        Roles y Permisos
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Gestione los perfiles de acceso y seguridad del sistema
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    {showNewRoleInput ? (
                        <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-300">
                            <input
                                autoFocus
                                type="text"
                                placeholder="Nombre del perfil..."
                                className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium w-64 shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all uppercase"
                                value={newRoleName}
                                onChange={(e) => setNewRoleName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleConfirmCreateRole();
                                    if (e.key === 'Escape') setShowNewRoleInput(false);
                                }}
                            />
                            <Button
                                size="sm"
                                onClick={handleConfirmCreateRole}
                                disabled={creating}
                                className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-9"
                            >
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Añadir'}
                            </Button>
                            <Button 
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowNewRoleInput(false)}
                                className="text-slate-500 h-9"
                            >
                                Cancelar
                            </Button>
                        </div>
                    ) : (
                        <Button
                            onClick={handleCreateRole}
                            disabled={creating}
                            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Nuevo Perfil
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 min-h-[600px] relative z-10">
                {/* Sidebar */}
                <div className="w-full lg:w-80 flex-shrink-0">
                    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col h-full">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-800">Perfiles Registrados</h3>
                            <Badge variant="secondary" className="bg-white border-slate-200 text-slate-500">
                                {roles.length}
                            </Badge>
                        </div>
                        <div className="flex flex-col overflow-y-auto p-3 space-y-1.5 h-[500px]">
                            {roles.map((r) => (
                                <button
                                    key={r.id}
                                    onClick={() => setSelectedRoleId(r.id)}
                                    className={cn(
                                        "w-full flex items-center justify-between p-3.5 rounded-xl transition-all duration-200 group relative",
                                        selectedRoleId === r.id 
                                            ? "bg-blue-50/80 border border-blue-100 shadow-sm" 
                                            : "hover:bg-slate-50 border border-transparent"
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "flex items-center justify-center w-9 h-9 rounded-lg shadow-sm font-bold text-white",
                                            r.is_system ? 'bg-purple-600' :
                                            r.role === 'MANAGER' ? 'bg-blue-600' :
                                            r.role === 'AGENT' ? 'bg-slate-600' : 'bg-indigo-500'
                                        )}>
                                            {r.role.charAt(0)}
                                        </div>
                                        <div className="flex flex-col items-start text-left">
                                            <span className={cn(
                                                "font-bold text-sm tracking-tight",
                                                selectedRoleId === r.id ? "text-blue-900" : "text-slate-700"
                                            )}>{r.role}</span>
                                            <span className="text-[11px] font-medium text-slate-500 mt-0.5">
                                                {permissions[r.id]?.length || 0} permisos
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {!r.is_system && selectedRoleId !== r.id && (
                                        <div 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteRole(r.id, r.role);
                                            }}
                                            className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 rounded-lg transition-all text-slate-400"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 min-w-0">
                    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm flex flex-col h-full overflow-hidden">
                        {activeRoleDef ? (
                            <>
                                {/* Role Header */}
                                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm text-white",
                                            activeRoleDef?.is_system ? 'bg-purple-600' :
                                            activeRoleDef.role === 'MANAGER' ? 'bg-blue-600' :
                                            activeRoleDef.role === 'AGENT' ? 'bg-slate-600' : 'bg-indigo-500'
                                        )}>
                                            <Shield className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <h2 className="text-xl font-bold text-slate-900">{activeRoleDef.role}</h2>
                                                {activeRoleDef?.is_system && (
                                                    <Badge variant="secondary" className="text-[10px] font-bold tracking-wider bg-slate-200/70 text-slate-600">
                                                        SISTEMA
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-slate-500 text-sm">Configuración de niveles de acceso del perfil</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-start sm:items-end gap-2 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                        <div className="flex items-center gap-3 w-full justify-between sm:justify-end">
                                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Cobertura</p>
                                            <span className="text-xl font-black text-slate-800">
                                                {Math.min(100, Math.round((activeRolePerms.length / ALL_PERMISSIONS_COUNT) * 100))}%
                                            </span>
                                        </div>
                                        <div className="w-48 sm:w-40 h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
                                                style={{ width: `${(activeRolePerms.length / ALL_PERMISSIONS_COUNT) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Permissions Content */}
                                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                                    {/* Action Bar */}
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                        <div className="relative w-full sm:max-w-md">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input 
                                                placeholder="Buscar permiso..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="pl-9 bg-slate-50/50 border-slate-200 focus:bg-white transition-colors"
                                            />
                                        </div>
                                        <Button
                                            onClick={() => handleSaveRole(activeRoleDef.id, activeRoleDef.role)}
                                            disabled={isSaving}
                                            className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white shadow-md active:scale-95 transition-all"
                                        >
                                            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                            Guardar Cambios
                                        </Button>
                                    </div>

                                    {/* Permissions List */}
                                    <Accordion type="multiple" defaultValue={PERMISSION_CATEGORIES.map(c => c.id)} className="space-y-4 pb-12">
                                        {PERMISSION_CATEGORIES.map(category => {
                                            const filteredPerms = category.permissions.filter(p => 
                                                p.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                                p.desc.toLowerCase().includes(searchQuery.toLowerCase())
                                            );

                                            if (filteredPerms.length === 0) return null;

                                            const allCatSelected = category.permissions.every(p => activeRolePerms.includes(p.id));
                                            
                                            return (
                                                <AccordionItem 
                                                    key={category.id} 
                                                    value={category.id}
                                                    className="border border-slate-200 bg-white shadow-sm rounded-xl overflow-hidden"
                                                >
                                                    <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-slate-50/80 transition-colors group">
                                                        <div className="flex items-center justify-between w-full pr-4">
                                                            <div className="flex items-center gap-3">
                                                                <h4 className="text-base font-bold text-slate-800">{category.label}</h4>
                                                                <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-bold">
                                                                    {filteredPerms.length}
                                                                </Badge>
                                                            </div>
                                                            <Button 
                                                                variant={allCatSelected ? "outline" : "secondary"}
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleToggleAllInCategory(activeRoleDef.id, category.id, !allCatSelected);
                                                                }}
                                                                className={cn(
                                                                    "h-8 text-xs font-bold px-3",
                                                                    allCatSelected ? "text-slate-600 border-slate-200 hover:bg-slate-50" : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                                                                )}
                                                            >
                                                                {allCatSelected ? 'Desactivar Todos' : 'Activar Todos'}
                                                            </Button>
                                                        </div>
                                                    </AccordionTrigger>
                                                    <AccordionContent className="px-5 pb-5 pt-0 bg-white">
                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-6 pt-4 border-t border-slate-100">
                                                            {filteredPerms.map(perm => {
                                                                const isChecked = activeRolePerms.includes(perm.id);
                                                                const isDisabled = activeRoleDef?.is_system;
                                                                
                                                                return (
                                                                    <div key={perm.id} className="flex items-start justify-between gap-4 p-3.5 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 group/item">
                                                                        <div className="flex flex-col space-y-1.5 flex-1">
                                                                            <Label className={cn(
                                                                                "text-sm font-bold cursor-pointer transition-colors",
                                                                                isChecked ? "text-slate-900" : "text-slate-600 group-hover/item:text-slate-800"
                                                                            )}>
                                                                                {perm.label}
                                                                            </Label>
                                                                            <span className="text-[11px] text-slate-500 leading-relaxed font-medium">
                                                                                {perm.desc}
                                                                            </span>
                                                                        </div>
                                                                        <div className="pt-0.5">
                                                                            <Switch
                                                                                disabled={isDisabled}
                                                                                checked={isChecked}
                                                                                onCheckedChange={(checked) => handleToggle(activeRoleDef.id, perm.id, checked)}
                                                                                className="data-[state=checked]:bg-emerald-500 shadow-sm"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </AccordionContent>
                                                </AccordionItem>
                                            )
                                        })}
                                    </Accordion>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-5 bg-slate-50/30 p-12">
                                <div className="p-8 rounded-[2rem] bg-white border border-slate-100 shadow-sm">
                                    <Shield className="w-16 h-16 text-slate-200" />
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-lg text-slate-700 mb-2">Seleccione un perfil</p>
                                    <p className="text-sm font-medium text-slate-500 max-w-sm mx-auto leading-relaxed">
                                        Elija un rol de la barra lateral izquierda para ver y administrar sus permisos.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
