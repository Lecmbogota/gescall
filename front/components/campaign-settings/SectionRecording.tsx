import React from "react";
import {
    CheckCircle, FileAudio, HardDrive, Link2, Loader2, Mic, Save, XCircle,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SectionHeader, SettingsCard } from "./SectionShell";

interface Props {
    campaignType?: string;
    recordingEnabled: boolean;
    setRecordingEnabled: (v: boolean) => void;
    recordingStorage: string;
    setRecordingStorage: (v: string) => void;
    recordingExternalType: string;
    setRecordingExternalType: (v: string) => void;
    recordingHost: string;
    setRecordingHost: (v: string) => void;
    recordingPort: string;
    setRecordingPort: (v: string) => void;
    recordingUsername: string;
    setRecordingUsername: (v: string) => void;
    recordingPassword: string;
    setRecordingPassword: (v: string) => void;
    recordingAccessKey: string;
    setRecordingAccessKey: (v: string) => void;
    recordingSecretKey: string;
    setRecordingSecretKey: (v: string) => void;
    recordingRegion: string;
    setRecordingRegion: (v: string) => void;
    recordingBucket: string;
    setRecordingBucket: (v: string) => void;
    recordingFilenamePattern: string;
    setRecordingFilenamePattern: (v: string) => void;
    recordingFilenameRef: React.RefObject<HTMLInputElement>;
    isRecordingConnectionApproved: boolean;
    canSaveRecording: boolean;
    testingConnection: boolean;
    savingRecording: boolean;
    onTestConnection: () => void;
    onSave: () => void;
    /** Ack para invalidar la prueba de conexión cuando cambian credenciales */
    invalidateApproved: () => void;
}

