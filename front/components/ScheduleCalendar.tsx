import React, { useState, useEffect } from 'react';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Plus,
    Clock,
    List,
    Target,
    Trash2,
    Play,
    Pause,
    LayoutGrid
} from 'lucide-react';
import { Button } from './ui/button';
import { StandardPageHeader } from './ui/layout/StandardPageHeader';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { cn } from './ui/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatForBackendAPI } from '@/lib/dateUtils';
import api from '../services/api';
import { toast } from 'sonner';
import ScheduleModal from './ScheduleModal';

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

const ScheduleCalendar: React.FC = () => {
    const timezone = useSettingsStore(state => state.timezone);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [view, setView] = useState<'day' | 'week' | 'month'>('month');

    // Calculate visible days based on view
    const getVisibleDays = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const days: (Date | null)[] = [];

        if (view === 'month') {
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const startingDayOfWeek = firstDay.getDay();

            // Padding
            for (let i = 0; i < startingDayOfWeek; i++) days.push(null);

            // Days
            for (let day = 1; day <= lastDay.getDate(); day++) {
                days.push(new Date(year, month, day));
            }
        } else if (view === 'week') {
            const curr = new Date(currentDate);
            const dayOfWeek = curr.getDay();
            // Adjust to start week on Monday (Monday = 0, Sunday = 6)
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const startOfWeek = new Date(curr);
            startOfWeek.setDate(curr.getDate() + mondayOffset);

            for (let i = 0; i < 7; i++) {
                const day = new Date(startOfWeek);
                day.setDate(startOfWeek.getDate() + i);
                days.push(day);
            }
        } else if (view === 'day') {
            const day = new Date(currentDate);
            day.setHours(0, 0, 0, 0);
            days.push(day);
        }

        return days;
    };

    useEffect(() => {
        fetchSchedules();
    }, [currentDate, view]);

    const fetchSchedules = async () => {
        try {
            setLoading(true);
            const visibleDays = getVisibleDays().filter(d => d !== null) as Date[];
            if (visibleDays.length === 0) return;

            const start = visibleDays[0];
            const end = visibleDays[visibleDays.length - 1];

            console.log('[DEBUG] fetchSchedules - view:', view, 'start:', formatForBackendAPI(start, timezone), 'end:', formatForBackendAPI(end, timezone));

            const response = await api.getUpcomingSchedules(
                formatForBackendAPI(start, timezone),
                formatForBackendAPI(end, timezone)
            );
            console.log('[DEBUG] fetchSchedules - response:', response);
            setSchedules(response as Schedule[]);
        } catch (error) {
            toast.error('Error al cargar programaciones');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSchedule = async (id: number) => {
        try {
            await api.deleteSchedule(id);
            toast.success('Programación eliminada');
            fetchSchedules();
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };



    const getSchedulesForDay = (date: Date | null) => {
        if (!date) return [];

        // Normalize the calendar date to midnight
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);
        const checkTime = checkDate.getTime();

        return schedules.filter(s => {
            // Start date at midnight
            const startDate = new Date(s.scheduled_at);
            startDate.setHours(0, 0, 0, 0);
            const startTime = startDate.getTime();

            // If date is before start, don't show
            if (checkTime < startTime) return false;

            // End date (if defined)
            let endTime: number | null = null;
            if (s.end_at) {
                const endDate = new Date(s.end_at);
                endDate.setHours(23, 59, 59, 999);
                endTime = endDate.getTime();
            }

            // For NON-RECURRING events
            if (s.recurring === 'none') {
                if (endTime !== null) {
                    // Has end date: show on all days from start to end
                    return checkTime >= startTime && checkTime <= endTime;
                } else {
                    // No end date: show ONLY on start date
                    return checkTime === startTime;
                }
            }

            // For RECURRING events
            const daysDiff = Math.floor((checkTime - startTime) / (1000 * 60 * 60 * 24));

            switch (s.recurring) {
                case 'daily':
                    // Every day from start date onwards
                    return daysDiff >= 0;

                case 'weekly':
                    // Same day of week as start date
                    return daysDiff >= 0 && daysDiff % 7 === 0;

                case 'monthly':
                    // Same day of month as start date
                    const startDay = startDate.getDate();
                    const checkDay = checkDate.getDate();
                    return checkDay === startDay && checkTime >= startTime;

                default:
                    return false;
            }
        });
    };

    const navigate = (direction: number) => {
        const newDate = new Date(currentDate);
        if (view === 'month') {
            newDate.setMonth(newDate.getMonth() + direction);
        } else if (view === 'week') {
            newDate.setDate(newDate.getDate() + (direction * 7));
        } else {
            newDate.setDate(newDate.getDate() + direction);
        }
        setCurrentDate(newDate);
    };

    const handleDayClick = (date: Date | null) => {
        if (date) {
            setSelectedDate(date);
            setSelectedSchedule(null);
            setIsModalOpen(true);
        }
    };

    const handleScheduleClick = (schedule: Schedule, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedSchedule(schedule);
        setSelectedDate(null);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setSelectedSchedule(null);
        setSelectedDate(null);
        fetchSchedules();
    };

    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const user = useAuthStore(state => state.getUser());

    return (
        <div className="p-6 space-y-6 relative z-20">
            <StandardPageHeader
                title="Programador"
                username={user?.name || ''}
                description="Programa activación y desactivación de campañas y listas"
            >
                <div className="flex items-center gap-4 w-full justify-end">
                    <div className="bg-slate-100 p-1 rounded-lg border flex items-center gap-1">
                        <Button
                            variant={view === 'day' ? 'outline' : 'ghost'}
                            size="icon"
                            className={cn("h-8 w-8", view === 'day' && "bg-white shadow-sm")}
                            onClick={() => setView('day')}
                        >
                            <Target className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={view === 'week' ? 'outline' : 'ghost'}
                            size="icon"
                            className={cn("h-8 w-8", view === 'week' && "bg-white shadow-sm")}
                            onClick={() => setView('week')}
                        >
                            <CalendarIcon className="w-4 h-4" />
                        </Button>
                        <Button
                            variant={view === 'month' ? 'outline' : 'ghost'}
                            size="icon"
                            className={cn("h-8 w-8", view === 'month' && "bg-white shadow-sm")}
                            onClick={() => setView('month')}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </Button>
                    </div>
                    <Button onClick={() => { setSelectedDate(new Date()); setIsModalOpen(true); }}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nueva Programación
                    </Button>
                </div>
            </StandardPageHeader>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar - takes 2 columns */}
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                                <ChevronLeft className="h-5 w-5" />
                            </Button>
                            <CardTitle className="text-xl capitalize">
                                {view === 'month'
                                    ? `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                                    : view === 'day'
                                        ? currentDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                                        : `Semana del ${getVisibleDays()[0]?.getDate()} de ${monthNames[getVisibleDays()[0]?.getMonth() || 0]}`
                                }
                            </CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => navigate(1)}>
                                <ChevronRight className="h-5 w-5" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {view === 'month' ? (
                            <div className="p-6 pt-0">
                                {/* Month View Headers */}
                                <div className="grid grid-cols-7 gap-1 mb-2">
                                    {dayNames.map(day => (
                                        <div key={day} className="text-center text-sm font-medium text-muted-foreground p-2">
                                            {day}
                                        </div>
                                    ))}
                                </div>
                                {/* Month Grid */}
                                <div className="grid grid-cols-7 gap-1">
                                    {getVisibleDays().map((date, index) => {
                                        const daySchedules = getSchedulesForDay(date);
                                        const isToday = date?.toDateString() === new Date().toDateString();

                                        return (
                                            <div
                                                key={index}
                                                onClick={() => handleDayClick(date)}
                                                className={cn(
                                                    "min-h-[100px] p-2 rounded-lg border cursor-pointer transition-colors relative",
                                                    date ? "hover:bg-muted/50" : "bg-transparent border-transparent",
                                                    isToday && "border-primary bg-primary/5"
                                                )}
                                            >
                                                {date && (
                                                    <>
                                                        <div className={cn(
                                                            "text-sm font-medium mb-1",
                                                            isToday && "text-primary"
                                                        )}>
                                                            {date.getDate()}
                                                        </div>
                                                        <div className="space-y-1">
                                                            {daySchedules.slice(0, 3).map(schedule => (
                                                                <div
                                                                    key={schedule.id}
                                                                    onClick={(e) => handleScheduleClick(schedule, e)}
                                                                    className={cn(
                                                                        "text-xs p-1 rounded truncate cursor-pointer",
                                                                        schedule.action === 'activate'
                                                                            ? "bg-green-500/20 text-green-700 dark:text-green-400"
                                                                            : "bg-red-500/20 text-red-700 dark:text-red-400",
                                                                        schedule.executed && "opacity-50"
                                                                    )}
                                                                >
                                                                    {schedule.schedule_type === 'campaign' ? <Target className="h-3 w-3 inline mr-1" /> : <List className="h-3 w-3 inline mr-1" />}
                                                                    {schedule.target_name || schedule.target_id}
                                                                </div>
                                                            ))}
                                                            {daySchedules.length > 3 && (
                                                                <div className="text-xs text-muted-foreground">
                                                                    +{daySchedules.length - 3} más
                                                                </div>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col h-[600px] overflow-hidden">
                                {/* Time Grid Header */}
                                <div className="flex border-b">
                                    <div className="w-16 flex-shrink-0 border-r bg-muted/30"></div>
                                    <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${view === 'week' ? 7 : 1}, 1fr)` }}>
                                        {getVisibleDays().filter(d => d !== null).map((date, i) => (
                                            <div key={i} className="p-2 text-center border-r last:border-r-0 bg-muted/10">
                                                <div className="text-xs text-muted-foreground uppercase">{dayNames[date!.getDay()]}</div>
                                                <div className={cn(
                                                    "text-lg font-semibold w-8 h-8 flex items-center justify-center rounded-full mx-auto",
                                                    date?.toDateString() === new Date().toDateString() && "bg-primary text-primary-foreground"
                                                )}>
                                                    {date!.getDate()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Time Grid Body */}
                                <div className="flex-1 overflow-y-auto relative">
                                    <div className="flex min-h-[1440px]"> {/* 60px * 24 hours */}
                                        {/* Time Labels */}
                                        <div className="w-16 flex-shrink-0 border-r bg-muted/10 flex flex-col pointer-events-none sticky left-0 z-10 bg-white">
                                            {Array.from({ length: 24 }).map((_, hour) => (
                                                <div key={hour} className="h-[60px] relative">
                                                    <span className="absolute -top-3 right-2 text-xs text-muted-foreground">
                                                        {hour === 0 ? '' : `${hour}:00`}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Grid Columns */}
                                        <div className="flex-1 grid relative" style={{ gridTemplateColumns: `repeat(${view === 'week' ? 7 : 1}, 1fr)` }}>
                                            {/* Horizontal Hour Lines (Background) */}
                                            <div className="absolute inset-0 z-0 flex flex-col pointer-events-none">
                                                {Array.from({ length: 24 }).map((_, hour) => (
                                                    <div key={hour} className="h-[60px] border-b border-dashed border-slate-200"></div>
                                                ))}
                                            </div>

                                            {/* Columns */}
                                            {getVisibleDays().filter(d => d !== null).map((date, colIndex) => {
                                                const daySchedules = getSchedulesForDay(date);

                                                // Calculate overlapping events and assign columns
                                                const eventsWithLayout = daySchedules.map(schedule => {
                                                    const start = new Date(schedule.scheduled_at);
                                                    const end = schedule.end_at ? new Date(schedule.end_at) : new Date(start.getTime() + 60 * 60 * 1000); // Default 1 hour
                                                    return { ...schedule, startTime: start.getTime(), endTime: end.getTime(), column: 0, totalColumns: 1 };
                                                });

                                                // Sort by start time
                                                eventsWithLayout.sort((a, b) => a.startTime - b.startTime);

                                                // Assign columns to overlapping events
                                                for (let i = 0; i < eventsWithLayout.length; i++) {
                                                    const event = eventsWithLayout[i];
                                                    const overlapping = eventsWithLayout.filter((e, j) =>
                                                        j !== i &&
                                                        e.startTime < event.endTime &&
                                                        e.endTime > event.startTime
                                                    );

                                                    // Find used columns among overlapping events
                                                    const usedColumns = overlapping.map(e => e.column);
                                                    let col = 0;
                                                    while (usedColumns.includes(col)) col++;
                                                    event.column = col;

                                                    // Update total columns for all overlapping events
                                                    const maxCol = Math.max(col, ...overlapping.map(e => e.column));
                                                    event.totalColumns = maxCol + 1;
                                                    overlapping.forEach(e => e.totalColumns = Math.max(e.totalColumns, maxCol + 1));
                                                }

                                                return (
                                                    <div key={colIndex} className="relative border-r last:border-r-0 h-full group" onClick={() => handleDayClick(date)}>
                                                        {/* Events */}
                                                        {eventsWithLayout.map(schedule => {
                                                            const start = new Date(schedule.scheduled_at);
                                                            const startHour = start.getHours();
                                                            const startMin = start.getMinutes();
                                                            const top = (startHour + startMin / 60) * 60; // 60px per hour

                                                            // Calculate height based on duration
                                                            let height = 50; // Default height
                                                            if (schedule.end_at) {
                                                                const end = new Date(schedule.end_at);
                                                                const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                                                                height = Math.max(30, durationHours * 60); // Minimum 30px, 60px per hour
                                                            }

                                                            // Calculate width and left position for overlapping events
                                                            const width = schedule.totalColumns > 1 ? `calc(${100 / schedule.totalColumns}% - 2px)` : 'calc(100% - 8px)';
                                                            const left = schedule.totalColumns > 1 ? `calc(${(schedule.column / schedule.totalColumns) * 100}% + 2px)` : '4px';

                                                            return (
                                                                <div
                                                                    key={schedule.id}
                                                                    onClick={(e) => handleScheduleClick(schedule, e)}
                                                                    className={cn(
                                                                        "absolute p-1 rounded text-xs border shadow-sm cursor-pointer hover:brightness-95 transition-all z-10 overflow-hidden",
                                                                        schedule.action === 'activate'
                                                                            ? "bg-green-100 border-green-200 text-green-800"
                                                                            : "bg-red-100 border-red-200 text-red-800",
                                                                        schedule.executed && "opacity-60 grayscale"
                                                                    )}
                                                                    style={{ top: `${top}px`, height: `${height}px`, width, left }}
                                                                >
                                                                    <div className="font-semibold truncate">
                                                                        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {schedule.target_name || schedule.target_id}
                                                                    </div>
                                                                    <div className="truncate opacity-80">
                                                                        {schedule.schedule_type === 'campaign' ? 'Campaña' : 'Lista'} {schedule.action === 'activate' ? 'Activar' : 'Desactivar'}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}

                                                        {/* Current Time Indicator (if Today) */}
                                                        {date?.toDateString() === new Date().toDateString() && (
                                                            <div
                                                                className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none flex items-center"
                                                                style={{ top: `${(new Date().getHours() + new Date().getMinutes() / 60) * 60}px` }}
                                                            >
                                                                <div className="w-2 h-2 rounded-full bg-red-500 -ml-1"></div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Upcoming schedules list - takes 1 column */}
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            Programaciones
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-center py-4 text-muted-foreground">Cargando...</div>
                        ) : schedules.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground">
                                No hay programaciones
                            </div>
                        ) : (() => {
                            const now = new Date();

                            // Classify schedules by status
                            const getStatus = (s: Schedule) => {
                                const start = new Date(s.scheduled_at);
                                const end = s.end_at ? new Date(s.end_at) : null;

                                // If has end time, check if we're past it
                                if (end && now > end) return 'completada';

                                // If currently in range (start <= now <= end or start <= now if no end)
                                if (now >= start && (!end || now <= end)) return 'en_curso';

                                // If start time hasn't arrived yet
                                if (now < start) return 'programada';

                                // For schedules without end time that have been executed
                                if (s.executed && !end) return 'completada';

                                return 'programada';
                            };

                            const enCurso = schedules.filter(s => getStatus(s) === 'en_curso');
                            const programadas = schedules.filter(s => getStatus(s) === 'programada');
                            const completadas = schedules.filter(s => getStatus(s) === 'completada');

                            const renderSchedule = (schedule: Schedule, status: string) => (
                                <div
                                    key={schedule.id}
                                    className={cn(
                                        "flex items-center justify-between p-3 rounded-lg border",
                                        status === 'en_curso' && "bg-blue-50 border-blue-200",
                                        status === 'completada' && "bg-gray-50 border-gray-200 opacity-70"
                                    )}
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        {schedule.schedule_type === 'campaign' ? (
                                            <Target className="h-5 w-5 text-blue-500 flex-shrink-0" />
                                        ) : (
                                            <List className="h-5 w-5 text-purple-500 flex-shrink-0" />
                                        )}
                                        <div className="min-w-0">
                                            <div className="font-medium truncate">{schedule.target_name || schedule.target_id}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(schedule.scheduled_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                                                {schedule.end_at && ` → ${new Date(schedule.end_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}`}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <Badge variant={schedule.action === 'activate' ? 'default' : 'destructive'} className="text-xs">
                                            {schedule.action === 'activate' ? (
                                                <><Play className="h-3 w-3 mr-1" /> Activar</>
                                            ) : (
                                                <><Pause className="h-3 w-3 mr-1" /> Desactivar</>
                                            )}
                                        </Badge>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => handleDeleteSchedule(schedule.id)}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            );

                            return (
                                <div className="space-y-4">
                                    {/* En Curso */}
                                    {enCurso.length > 0 && (
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                                                <span className="text-sm font-medium text-blue-700">En Curso ({enCurso.length})</span>
                                            </div>
                                            <div className="space-y-2">
                                                {enCurso.map(s => renderSchedule(s, 'en_curso'))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Programadas */}
                                    {programadas.length > 0 && (
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                                <span className="text-sm font-medium text-orange-700">Programadas ({programadas.length})</span>
                                            </div>
                                            <div className="space-y-2">
                                                {programadas.slice(0, 5).map(s => renderSchedule(s, 'programada'))}
                                                {programadas.length > 5 && (
                                                    <div className="text-xs text-muted-foreground text-center">
                                                        +{programadas.length - 5} más
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Completadas */}
                                    {completadas.length > 0 && (
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                                    <span className="text-sm font-medium text-gray-600">Completadas ({completadas.length})</span>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                {completadas.slice(0, 3).map(s => renderSchedule(s, 'completada'))}
                                                {completadas.length > 3 && (
                                                    <div className="text-xs text-muted-foreground text-center">
                                                        +{completadas.length - 3} más
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Empty state */}
                                    {enCurso.length === 0 && programadas.length === 0 && completadas.length === 0 && (
                                        <div className="text-center py-4 text-muted-foreground">
                                            No hay programaciones
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </CardContent>
                </Card>
            </div>

            <ScheduleModal
                isOpen={isModalOpen}
                onClose={handleModalClose}
                schedule={selectedSchedule}
                defaultDate={selectedDate}
            />
        </div>
    );
};

export default ScheduleCalendar;
