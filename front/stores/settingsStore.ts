import { create } from 'zustand';
import api from '@/services/api';

interface SettingsState {
    timezone: string;
    loading: boolean;
    error: string | null;
    fetchSettings: () => Promise<void>;
    updateSettings: (settings: { timezone: string }) => Promise<{ success: boolean; error?: string }>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
    timezone: 'America/Bogota', // Default fallback
    loading: false,
    error: null,

    fetchSettings: async () => {
        set({ loading: true, error: null });
        try {
            const response = await api.getSettings();
            if (response.success && response.data) {
                set({
                    timezone: response.data.timezone || 'America/Bogota',
                    error: null,
                    loading: false
                });
            } else {
                set({ error: response.error || 'Failed to load settings', loading: false });
            }
        } catch (err: any) {
            set({ error: err.message, loading: false });
        }
    },

    updateSettings: async (settings) => {
        set({ loading: true, error: null });
        try {
            const response = await api.updateSettings(settings);
            if (response.success) {
                set({ timezone: settings.timezone, loading: false, error: null });
                return { success: true };
            } else {
                set({ error: response.error || 'Failed to update settings', loading: false });
                return { success: false, error: response.error };
            }
        } catch (err: any) {
            set({ error: err.message, loading: false });
            return { success: false, error: err.message };
        }
    }
}));
