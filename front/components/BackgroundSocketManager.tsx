import { useEffect } from 'react';
import socket from '@/services/socket';
import { useBackgroundTasks } from '@/stores/useBackgroundTasks';
import { toast } from 'sonner';

export function BackgroundSocketManager() {
    const { updateTaskProgress, setTaskStatus, completeTask, failTask } = useBackgroundTasks();

    useEffect(() => {
        // Ensure socket is connected
        if (!socket.isConnected) {
            socket.connect();
        }

        const handleProgress = (data: any) => {
            // data: { processId, percentage, processed, total, successful, errors... }
            if (data.processId) {
                updateTaskProgress(
                    data.processId,
                    data.percentage,
                    data.successful,
                    data.errors
                );
            }
        };

        const handleComplete = (data: any) => {
            if (data.processId) {
                // Ensure final stats are updated
                updateTaskProgress(data.processId, 100, data.successful, data.errors);
                completeTask(data.processId);
                toast.success(`Carga completada: ${data.successful} insertados, ${data.errors} errores.`);
            }
        };

        const handleError = (data: any) => {
            if (data.processId) {
                failTask(data.processId, typeof data === 'string' ? data : 'Error en la carga');
            }
        };

        const handlePaused = (data: any) => {
            if (data.processId) {
                setTaskStatus(data.processId, 'paused');
                toast.info('Tarea pausada');
            }
        };

        const handleResumed = (data: any) => {
            if (data.processId) {
                setTaskStatus(data.processId, 'running');
                toast.info('Tarea reanudada');
            }
        };

        const handleCancelled = (data: any) => {
            if (data.processId) {
                failTask(data.processId, data.message || 'Cancelado por el usuario');
                toast.info(`Tarea cancelada: ${data.message}`);
            }
        };

        const handleReconnection = () => {
            console.log('[SocketManager] Connected/Reconnected. Resubscribing to active tasks...');
            const tasks = useBackgroundTasks.getState().tasks;
            const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'pending' || t.status === 'paused');

            activeTasks.forEach(task => {
                console.log(`[SocketManager] Resubscribing to task ${task.id}`);
                socket.emit('task:subscribe', task.id);
            });
        };

        // Attach global listeners
        socket.on('upload:leads:progress', handleProgress);
        socket.on('upload:leads:complete', handleComplete);
        socket.on('upload:leads:error', handleError);
        socket.on('upload:leads:cancelled', handleCancelled);
        socket.on('upload:leads:paused', handlePaused);
        socket.on('upload:leads:resumed', handleResumed);
        socket.on('connect', handleReconnection);

        // Listen for UI control requests
        const handleUICancel = (event: CustomEvent) => {
            const { taskId } = event.detail;
            console.log(`[SocketManager] Requesting cancellation for task ${taskId}`);
            socket.emit('upload:leads:cancel', { processId: taskId });
        };

        const handleUIPause = (event: CustomEvent) => {
            const { taskId } = event.detail;
            console.log(`[SocketManager] Requesting pause for task ${taskId}`);
            socket.emit('upload:leads:pause', { processId: taskId });
        };

        const handleUIResume = (event: CustomEvent) => {
            const { taskId } = event.detail;
            console.log(`[SocketManager] Requesting resume for task ${taskId}`);
            socket.emit('upload:leads:resume', { processId: taskId });
        };

        const handleNotFound = (data: any) => {
            if (data.processId) {
                failTask(data.processId, 'La tarea ya no existe en el servidor (posible reinicio).');
            }
        };

        window.addEventListener('gescall:cancel-task' as any, handleUICancel);
        window.addEventListener('gescall:pause-task' as any, handleUIPause);
        window.addEventListener('gescall:resume-task' as any, handleUIResume);
        socket.on('task:not_found', handleNotFound);

        // Initial check in case socket is already connected
        if (socket.isConnected) {
            handleReconnection();
        }

        return () => {
            // Cleanup
            socket.off('upload:leads:progress', handleProgress);
            socket.off('upload:leads:complete', handleComplete);
            socket.off('upload:leads:error', handleError);
            socket.off('upload:leads:cancelled', handleCancelled);
            socket.off('upload:leads:paused', handlePaused);
            socket.off('upload:leads:resumed', handleResumed);
            socket.off('connect', handleReconnection);
            socket.off('task:not_found', handleNotFound);
            window.removeEventListener('gescall:cancel-task' as any, handleUICancel);
            window.removeEventListener('gescall:pause-task' as any, handleUIPause);
            window.removeEventListener('gescall:resume-task' as any, handleUIResume);
        };
    }, [updateTaskProgress, setTaskStatus, completeTask, failTask]);

    return null; // This component renders nothing
}
