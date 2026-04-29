import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Clock, Target, List, Play, Pause, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import api from '../services/api';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';

interface Schedule {
    id: number;
    schedule_type: 'list' | 'campaign';
    target_id: string;
    target_name: string;
    action: 'activate' | 'deactivate';
    scheduled_at: string;
    end_at: string | null;
    executed: boolean;
    recurring: 'none' | 'daily' | 'weekly' | 'monthly';
}

interface ScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    schedule: Schedule | null;
    defaultDate: Date | null;
}

interface Campaign {
    campaign_id: string;
    campaign_name: string;
    active: string;
}

interface ListItem {
    list_id: string;
    list_name: string;
    active: string;
    campaign_id: string;
}

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, schedule, defaultDate }) => {
    const [loading, setLoading] = useState(false);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [lists, setLists] = useState<ListItem[]>([]);

    // Get user's allowed campaigns from auth store - select raw data to avoid loops
    const sessionCampaigns = useAuthStore(state => state.session?.campaigns);

    // Memoize the campaign IDs to avoid recalculating on every render
    const userCampaignIds = useMemo(() =>
        (sessionCampaigns || []).map(c => c.id),
        [sessionCampaigns]
    );

    const [formData, setFormData] = useState({
        schedule_type: 'campaign' as 'list' | 'campaign',
        target_id: '',
        action: 'activate' as 'activate' | 'deactivate',
        scheduled_date: '',
        scheduled_time: '',
        end_date: '',
        end_time: '',
        recurring: 'none' as 'none' | 'daily' | 'weekly' | 'monthly'
    });

    useEffect(() => {
        if (isOpen) {
            fetchTargets();

            if (schedule) {
                // Editing existing schedule - use local date formatting
                const scheduledAt = new Date(schedule.scheduled_at);
                const endAt = schedule.end_at ? new Date(schedule.end_at) : null;

                // Format dates using local time (YYYY-MM-DD)
                const formatLocalDate = (d: Date) => {
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                };

                // Format time using local time (HH:MM)
                const formatLocalTime = (d: Date) => {
                    const hours = String(d.getHours()).padStart(2, '0');
                    const minutes = String(d.getMinutes()).padStart(2, '0');
                    return `${hours}:${minutes}`;
                };

                setFormData({
                    schedule_type: schedule.schedule_type,
                    target_id: schedule.target_id,
                    action: schedule.action,
                    scheduled_date: formatLocalDate(scheduledAt),
                    scheduled_time: formatLocalTime(scheduledAt),
                    end_date: endAt ? formatLocalDate(endAt) : '',
                    end_time: endAt ? formatLocalTime(endAt) : '',
                    recurring: schedule.recurring
                });
            } else if (defaultDate) {
                // New schedule with default date
                // Set default time to current time + 5 minutes, rounded to next 5-minute interval
                const now = new Date();
                now.setMinutes(now.getMinutes() + 5);
                const roundedMinutes = Math.ceil(now.getMinutes() / 5) * 5;
                now.setMinutes(roundedMinutes);
                const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes() % 60).padStart(2, '0')}`;

                // Use today's date if defaultDate is in the past
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const selectedDate = defaultDate >= today ? defaultDate : new Date();

                setFormData(prev => ({
                    ...prev,
                    schedule_type: 'campaign',
                    target_id: '',
                    action: 'activate',
                    scheduled_date: selectedDate.toISOString().slice(0, 10),
                    scheduled_time: defaultTime,
                    end_date: '',
                    end_time: '',
                    recurring: 'none'
                }));
            }
        }
    }, [isOpen, schedule, defaultDate]);

    const fetchTargets = async () => {
        try {
            // Fetch both campaigns and lists
            const [campaignsRes, listsRes] = await Promise.all([
                api.getScheduleTargetCampaigns(),
                api.getScheduleTargetLists()
            ]);

            // Filter campaigns to only those the user has access to
            const filteredCampaigns = (campaignsRes as Campaign[]).filter(campaign =>
                userCampaignIds.includes(campaign.campaign_id)
            );
            setCampaigns(filteredCampaigns);

            // Filter lists to only those belonging to user's campaigns
            const filteredLists = (listsRes as ListItem[]).filter(list =>
                userCampaignIds.includes(list.campaign_id)
            );
            setLists(filteredLists);
        } catch (error) {
            console.error('Error fetching targets:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.target_id || !formData.scheduled_date || !formData.scheduled_time) {
            toast.error('Por favor completa todos los campos requeridos');
            return;
        }

        // Validate that scheduled date/time is not in the past
        const scheduledDateTime = new Date(`${formData.scheduled_date}T${formData.scheduled_time}`);
        const now = new Date();

        if (scheduledDateTime <= now) {
            toast.error('La fecha y hora de inicio debe ser mayor a la fecha y hora actual');
            return;
        }

        setLoading(true);

        try {
            const scheduled_at = `${formData.scheduled_date} ${formData.scheduled_time}:00`;
            const end_at = formData.end_date && formData.end_time
                ? `${formData.end_date} ${formData.end_time}:00`
                : null;

            const targetName = formData.schedule_type === 'campaign'
                ? campaigns.find(c => c.campaign_id === formData.target_id)?.campaign_name
                : lists.find(l => l.list_id.toString() === formData.target_id)?.list_name;

            const payload = {
                schedule_type: formData.schedule_type,
                target_id: formData.target_id,
                target_name: targetName || formData.target_id,
                action: formData.action,
                scheduled_at,
                end_at,
                recurring: formData.recurring
            };

            if (schedule) {
                await api.updateSchedule(schedule.id, payload);
                toast.success('Programación actualizada');
            } else {
                await api.createSchedule(payload);
                toast.success('Programación creada');
            }

            onClose();
        } catch (error) {
            toast.error('Error al guardar programación');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!schedule) return;

        if (!confirm('¿Estás seguro de eliminar esta programación?')) return;

        try {
            await api.deleteSchedule(schedule.id);
            toast.success('Programación eliminada');
            onClose();
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-background rounded-lg shadow-xl w-full max-w-md p-6 m-4">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        {schedule ? 'Editar Programación' : 'Nueva Programación'}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Type Selection */}
                    <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select
                            value={formData.schedule_type}
                            onValueChange={(v) => setFormData(prev => ({ ...prev, schedule_type: v as 'list' | 'campaign', target_id: '' }))}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="campaign">
                                    <div className="flex items-center gap-2">
                                        <Target className="h-4 w-4" /> Campaña
                                    </div>
                                </SelectItem>
                                <SelectItem value="list">
                                    <div className="flex items-center gap-2">
                                        <List className="h-4 w-4" /> Lista
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Target Selection */}
                    <div className="space-y-2">
                        <Label>{formData.schedule_type === 'campaign' ? 'Campaña' : 'Lista'}</Label>
                        <Select
                            value={formData.target_id}
                            onValueChange={(v) => setFormData(prev => ({ ...prev, target_id: v }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar..." />
                            </SelectTrigger>
                            <SelectContent>
                                {formData.schedule_type === 'campaign' ? (
                                    campaigns.map(c => (
                                        <SelectItem key={c.campaign_id} value={c.campaign_id}>
                                            {c.campaign_name} ({c.active === 'Y' ? 'Activa' : 'Inactiva'})
                                        </SelectItem>
                                    ))
                                ) : (
                                    lists.map(l => (
                                        <SelectItem key={l.list_id} value={l.list_id.toString()}>
                                            {l.list_name} ({l.active === 'Y' ? 'Activa' : 'Inactiva'})
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Action Selection */}
                    <div className="space-y-2">
                        <Label>Acción</Label>
                        <Select
                            value={formData.action}
                            onValueChange={(v) => setFormData(prev => ({ ...prev, action: v as 'activate' | 'deactivate' }))}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="activate">
                                    <div className="flex items-center gap-2">
                                        <Play className="h-4 w-4 text-green-500" /> Activar
                                    </div>
                                </SelectItem>
                                <SelectItem value="deactivate">
                                    <div className="flex items-center gap-2">
                                        <Pause className="h-4 w-4 text-red-500" /> Desactivar
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Start Date/Time */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Fecha Inicio</Label>
                            <Input
                                type="date"
                                value={formData.scheduled_date}
                                onChange={(e) => setFormData(prev => ({ ...prev, scheduled_date: e.target.value }))}
                                min={new Date().toISOString().slice(0, 10)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Hora Inicio</Label>
                            <Input
                                type="time"
                                value={formData.scheduled_time}
                                onChange={(e) => setFormData(prev => ({ ...prev, scheduled_time: e.target.value }))}
                                min={formData.scheduled_date === new Date().toISOString().slice(0, 10)
                                    ? `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
                                    : undefined}
                                required
                            />
                        </div>
                    </div>


                    {/* Actions */}
                    <div className="flex gap-2 pt-4">
                        {schedule && (
                            <Button type="button" variant="destructive" onClick={handleDelete}>
                                Eliminar
                            </Button>
                        )}
                        <div className="flex-1" />
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Guardando...' : schedule ? 'Actualizar' : 'Crear'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ScheduleModal;