export function SectionRecording(props: Props) {
    const {
        campaignType,
        recordingEnabled, setRecordingEnabled,
        recordingStorage, setRecordingStorage,
        recordingExternalType, setRecordingExternalType,
        recordingHost, setRecordingHost,
        recordingPort, setRecordingPort,
        recordingUsername, setRecordingUsername,
        recordingPassword, setRecordingPassword,
        recordingAccessKey, setRecordingAccessKey,
        recordingSecretKey, setRecordingSecretKey,
        recordingRegion, setRecordingRegion,
        recordingBucket, setRecordingBucket,
        recordingFilenamePattern, setRecordingFilenamePattern,
        recordingFilenameRef,
        isRecordingConnectionApproved,
        canSaveRecording,
        testingConnection,
        savingRecording,
        onTestConnection,
        onSave,
        invalidateApproved,
    } = props;

    const handleStorage = (v: string) => { setRecordingStorage(v); invalidateApproved(); };
    const handleExternal = (v: string) => { setRecordingExternalType(v); invalidateApproved(); };
    const onChangeWithInvalidate = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { setter(e.target.value); invalidateApproved(); };

    const filenameVariables = [
        { label: "{campaign_name}", desc: "Nombre de la campaña" },
        { label: "{date}", desc: "Fecha (YYYY-MM-DD)" },
        { label: "{time}", desc: "Hora (HH-MM-SS)" },
        ...(campaignType !== "INBOUND" ? [{ label: "{dst_number}", desc: "Número de destino" }] : []),
        ...(campaignType === "INBOUND" ? [{ label: "{src_number}", desc: "Número de origen / Caller ID" }] : []),
    ];

    return (
        <>
            <SectionHeader
                icon={<Mic className="w-5 h-5" />}
                iconBg="bg-red-100"
                iconText="text-red-600"
                title="Grabación de llamadas"
                description="Activa la grabación, define dónde se almacena y cómo se nombra cada archivo."
            />

            <SettingsCard
                footer={
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        {recordingStorage === "external" && !canSaveRecording ? (
                            <p className="text-xs text-amber-600 flex items-center gap-1 font-medium">
                                <XCircle className="w-3.5 h-3.5" />
                                Debes probar la conexión externa antes de guardar
                            </p>
                        ) : (
                            <span />
                        )}
                        <Button
                            onClick={onSave}
                            disabled={savingRecording || !recordingEnabled || (recordingStorage === "external" && !canSaveRecording)}
                            className="gap-2 min-w-[180px] h-10 rounded-xl shadow-lg shadow-red-500/10 text-sm bg-red-600 hover:bg-red-700"
                        >
                            {savingRecording ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {savingRecording ? "Guardando..." : "Guardar grabación"}
                        </Button>
                    </div>
                }
            >
                {/* Toggle principal */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200/60 bg-slate-50/40 mb-5">
                    <div className="flex items-center gap-3">
                        <FileAudio className="w-5 h-5 text-red-500" />
                        <div>
                            <Label className="text-sm font-semibold text-slate-700">Grabación de llamadas</Label>
                            <p className="text-[11px] text-slate-400">Activa o desactiva la grabación para esta campaña.</p>
                        </div>
                    </div>
                    <Switch
                        checked={recordingEnabled}
                        onCheckedChange={setRecordingEnabled}
                        className="data-[state=checked]:bg-red-500 shadow-sm"
                    />
                </div>

                {recordingEnabled && (
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="recordingStorage" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Destino de almacenamiento</Label>
                            <Select value={recordingStorage} onValueChange={handleStorage}>
                                <SelectTrigger id="recordingStorage" className="font-mono text-sm h-11 w-full bg-white shadow-sm">
                                    <SelectValue placeholder="Seleccionar destino..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl shadow-xl border-slate-100">
                                    <SelectItem value="local">
                                        <div className="flex items-center gap-2"><HardDrive className="w-4 h-4 text-slate-500" /> Local</div>
                                    </SelectItem>
                                    <SelectItem value="external">
                                        <div className="flex items-center gap-2"><Link2 className="w-4 h-4 text-blue-500" /> Externo</div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-slate-400">Selecciona dónde se almacenarán los archivos de audio.</p>
                        </div>

                        {recordingStorage === "external" && (
                            <div className="space-y-4 p-4 rounded-xl border border-blue-200/60 bg-blue-50/30">
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo de conexión</Label>
                                    <Select value={recordingExternalType} onValueChange={handleExternal}>
                                        <SelectTrigger className="font-mono text-sm h-11 w-full bg-white shadow-sm">
                                            <SelectValue placeholder="Seleccionar tipo..." />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-xl shadow-xl border-slate-100">
                                            <SelectItem value="sftp">SFTP</SelectItem>
                                            <SelectItem value="ftp">FTP</SelectItem>
                                            <SelectItem value="s3">S3 (Amazon)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {(recordingExternalType === "sftp" || recordingExternalType === "ftp") && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-500">Host / IP</Label>
                                            <Input value={recordingHost} onChange={onChangeWithInvalidate(setRecordingHost)} placeholder="192.168.1.100" className="h-10 text-sm bg-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-500">Puerto</Label>
                                            <Input value={recordingPort} onChange={onChangeWithInvalidate(setRecordingPort)} placeholder={recordingExternalType === "sftp" ? "22" : "21"} className="h-10 text-sm bg-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-500">Usuario</Label>
                                            <Input value={recordingUsername} onChange={onChangeWithInvalidate(setRecordingUsername)} placeholder="usuario" className="h-10 text-sm bg-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-500">Contraseña</Label>
                                            <Input type="password" value={recordingPassword} onChange={onChangeWithInvalidate(setRecordingPassword)} placeholder="••••••••" className="h-10 text-sm bg-white" />
                                        </div>
                                    </div>
                                )}

                                {recordingExternalType === "s3" && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-500">Access Key</Label>
                                            <Input value={recordingAccessKey} onChange={onChangeWithInvalidate(setRecordingAccessKey)} placeholder="AKIA..." className="h-10 text-sm bg-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-500">Secret Key</Label>
                                            <Input type="password" value={recordingSecretKey} onChange={onChangeWithInvalidate(setRecordingSecretKey)} placeholder="••••••••" className="h-10 text-sm bg-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-500">Región</Label>
                                            <Input value={recordingRegion} onChange={onChangeWithInvalidate(setRecordingRegion)} placeholder="us-east-1" className="h-10 text-sm bg-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-500">Bucket</Label>
                                            <Input value={recordingBucket} onChange={onChangeWithInvalidate(setRecordingBucket)} placeholder="mi-bucket" className="h-10 text-sm bg-white" />
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between pt-3 border-t border-blue-200/40 gap-3 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        {isRecordingConnectionApproved ? (
                                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs gap-1.5">
                                                <CheckCircle className="w-3.5 h-3.5" /> Conexión verificada
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-amber-600 font-medium">La conexión no ha sido verificada</span>
                                        )}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onTestConnection}
                                        disabled={
                                            testingConnection ||
                                            !recordingHost ||
                                            (recordingExternalType === "s3" &&
                                                (!recordingAccessKey || !recordingSecretKey || !recordingRegion || !recordingBucket))
                                        }
                                        className="h-9 text-sm gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 ml-auto"
                                    >
                                        {testingConnection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                                        Probar conexión
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Filename pattern */}
                        <div className="space-y-3 pt-2 border-t border-slate-100">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nomenclatura del archivo de audio</Label>
                                <Input
                                    ref={recordingFilenameRef}
                                    value={recordingFilenamePattern}
                                    onChange={(e) => setRecordingFilenamePattern(e.target.value)}
                                    placeholder="{campaign_name}_{date}_{time}"
                                    className="font-mono text-sm h-11 w-full bg-white shadow-sm"
                                />
                                <p className="text-[10px] text-slate-400">Define el patrón de nombres. Haz clic en las etiquetas para insertarlas.</p>
                            </div>
                            <div>
                                <Label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Variables disponibles (clic para insertar)</Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {filenameVariables.map((variable) => (
                                        <Badge
                                            key={variable.label}
                                            variant="secondary"
                                            className="cursor-pointer hover:bg-red-100 border-red-200/50 text-red-700 font-mono text-xs transition-colors"
                                            title={variable.desc}
                                            onClick={() => {
                                                const input = recordingFilenameRef.current;
                                                if (!input) return;
                                                const start = input.selectionStart ?? recordingFilenamePattern.length;
                                                const newVal = recordingFilenamePattern.substring(0, start) + variable.label + recordingFilenamePattern.substring(start);
                                                setRecordingFilenamePattern(newVal);
                                                setTimeout(() => {
                                                    const cursorPos = start + variable.label.length;
                                                    input.focus();
                                                    input.setSelectionRange(cursorPos, cursorPos);
                                                }, 0);
                                            }}
                                        >
                                            {variable.label}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </SettingsCard>
        </>
    );
}
