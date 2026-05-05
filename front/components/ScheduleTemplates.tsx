import React, { useEffect, useMemo, useState } from 'react';
import {
    Clock,
    Plus,
    Pencil,
    Trash2,
    Calendar as CalendarIcon,
    Save,
    Loader2,
    Globe,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from './ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './ui/select';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from './ui/alert-dialog';
import { StandardPageHeader } from './ui/layout/StandardPageHeader';
import { useAuthStore } from '@/stores/authStore';
import api from '../services/api';
import { toast } from 'sonner';

const TZ_PRESETS = [
    'America/Mexico_City',
    'America/Bogota',
    'America/Lima',
    'America/Santiago',
    'America/Argentina/Buenos_Aires',
    'America/Caracas',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/Madrid',
    'UTC',
];

const DAY_LABELS: { v: number; short: string; long: string }[] = [
    { v: 1, short: 'Lun', long: 'Lunes' },
    { v: 2, short: 'Mar', long: 'Martes' },
    { v: 3, short: 'Mié', long: 'Miércoles' },
    { v: 4, short: 'Jue', long: 'Jueves' },
    { v: 5, short: 'Vie', long: 'Viernes' },
    { v: 6, short: 'Sáb', long: 'Sábado' },
    { v: 0, short: 'Dom', long: 'Domingo' },
];

interface ScheduleWindow {
    id: string;
    days: number[];
    start: string;
    end: string;
}

interface ScheduleTemplate {
    id: number;
    name: string;
    description: string | null;
    timezone: string;
    enabled: boolean;
    windows: { days: number[]; start: string; end: string }[];
    campaign_count: number;
    created_at: string;
    updated_at: string;
}

function newWindowId() {
    return `w${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function padHHMM(t: string, fallback: string) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
    if (!m) return fallback;
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function emptyWindow(): ScheduleWindow {
    return { id: newWindowId(), days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' };
}

function describeWindow(w: { days: number[]; start: string; end: string }) {
    const labels = DAY_LABELS.filter((d) => w.days.includes(d.v))
        .map((d) => d.short)
        .join(', ');
    return `${labels || '—'} · ${w.start}–${w.end}`;
}

interface EditorState {
    open: boolean;
    template: ScheduleTemplate | null;
}

const ScheduleTemplates: React.FC = () => {
    const user = useAuthStore((s) => s.getUser());
    const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [editor, setEditor] = useState<EditorState>({ open: false, template: null });
    const [confirmDelete, setConfirmDelete] = useState<ScheduleTemplate | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const res: any = await api.listScheduleTemplates();
            const list: ScheduleTemplate[] = Array.isArray(res?.data) ? res.data : [];
            setTemplates(list);
        } catch (err: any) {
            toast.error(err.message || 'Error al cargar horarios');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTemplates();
    }, []);

    const openCreate = () => setEditor({ open: true, template: null });
    const openEdit = (tpl: ScheduleTemplate) => setEditor({ open: true, template: tpl });
    const closeEditor = () => setEditor({ open: false, template: null });

    const handleSaved = async () => {
        closeEditor();
        await loadTemplates();
    };

    const handleDelete = async () => {
        if (!confirmDelete) return;
        setDeletingId(confirmDelete.id);
        try {
            await api.deleteScheduleTemplate(confirmDelete.id);
            toast.success('Horario eliminado');
            setConfirmDelete(null);
            await loadTemplates();
        } catch (err: any) {
            toast.error(err.message || 'Error al eliminar');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="p-6 space-y-6 relative z-20">
            <StandardPageHeader
                title="Horarios"
                username={user?.name || ''}
                description="Plantillas de horario reutilizables. Asigna un horario en cada campaña para definir cuándo se permite marcar."
            >
                <div className="w-full flex justify-end">
                    <Button onClick={openCreate} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Nuevo horario
                    </Button>
                </div>
            </StandardPageHeader>

            {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Cargando horarios…
                </div>
            ) : templates.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
                        <CalendarIcon className="w-10 h-10 text-slate-400" />
                        <div className="text-base font-medium text-slate-700">
                            Aún no hay horarios definidos
                        </div>
                        <p className="text-sm text-slate-500 max-w-md">
                            Crea un horario y luego asígnalo a una o varias campañas. Fuera de las
                            ventanas configuradas el dialer no originará llamadas.
                        </p>
                        <Button onClick={openCreate} className="mt-2 gap-2">
                            <Plus className="w-4 h-4" />
                            Crear primer horario
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {templates.map((tpl) => (
                        <Card key={tpl.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                            <span className="truncate">{tpl.name}</span>
                                        </CardTitle>
                                        {tpl.description && (
                                            <CardDescription className="mt-1 line-clamp-2">
                                                {tpl.description}
                                            </CardDescription>
                                        )}
                                    </div>
                                    <Badge
                                        variant={tpl.enabled ? 'default' : 'secondary'}
                                        className={tpl.enabled ? 'bg-emerald-600' : ''}
                                    >
                                        {tpl.enabled ? 'Activo' : 'Inactivo'}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Globe className="w-3.5 h-3.5" />
                                    <span className="font-mono">{tpl.timezone}</span>
                                </div>

                                <div className="space-y-1.5">
                                    {tpl.windows.length === 0 ? (
                                        <div className="text-xs text-slate-400 italic">
                                            Sin ventanas definidas
                                        </div>
                                    ) : (
                                        tpl.windows.slice(0, 3).map((w, i) => (
                                            <div
                                                key={i}
                                                className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1"
                                            >
                                                {describeWindow(w)}
                                            </div>
                                        ))
                                    )}
                                    {tpl.windows.length > 3 && (
                                        <div className="text-xs text-slate-500 italic">
                                            + {tpl.windows.length - 3} más
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t">
                                    <div className="text-xs text-slate-500">
                                        {tpl.campaign_count > 0
                                            ? `${tpl.campaign_count} campaña${tpl.campaign_count === 1 ? '' : 's'}`
                                            : 'Sin campañas'}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => openEdit(tpl)}
                                            className="h-8 gap-1"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                            Editar
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setConfirmDelete(tpl)}
                                            className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <ScheduleTemplateEditor
                key={editor.template?.id ?? 'new'}
                open={editor.open}
                template={editor.template}
                onClose={closeEditor}
                onSaved={handleSaved}
            />

            <AlertDialog
                open={!!confirmDelete}
                onOpenChange={(o) => !o && !deletingId && setConfirmDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar horario</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmDelete?.campaign_count
                                ? `Este horario está asignado a ${confirmDelete.campaign_count} campaña${confirmDelete.campaign_count === 1 ? '' : 's'}. Al eliminarlo, esas campañas conservarán su última configuración pero quedarán sin plantilla asociada.`
                                : 'Esta acción no se puede deshacer.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={!!deletingId}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={!!deletingId}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {deletingId ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                'Eliminar'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

interface EditorProps {
    open: boolean;
    template: ScheduleTemplate | null;
    onClose: () => void;
    onSaved: () => void;
}

const ScheduleTemplateEditor: React.FC<EditorProps> = ({ open, template, onClose, onSaved }) => {
    const [name, setName] = useState(template?.name || '');
    const [description, setDescription] = useState(template?.description || '');
    const [timezone, setTimezone] = useState(template?.timezone || 'America/Mexico_City');
    const [enabled, setEnabled] = useState(template?.enabled ?? true);
    const [windows, setWindows] = useState<ScheduleWindow[]>(() =>
        template?.windows?.length
            ? template.windows.map((w, i) => ({
                  id: `w${i}-${Date.now()}`,
                  days: Array.isArray(w.days) ? [...w.days] : [],
                  start: padHHMM(w.start, '09:00'),
                  end: padHHMM(w.end, '18:00'),
              }))
            : [emptyWindow()]
    );
    const [saving, setSaving] = useState(false);

    const isEdit = !!template;

    const validationError = useMemo(() => {
        if (!name.trim()) return 'El nombre es obligatorio';
        if (enabled) {
            for (const w of windows) {
                if (!w.days || w.days.length === 0) {
                    return 'Cada ventana debe incluir al menos un día';
                }
            }
        }
        return null;
    }, [name, enabled, windows]);

    const handleAddWindow = () => setWindows((prev) => [...prev, emptyWindow()]);
    const handleRemoveWindow = (id: string) =>
        setWindows((prev) => (prev.length <= 1 ? prev : prev.filter((w) => w.id !== id)));

    const toggleDay = (winId: string, day: number) => {
        setWindows((prev) =>
            prev.map((w) =>
                w.id !== winId
                    ? w
                    : {
                          ...w,
                          days: w.days.includes(day)
                              ? w.days.filter((d) => d !== day)
                              : [...w.days, day].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)),
                      }
            )
        );
    };

    const handleSave = async () => {
        if (validationError) {
            toast.error(validationError);
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name: name.trim(),
                description: description.trim() || null,
                timezone: timezone.trim() || 'America/Mexico_City',
                enabled,
                windows: windows.map(({ days, start, end }) => ({
                    days: [...days].sort((a, b) => a - b),
                    start: padHHMM(start, '09:00'),
                    end: padHHMM(end, '18:00'),
                })),
            };
            if (isEdit && template) {
                await api.updateScheduleTemplate(template.id, payload);
                toast.success('Horario actualizado');
            } else {
                await api.createScheduleTemplate(payload);
                toast.success('Horario creado');
            }
            onSaved();
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-amber-600" />
                        {isEdit ? 'Editar horario' : 'Nuevo horario'}
                    </DialogTitle>
                    <DialogDescription>
                        Define ventanas semanales en una zona horaria. Las campañas que usen este
                        horario sólo marcarán dentro de esos rangos.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2 space-y-2">
                            <Label>Nombre</Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="p. ej. Horario laboral L-V"
                                maxLength={120}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Estado</Label>
                            <div className="h-10 flex items-center gap-3 rounded-md border border-slate-200 px-3 bg-white">
                                <Switch checked={enabled} onCheckedChange={setEnabled} />
                                <span className="text-sm text-slate-600">
                                    {enabled ? 'Restringido' : 'Sin restricción'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Descripción (opcional)</Label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Para qué se usa este horario"
                            rows={2}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Zona horaria (IANA)</Label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Select value={timezone} onValueChange={setTimezone}>
                                <SelectTrigger className="font-mono text-sm sm:max-w-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-h-64">
                                    {TZ_PRESETS.map((tz) => (
                                        <SelectItem key={tz} value={tz} className="font-mono text-xs">
                                            {tz}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input
                                className="font-mono text-sm flex-1"
                                value={timezone}
                                onChange={(e) => setTimezone(e.target.value.trim())}
                                placeholder="p. ej. America/Mexico_City"
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-semibold">Ventanas permitidas</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleAddWindow}
                                className="h-8 gap-1"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Añadir ventana
                            </Button>
                        </div>

                        {windows.map((win) => (
                            <div
                                key={win.id}
                                className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
                            >
                                <div className="flex flex-wrap gap-1.5">
                                    {DAY_LABELS.map(({ v, short, long }) => {
                                        const on = win.days.includes(v);
                                        return (
                                            <button
                                                key={v}
                                                type="button"
                                                title={long}
                                                onClick={() => toggleDay(win.id, v)}
                                                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                                                    on
                                                        ? 'bg-amber-500 text-white border-amber-600'
                                                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                                                }`}
                                            >
                                                {short}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
                                    <div>
                                        <Label className="text-[10px] text-slate-500 uppercase">Inicio</Label>
                                        <Input
                                            type="time"
                                            className="h-9 mt-1 font-mono text-sm bg-white"
                                            value={padHHMM(win.start, '09:00')}
                                            onChange={(e) =>
                                                setWindows((prev) =>
                                                    prev.map((w) =>
                                                        w.id === win.id ? { ...w, start: e.target.value } : w
                                                    )
                                                )
                                            }
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-slate-500 uppercase">Fin</Label>
                                        <Input
                                            type="time"
                                            className="h-9 mt-1 font-mono text-sm bg-white"
                                            value={padHHMM(win.end, '18:00')}
                                            onChange={(e) =>
                                                setWindows((prev) =>
                                                    prev.map((w) =>
                                                        w.id === win.id ? { ...w, end: e.target.value } : w
                                                    )
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={windows.length <= 1}
                                            onClick={() => handleRemoveWindow(win.id)}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4 mr-1" />
                                            Quitar
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    Si la hora de fin es menor que la de inicio, se interpreta como ventana nocturna (cruza medianoche).
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={saving || !!validationError} className="gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Guardando…' : isEdit ? 'Actualizar' : 'Crear'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ScheduleTemplates;
