import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import apiService from "../services/api";
import { toast } from "sonner";
import { Loader2, Save, Phone } from "lucide-react";

interface Pool {
    id: number;
    name: string;
    total_numbers: number;
    active_numbers: number;
    is_active: number;
}

interface CallerIdSettings {
    campaign_id: string;
    rotation_mode: 'OFF' | 'POOL';
    pool_id: number | null;
    pool_name: string | null;
    match_mode: 'LEAD' | 'FIXED';
    fixed_area_code: string | null;
    fallback_callerid: string | null;
    selection_strategy: 'ROUND_ROBIN' | 'RANDOM' | 'LRU';
    match_area_code: boolean;
}

interface Props {
    campaignId: string;
    onSave?: () => void;
}

export function CampaignCallerIdSettings({ campaignId, onSave }: Props) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [pools, setPools] = useState<Pool[]>([]);

    // Settings state
    const [rotationMode, setRotationMode] = useState<'OFF' | 'POOL'>('OFF');
    const [poolId, setPoolId] = useState<number | null>(null);
    const [matchMode, setMatchMode] = useState<'LEAD' | 'FIXED'>('LEAD');
    const [fixedAreaCode, setFixedAreaCode] = useState('');
    const [fallbackCallerId, setFallbackCallerId] = useState('');
    const [selectionStrategy, setSelectionStrategy] = useState<'ROUND_ROBIN' | 'RANDOM' | 'LRU'>('ROUND_ROBIN');
    const [matchAreaCode, setMatchAreaCode] = useState(true);

    useEffect(() => {
        loadData();
    }, [campaignId]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load pools
            const poolsRes = await apiService.getCallerIdPools(100, 1, '');
            if (poolsRes.success) {
                setPools(poolsRes.data.filter((p: Pool) => p.is_active));
            }

            // Load current settings
            const settingsRes = await apiService.getCampaignCallerIdSettings(campaignId);
            if (settingsRes.success && settingsRes.data) {
                const s = settingsRes.data as CallerIdSettings;
                setRotationMode(s.rotation_mode || 'OFF');
                setPoolId(s.pool_id);
                setMatchMode(s.match_mode || 'LEAD');
                setFixedAreaCode(s.fixed_area_code || '');
                setFallbackCallerId(s.fallback_callerid || '');
                setSelectionStrategy(s.selection_strategy || 'ROUND_ROBIN');
                setMatchAreaCode(s.match_area_code !== undefined ? !!s.match_area_code : true);
            }
        } catch (error) {
            console.error("Error loading CallerID settings:", error);
            toast.error("Error al cargar configuración");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await apiService.updateCampaignCallerIdSettings(campaignId, {
                rotation_mode: rotationMode,
                pool_id: rotationMode === 'POOL' ? poolId : null,
                match_mode: matchMode,
                fixed_area_code: matchMode === 'FIXED' ? fixedAreaCode : null,
                fallback_callerid: fallbackCallerId || null,
                selection_strategy: selectionStrategy,
                match_area_code: matchAreaCode
            });
            toast.success("Configuración guardada");
            onSave?.();
        } catch (error: any) {
            console.error("Error saving CallerID settings:", error);
            toast.error(error.message || "Error al guardar");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-blue-100 bg-gradient-to-br from-blue-50/50 to-white">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <Phone className="w-5 h-5 text-blue-600" />
                    <CardTitle className="text-lg">CallerID Local Presence</CardTitle>
                </div>
                <CardDescription>
                    Configura la rotación automática de CallerID basada en el prefijo del lead.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Rotation Mode Toggle */}
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                    <div>
                        <Label className="text-base font-medium">Rotación de CallerID</Label>
                        <p className="text-sm text-slate-500">Activar rotación automática por pool</p>
                    </div>
                    <Switch
                        checked={rotationMode === 'POOL'}
                        onCheckedChange={(checked) => setRotationMode(checked ? 'POOL' : 'OFF')}
                    />
                </div>

                {/* Pool settings - only show when enabled */}
                {rotationMode === 'POOL' && (
                    <div className="space-y-4 p-4 bg-white rounded-lg border">
                        {/* Pool Selector */}
                        <div className="space-y-2">
                            <Label>Pool de CallerIDs</Label>
                            <Select value={poolId?.toString() || ''} onValueChange={(v) => setPoolId(v ? parseInt(v) : null)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar pool..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {pools.map((pool) => (
                                        <SelectItem key={pool.id} value={pool.id.toString()}>
                                            {pool.name} ({pool.active_numbers} números)
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {pools.length === 0 && (
                                <p className="text-sm text-amber-600">No hay pools activos. Crea uno primero.</p>
                            )}
                        </div>

                        {/* Match Area Code Toggle */}
                        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div>
                                <Label className="text-sm font-medium">Coincidir LADA del CallerID</Label>
                                <p className="text-xs text-slate-500">
                                    Que la LADA del CallerID coincida con los 3 primeros dígitos del número del contacto (sin prefijo de país)
                                </p>
                            </div>
                            <Switch
                                checked={matchAreaCode}
                                onCheckedChange={setMatchAreaCode}
                            />
                        </div>

                        {/* Match Mode - only show when matchAreaCode is enabled */}
                        {matchAreaCode && (
                            <div className="space-y-2">
                                <Label>Modo de Match</Label>
                                <RadioGroup value={matchMode} onValueChange={(v) => setMatchMode(v as 'LEAD' | 'FIXED')}>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="LEAD" id="lead" />
                                        <Label htmlFor="lead" className="font-normal cursor-pointer">
                                            Automático (usar los 3 primeros dígitos del teléfono del lead)
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="FIXED" id="fixed" />
                                        <Label htmlFor="fixed" className="font-normal cursor-pointer">
                                            LADA fija
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>
                        )}

                        {/* Fixed Area Code */}
                        {matchAreaCode && matchMode === 'FIXED' && (
                            <div className="space-y-2">
                                <Label>LADA Fija (3 dígitos)</Label>
                                <Input
                                    placeholder="Ej: 305"
                                    value={fixedAreaCode}
                                    onChange={(e) => setFixedAreaCode(e.target.value.replace(/[^0-9]/g, '').substring(0, 3))}
                                    maxLength={3}
                                    className="max-w-[120px] font-mono"
                                />
                            </div>
                        )}

                        {/* Selection Strategy */}
                        <div className="space-y-2">
                            <Label>Estrategia de Selección</Label>
                            <Select value={selectionStrategy} onValueChange={(v) => setSelectionStrategy(v as any)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ROUND_ROBIN">Round-robin (secuencial)</SelectItem>
                                    <SelectItem value="RANDOM">Random (aleatorio)</SelectItem>
                                    <SelectItem value="LRU">Least Recently Used (menos usado)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Fallback CallerID */}
                        <div className="space-y-2">
                            <Label>Fallback CallerID</Label>
                            <Input
                                placeholder="CallerID a usar si no hay match"
                                value={fallbackCallerId}
                                onChange={(e) => setFallbackCallerId(e.target.value.replace(/[^0-9]/g, ''))}
                                className="font-mono"
                            />
                            <p className="text-xs text-slate-500">
                                Se usará si no hay CallerID disponible con la LADA objetivo.
                            </p>
                        </div>
                    </div>
                )}

                {/* Save Button */}
                <Button onClick={handleSave} disabled={saving} className="w-full">
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Guardar Configuración
                </Button>
            </CardContent>
        </Card>
    );
}
