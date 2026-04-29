import { useBackgroundTasks, BackgroundTask } from '@/stores/useBackgroundTasks';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import {
    Loader2,
    CheckCircle2,
    XCircle,
    X,
    ChevronDown,
    ChevronUp,
    Upload,
    FileSpreadsheet,
    Bell,
    Play,
    Pause,
    Clock,
} from 'lucide-react';
import { cn } from './ui/utils';

interface TaskItemProps {
    task: BackgroundTask;
    onRemove: () => void;
    onCancel?: () => void;
    onPause?: () => void;
    onResume?: () => void;
}

function TaskItem({ task, onRemove, onCancel, onPause, onResume }: TaskItemProps) {
    const isCompleted = task.status === 'completed';
    const isFailed = task.status === 'failed';
    const isRunning = task.status === 'running';
    const isPending = task.status === 'pending';
    const isPaused = task.status === 'paused';

    const StatusIcon = () => {
        if (isCompleted) return <CheckCircle2 className="w-5 h-5 text-green-500" />;
        if (isFailed) return <XCircle className="w-5 h-5 text-red-500" />;
        if (isRunning) return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
        if (isPaused) return <Pause className="w-5 h-5 text-amber-500" />;
        return <Clock className="w-5 h-5 text-slate-400" />;
    };

    const StatusBadge = () => {
        if (isCompleted) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Completado</Badge>;
        if (isFailed) return <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">Error</Badge>;
        if (isRunning) return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Procesando</Badge>;
        if (isPaused) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">Pausado</Badge>;
        return <Badge variant="secondary">Pendiente</Badge>;
    };

    return (
        <div className={`p-3 rounded-lg border ${isFailed ? 'border-red-100 bg-red-50/50' : isPaused ? 'border-amber-100 bg-amber-50/30' : 'border-slate-100 bg-white'} transition-all`}>
            <div className="flex items-start gap-3">
                <div className="mt-1">
                    <StatusIcon />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-slate-900 truncate pr-2">
                            {task.title}
                        </p>
                        <div className="flex items-center gap-1">
                            {onPause && isRunning && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-slate-500 hover:text-amber-600 hover:bg-amber-50"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPause();
                                    }}
                                    title="Pausar"
                                >
                                    <Pause className="w-3 h-3" />
                                </Button>
                            )}
                            {onResume && isPaused && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-slate-500 hover:text-green-600 hover:bg-green-50"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onResume();
                                    }}
                                    title="Reanudar"
                                >
                                    <Play className="w-3 h-3" />
                                </Button>
                            )}
                            {onCancel && (isRunning || isPending || isPaused) && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-slate-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCancel();
                                    }}
                                    title="Cancelar"
                                >
                                    <XCircle className="w-3 h-3" />
                                </Button>
                            )}
                            <div className="ml-1">
                                <StatusBadge />
                            </div>
                        </div>
                    </div>
                    {task.description && (
                        <p className="text-xs text-slate-500 mb-2">
                            {task.description}
                        </p>
                    )}

                    {/* Progress Bar */}
                    {(isRunning || isPending || isPaused) && (
                        <div className="space-y-1">
                            <Progress value={task.progress} className={`h-1.5 ${isPaused ? 'opacity-70' : ''}`} />
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>
                                    {task.metadata?.processedRecords || 0} de {task.metadata?.totalRecords || '?'} registros
                                </span>
                                <span>{Math.round(task.progress)}%</span>
                            </div>
                            {(task.metadata?.successfulRecords !== undefined || task.metadata?.failedRecords !== undefined) && (
                                <div className="flex gap-3 text-xs pt-1">
                                    {task.metadata.successfulRecords !== undefined && (
                                        <span className="text-green-600 flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> {task.metadata.successfulRecords}
                                        </span>
                                    )}
                                    {task.metadata.failedRecords !== undefined && Number(task.metadata.failedRecords) > 0 && (
                                        <span className="text-red-600 flex items-center gap-1">
                                            <XCircle className="w-3 h-3" /> {task.metadata.failedRecords}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Summary for completed */}
                    {isCompleted && task.metadata && (
                        <div className="text-xs text-green-700 mt-1">
                            ✓ {task.metadata.successfulRecords} registros exitosos
                            {task.metadata.failedRecords ? ` · ${task.metadata.failedRecords} errores` : ''}
                        </div>
                    )}

                    {/* Error message */}
                    {isFailed && task.error && (
                        <p className="text-xs text-red-600 mt-1 font-medium">
                            {task.error}
                        </p>
                    )}
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

export function BackgroundTasksPanel() {
    const { tasks, isMinimized, toggleMinimized, removeTask, clearCompleted } = useBackgroundTasks();

    // Don't render if no tasks
    if (tasks.length === 0) {
        return null;
    }

    const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'pending');
    const hasCompleted = tasks.some(t => t.status === 'completed' || t.status === 'failed');

    const handleCancel = (taskId: string) => {
        window.dispatchEvent(new CustomEvent('gescall:cancel-task', { detail: { taskId } }));
    };

    const handlePause = (taskId: string) => {
        window.dispatchEvent(new CustomEvent('gescall:pause-task', { detail: { taskId } }));
    };

    const handleResume = (taskId: string) => {
        window.dispatchEvent(new CustomEvent('gescall:resume-task', { detail: { taskId } }));
    };

    const handleCancelAll = () => {
        activeTasks.forEach(task => handleCancel(task.id));
    };

    return (
        <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
            <Card className="shadow-2xl border-slate-200">
                {/* Header - Always visible */}
                <CardHeader
                    className="p-3 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={toggleMinimized}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Bell className="w-5 h-5 text-slate-600" />
                                {activeTasks.length > 0 && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                        <span className="text-[10px] text-white font-medium">
                                            {activeTasks.length}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <CardTitle className="text-sm">
                                Tareas en Proceso
                            </CardTitle>
                        </div>
                        <div className="flex items-center gap-1">
                            {activeTasks.length > 0 && !isMinimized && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelAll();
                                    }}
                                >
                                    Detener Todo
                                </Button>
                            )}
                            {hasCompleted && !isMinimized && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        clearCompleted();
                                    }}
                                >
                                    Limpiar
                                </Button>
                            )}
                            <Button variant="ghost" size="icon" className="w-6 h-6">
                                {isMinimized ? (
                                    <ChevronUp className="w-4 h-4" />
                                ) : (
                                    <ChevronDown className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                {/* Content - Collapsible */}
                {!isMinimized && (
                    <CardContent className="p-3 pt-0 max-h-80 overflow-y-auto">
                        <div className="space-y-2">
                            {tasks.map((task) => (
                                <TaskItem
                                    key={task.id}
                                    task={task}
                                    onRemove={() => removeTask(task.id)}
                                    onCancel={
                                        (task.status === 'running' || task.status === 'pending' || task.status === 'paused')
                                            ? () => handleCancel(task.id)
                                            : undefined
                                    }
                                    onPause={
                                        task.status === 'running'
                                            ? () => handlePause(task.id)
                                            : undefined
                                    }
                                    onResume={
                                        task.status === 'paused'
                                            ? () => handleResume(task.id)
                                            : undefined
                                    }
                                />
                            ))}
                        </div>
                    </CardContent>
                )}
            </Card>
        </div>
    );
}
