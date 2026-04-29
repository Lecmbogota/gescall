import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import api from '@/services/api';
import { toast } from 'sonner';
import { Loader2, Settings as SettingsIcon, Save } from 'lucide-react';

const TIMEZONES = [
    { value: "America/Bogota", label: "América/Bogotá" },
    { value: "America/Caracas", label: "América/Caracas" },
    { value: "America/Mexico_City", label: "América/Ciudad de México" },
    { value: "America/Santiago", label: "América/Santiago" },
    { value: "America/Argentina/Buenos_Aires", label: "América/Buenos Aires" },
    { value: "America/Lima", label: "América/Lima" },
    { value: "America/New_York", label: "América/Nueva York (EST/EDT)" },
    { value: "Europe/Madrid", label: "Europa/Madrid" },
    { value: "UTC", label: "UTC" }
];

export function Settings() {
    const { session } = useAuthStore();
    const { timezone, fetchSettings } = useSettingsStore();

    const [currentTimezone, setCurrentTimezone] = useState(timezone || "America/Bogota");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (timezone) {
            setCurrentTimezone(timezone);
        }
    }, [timezone]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await api.updateSettings({ timezone: currentTimezone });
            if (res.success) {
                toast.success('Configuración global actualizada');
                await fetchSettings(); // Refresh zustand store with new value
            }
        } catch (error: any) {
            toast.error(error.message || 'Error al guardar la configuración');
        } finally {
            setSaving(false);
        }
    };

    if (session?.permissions?.user_level === null || session!.permissions!.user_level! < 9) {
        return (
            <div className="flex flex-col h-full p-6 items-center justify-center">
                <p className="text-slate-500">No tienes permisos para acceder a esta configuración.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full p-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-md">
                    <SettingsIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                        Ajustes Globales
                    </h1>
                    <p className="text-sm text-slate-500">Configuración general de la plataforma para todo el Call Center</p>
                </div>
            </div>

            <Card className="max-w-xl shadow-sm border border-white/80 bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md hover:bg-white/80">
                <CardHeader className="bg-white/40 border-b border-white/60">
                    <CardTitle className="text-lg">Preferencias Regionales</CardTitle>
                    <CardDescription>
                        Ajusta la zona horaria predeterminada de la plataforma. Esto afectará a todos los reportes, estadísticas y vistas que dependan de fechas y horas para asegurar la consistencia de los datos.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="space-y-2">
                        <Label htmlFor="timezone" className="font-semibold text-slate-700">
                            Zona Horaria Global
                        </Label>
                        <Select
                            value={currentTimezone}
                            onValueChange={setCurrentTimezone}
                        >
                            <SelectTrigger id="timezone" className="w-full">
                                <SelectValue placeholder="Seleccionar zona horaria" />
                            </SelectTrigger>
                            <SelectContent>
                                {TIMEZONES.map(tz => (
                                    <SelectItem key={tz.value} value={tz.value}>
                                        {tz.label} ({tz.value})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500 mt-2">
                            La zona horaria actualmente aplicada en toda la base de datos es <strong>{timezone}</strong>.
                        </p>
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={saving || currentTimezone === timezone}
                        className="w-full sm:w-auto mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar Cambios
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
