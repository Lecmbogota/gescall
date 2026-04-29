import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';
export type TaskType = 'lead_upload' | 'export' | 'other';

export interface BackgroundTask {
    id: string;
    type: TaskType;
    title: string;
    description?: string;
    progress: number;
    status: TaskStatus;
    createdAt: Date;
    completedAt?: Date;
    error?: string;
    metadata?: {
        campaignId?: string;
        campaignName?: string;
        listId?: string;
        listName?: string;
        totalRecords?: number;
        processedRecords?: number;
        successfulRecords?: number;
        failedRecords?: number;
    };
}

interface BackgroundTasksState {
    tasks: BackgroundTask[];
    isMinimized: boolean;

    // Actions
    addTask: (task: Omit<BackgroundTask, 'createdAt'>) => void;
    updateTask: (id: string, updates: Partial<BackgroundTask>) => void;
    updateTaskProgress: (id: string, progress: number, successful?: number, failed?: number) => void;
    setTaskStatus: (id: string, status: TaskStatus) => void;
    completeTask: (id: string, result?: { successful?: number; errors?: number }) => void;
    failTask: (id: string, error: string) => void;
    removeTask: (id: string) => void;
    clearCompleted: () => void;
    toggleMinimized: () => void;

    // Selectors
    getActiveTasksCount: () => number;
    hasActiveTasks: () => boolean;
}

export const useBackgroundTasks = create<BackgroundTasksState>()(
    persist(
        (set, get) => ({
            tasks: [],
            isMinimized: false,

            addTask: (task) => {
                set((state) => ({
                    tasks: [
                        ...state.tasks,
                        {
                            ...task,
                            createdAt: new Date(),
                        },
                    ],
                    isMinimized: false,
                }));
            },

            updateTask: (id, updates) => {
                set((state) => ({
                    tasks: state.tasks.map((task) =>
                        task.id === id ? { ...task, ...updates } : task
                    ),
                }));
            },

            updateTaskProgress: (id, progress, successful, failed) =>
                set((state) => ({
                    tasks: state.tasks.map((task) => {
                        if (task.id === id) {
                            const newMeta = { ...task.metadata };
                            if (successful !== undefined) newMeta.successfulRecords = successful;
                            if (failed !== undefined) newMeta.failedRecords = failed;

                            // Calculate processed records
                            newMeta.processedRecords = (newMeta.successfulRecords || 0) + (newMeta.failedRecords || 0);

                            // If it was paused and now receiving progress, auto-resume status to running?
                            // Maybe safer to explicit resume, but this keeps UI in sync if backend pushes progress
                            const newStatus = task.status === 'paused' ? 'running' : task.status;

                            return { ...task, progress, metadata: newMeta, status: newStatus };
                        }
                        return task;
                    }),
                })),

            setTaskStatus: (id, status) =>
                set((state) => ({
                    tasks: state.tasks.map((task) =>
                        task.id === id ? { ...task, status } : task
                    ),
                })),

            completeTask: (id, result) => {
                set((state) => ({
                    tasks: state.tasks.map((task) =>
                        task.id === id
                            ? {
                                ...task,
                                status: 'completed',
                                progress: 100,
                                completedAt: new Date(),
                                metadata: {
                                    ...task.metadata,
                                    successfulRecords: result?.successful ?? task.metadata?.successfulRecords,
                                    failedRecords: result?.errors ?? task.metadata?.failedRecords,
                                },
                            }
                            : task
                    ),
                }));

                setTimeout(() => {
                    get().removeTask(id);
                }, 10000);
            },

            failTask: (id, error) => {
                set((state) => ({
                    tasks: state.tasks.map((task) =>
                        task.id === id
                            ? {
                                ...task,
                                status: 'failed',
                                error,
                                completedAt: new Date(),
                            }
                            : task
                    ),
                }));
            },

            removeTask: (id) => {
                set((state) => ({
                    tasks: state.tasks.filter((task) => task.id !== id),
                }));
            },

            clearCompleted: () => {
                set((state) => ({
                    tasks: state.tasks.filter((task) => task.status === 'running' || task.status === 'pending'),
                }));
            },

            toggleMinimized: () => {
                set((state) => ({ isMinimized: !state.isMinimized }));
            },

            getActiveTasksCount: () => {
                return get().tasks.filter((t) => t.status === 'running' || t.status === 'pending').length;
            },

            hasActiveTasks: () => {
                return get().tasks.some((t) => t.status === 'running' || t.status === 'pending');
            },
        }),
        {
            name: 'background-tasks-storage',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
