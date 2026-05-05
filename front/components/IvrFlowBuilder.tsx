import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    addEdge,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    type Connection,
    type NodeTypes,
    Handle,
    Position,
    BackgroundVariant,
    MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './IvrFlowBuilder.css';
import {
    MessageSquare,
    Volume2,
    Hash,
    PhoneForwarded,
    GitBranch,
    Settings,
    PhoneOff,
    Globe,
    Save,
    Play,
    Trash2,
    Plus,
    ChevronLeft,
    ChevronRight,
    GripVertical,
    Zap,
    X,
    Copy,
    Upload,
    Loader2,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { toast } from "sonner";
import socketService from '../services/socket';
import api from '../services/api';
import { translateLeadStatus } from '../utils/callStatusUtils';

// ─── TYPES ───────────────────────────────────────────────────────

interface NodeField {
    name: string;
    label: string;
    type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'hidden';
    required?: boolean;
    placeholder?: string;
    default?: string | number | boolean;
    options?: string[];
}

interface NodeTypeDef {
    type: string;
    label: string;
    icon: string;
    color: string;
    description: string;
    fields: NodeField[];
}

// ─── ICON MAP ────────────────────────────────────────────────────

const ICON_MAP: Record<string, any> = {
    MessageSquare,
    Volume2,
    Hash,
    PhoneForwarded,
    GitBranch,
    Settings,
    PhoneOff,
    Globe,
};

// ─── CUSTOM NODE COMPONENT ──────────────────────────────────────

function IvrNode({ id, data, selected, activeNodeId, executionData }: { id: string; data: any; selected: boolean; activeNodeId: string | null; executionData?: any }) {
    const Icon = ICON_MAP[data.icon] || Zap;
    const isCollectDtmf = data.nodeType === 'collect_dtmf' || data.nodeType === 'menu';
    const isCondition = data.nodeType === 'condition';

    // If we are in executions mode, check if this node was executed
    const nodeStats = executionData?.find((e: any) => e.nodeId === id);
    const wasExecuted = !!nodeStats;
    const isError = nodeStats?.result?.handle === 'error';

    return (
        <div
            className={`ivr-node w-72 ${activeNodeId === id
                ? 'node-executing scale-105 border-indigo-500 shadow-indigo-500/50'
                : wasExecuted
                    ? (isError ? 'bg-red-50/80 border-red-400' : 'bg-green-50/80 border-green-400')
                    : executionData // In execution mode, dim out non-executed
                        ? 'opacity-60 grayscale'
                        : selected
                            ? 'ivr-node--selected'
                            : ''
                }`}
        >
            {/* Input handle */}
            <Handle type="target" position={Position.Top} className="ivr-handle ivr-handle--target" />

            {/* Header */}
            <div className="ivr-node__header">
                <div className="ivr-node__icon shrink-0 shadow-sm" style={{ backgroundColor: wasExecuted && !isError ? '#22c55e' : wasExecuted && isError ? '#ef4444' : data.color, color: 'white' }}>
                    <Icon size={16} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="ivr-node__label truncate">{data.label}</h3>
                </div>
            </div>

            {/* Content preview */}
            <div className="ivr-node__content">
                {data.text && <p className="ivr-node__text">{data.text.slice(0, 60)}{data.text.length > 60 ? '…' : ''}</p>}
                {data.number && <p className="ivr-node__text">📞 {data.number}</p>}
                {data.filename && <p className="ivr-node__text">🔊 {data.filename}</p>}
                {data.timeout && <p className="ivr-node__meta">⏱ {data.timeout}s</p>}
                {!data.text && !data.number && !data.filename && <p className="ivr-node__placeholder">Click para configurar</p>}

                {wasExecuted && (
                    <div className={`mt-2 text-xs font-semibold px-2 py-1 rounded inline-block ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {isError ? 'Error' : '✓ Ejecutado'} ({nodeStats.durationMs}ms)
                    </div>
                )}
            </div>

            {/* Output handles */}
            {isCollectDtmf || isCondition ? (
                <>
                    {isCollectDtmf && (
                        <>
                            {(data.validDigits || '0123456789').split('').map((digit: string, i: number) => (
                                <Handle
                                    key={`dtmf-${digit}`}
                                    type="source"
                                    position={Position.Bottom}
                                    id={`dtmf-${digit}`}
                                    className="ivr-handle ivr-handle--dtmf"
                                    style={{ left: `${(i + 1) * (100 / ((data.validDigits || '0123456789').length + 2))}%` }}
                                    title={`DTMF ${digit}`}
                                />
                            ))}
                            <Handle
                                type="source"
                                position={Position.Bottom}
                                id="timeout"
                                className="ivr-handle ivr-handle--timeout"
                                style={{ left: '90%' }}
                                title="Timeout"
                            />
                        </>
                    )}
                    {isCondition && (
                        <>
                            <Handle type="source" position={Position.Bottom} id="true" className="ivr-handle ivr-handle--true" style={{ left: '30%' }} title="Verdadero" />
                            <Handle type="source" position={Position.Bottom} id="false" className="ivr-handle ivr-handle--false" style={{ left: '70%' }} title="Falso" />
                        </>
                    )}
                </>
            ) : (
                <Handle type="source" position={Position.Bottom} className="ivr-handle ivr-handle--source" />
            )}
        </div>
    );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────

interface Props {
    campaignId?: string;
    campaignName?: string;
    onBack?: () => void;
}

/** IVR visual solo aplica a campañas Blaster (saliente automático) e Inbound. */
const IVR_ALLOWED_CAMPAIGN_TYPES = new Set(['BLASTER', 'INBOUND']);

function isIvrAllowedCampaignType(t: string | undefined | null): boolean {
    return !!t && IVR_ALLOWED_CAMPAIGN_TYPES.has(t);
}

/** Misma lógica que la vista Campañas (filtro «Todos»): no listar campañas archivadas. */
function isCampaignArchived(c: Record<string, unknown>): boolean {
    const a = c.archived;
    return a === true || a === 1 || a === 'Y';
}

interface IvrCampaignPick {
    id: string;
    name: string;
}

export function IvrFlowBuilder({ campaignId, campaignName, onBack }: Props) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [nodeTypeDefs, setNodeTypeDefs] = useState<NodeTypeDef[]>([]);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [configPanelOpen, setConfigPanelOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [campaignIdInput, setCampaignIdInput] = useState(campaignId || '');
    const [cloneModalOpen, setCloneModalOpen] = useState(false);
    const [targetCampaignId, setTargetCampaignId] = useState('');
    const [cloning, setCloning] = useState(false);
    const [configWidth, setConfigWidth] = useState<number>(300);
    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'editor' | 'executions'>('editor');
    const [executions, setExecutions] = useState<any[]>([]);
    const [selectedExecution, setSelectedExecution] = useState<any | null>(null);
    const [loadingExecutions, setLoadingExecutions] = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [uploadingAudio, setUploadingAudio] = useState(false);

    const handleNodeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !campaignIdInput) {
            if (!campaignIdInput) toast.error("Seleccione una campaña primero");
            return;
        }

        const validTypes = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg'];
        if (!validTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.wav')) {
            toast.error("Solo se permiten archivos WAV o MP3");
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            toast.error("El archivo es demasiado grande (máximo 50MB)");
            return;
        }

        setUploadingAudio(true);
        const toastId = toast.loading("Subiendo y convirtiendo audio...");
        try {
            const response = await api.uploadAudio(file, campaignIdInput, true);

            if (response.success && response.data && response.data.filename) {
                toast.success(`Audio subido: ${response.data.filename}`, { id: toastId });
                updateNodeData('filename', response.data.filename);
            } else {
                toast.error("Error al subir: " + response.error, { id: toastId });
            }
        } catch (error: any) {
            console.error('[IvrFlowBuilder] Node upload error:', error);
            toast.error(error.message || "Error al subir el archivo", { id: toastId });
        } finally {
            setUploadingAudio(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Lead fields available for variable mapping
    const LEAD_FIELDS = [
        { value: '{{phone}}', label: '📞 Teléfono' },
        { value: '{{first_name}}', label: '👤 Nombre' },
        { value: '{{last_name}}', label: '👤 Apellido' },
        { value: '{{vendor_lead_code}}', label: '🏷️ Código del Lead' },
        { value: '{{comments}}', label: '💬 Comentarios' },
        { value: '{{state}}', label: '📍 Estado/Región' },
        { value: '{{alt_phone}}', label: '📱 Tel. Alterno' },
        { value: '{{lead_id}}', label: '🆔 ID del Lead' },
        { value: '{{campaign_id}}', label: '📋 ID Campaña' },
        { value: '{{dtmf}}', label: '🔢 DTMF presionado' },
        { value: '{{MiCampoCustom}}', label: '✨ Campo JSON (Postgres)' },
    ];

    const getCampaignIds = useAuthStore((state) => state.getCampaignIds);
    /** null = aún cargando; [] = sin campañas elegibles para IVR */
    const [ivrCampaignOptions, setIvrCampaignOptions] = useState<IvrCampaignPick[] | null>(null);
    const [campaignOptions, setCampaignOptions] = useState<IvrCampaignPick[]>([]);
    const [ttsTemplates, setTtsTemplates] = useState<any[]>([]);
    const reactFlowWrapper = useRef<HTMLDivElement>(null);

    const nodeTypes = useMemo(() => ({
        ivrNode: (props: any) => <IvrNode {...props} activeNodeId={activeNodeId} executionData={selectedExecution?.execution_data} />
    }), [activeNodeId, selectedExecution]);

    const API = import.meta.env.VITE_API_URL || 'http://72.251.5.61:3001';

    // Campañas con tipo Blaster o Inbound (datos desde API; el login no siempre trae campaign_type)
    useEffect(() => {
        const ids = getCampaignIds();
        if (!ids.length) {
            setIvrCampaignOptions([]);
            return;
        }
        let cancelled = false;
        api.getCampaigns({ allowedCampaigns: ids })
            .then((res: { success?: boolean; data?: Record<string, unknown>[] }) => {
                if (cancelled) return;
                if (!res?.success || !Array.isArray(res.data)) {
                    setIvrCampaignOptions([]);
                    return;
                }
                const allCampaigns: IvrCampaignPick[] = res.data
                    .filter((c) => !isCampaignArchived(c))
                    .map((c) => ({
                        id: String(c.campaign_id),
                        name: String(c.campaign_name || c.campaign_id || ''),
                    }));
                const opts: IvrCampaignPick[] = res.data
                    .filter(
                        (c) =>
                            isIvrAllowedCampaignType(c.campaign_type as string | undefined) &&
                            !isCampaignArchived(c)
                    )
                    .map((c) => ({
                        id: String(c.campaign_id),
                        name: String(c.campaign_name || c.campaign_id || ''),
                    }));
                setCampaignOptions(allCampaigns);
                setIvrCampaignOptions(opts);
            })
            .catch(() => {
                if (!cancelled) {
                    setCampaignOptions([]);
                    setIvrCampaignOptions([]);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [getCampaignIds]);

    useEffect(() => {
        if (!campaignId || ivrCampaignOptions === null) return;
        if (ivrCampaignOptions.some((c) => c.id === campaignId)) {
            setCampaignIdInput(campaignId);
        }
    }, [campaignId, ivrCampaignOptions]);

    useEffect(() => {
        if (ivrCampaignOptions === null || !campaignIdInput) return;
        const allowed = ivrCampaignOptions.some((c) => c.id === campaignIdInput);
        if (!allowed) {
            setCampaignIdInput('');
            toast.info('El IVR Builder solo está disponible para campañas Blaster e Inbound.');
        }
    }, [ivrCampaignOptions, campaignIdInput]);

    // Load node types
    useEffect(() => {
        api.getIvrNodeTypes()
            .then(data => { if (Array.isArray(data)) setNodeTypeDefs(data); })
            .catch(console.error);
    }, []);

    // Load TTS Templates for selected campaign
    useEffect(() => {
        if (!campaignIdInput) {
            setTtsTemplates([]);
            return;
        }
        api.getCampaigns({ campaignId: campaignIdInput })
            .then(res => {
                if (res.success && res.data && res.data.length > 0) {
                    setTtsTemplates(res.data[0].tts_templates || []);
                } else {
                    setTtsTemplates([]);
                }
            })
            .catch(err => {
                console.error("Error fetching campaign details for TTS templates:", err);
                setTtsTemplates([]);
            });
    }, [campaignIdInput]);

    // Load flow when campaign changes
    useEffect(() => {
        if (!campaignIdInput) return;
        api.getIvrFlow(campaignIdInput)
            .then(data => {
                if (data.flow && data.flow.nodes) {
                    const loadedNodes = data.flow.nodes.map((n: any) => ({
                        id: n.id,
                        type: 'ivrNode',
                        position: n.position || { x: 250, y: parseInt(n.id) * 150 },
                        data: {
                            ...n.data,
                            nodeType: n.type,
                            label: nodeTypeDefs.find(t => t.type === n.type)?.label || n.type,
                            icon: nodeTypeDefs.find(t => t.type === n.type)?.icon || 'Zap',
                            color: nodeTypeDefs.find(t => t.type === n.type)?.color || '#64748b',
                        },
                    }));
                    const loadedEdges = data.flow.edges.map((e: any) => ({
                        ...e,
                        type: 'default',
                        animated: true,
                        className: 'premium-edge',
                        markerEnd: { 
                            type: MarkerType.ArrowClosed,
                            color: '#818cf8',
                            width: 15,
                            height: 15
                        },
                        style: { stroke: '#818cf8', strokeWidth: 3 },
                        labelStyle: { fill: '#4f46e5', fontSize: 11, fontWeight: 700 },
                        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, stroke: '#e0e7ff', strokeWidth: 1, rx: 8, ry: 8 },
                        labelBgPadding: [8, 4]
                    }));
                    setNodes(loadedNodes);
                    setEdges(loadedEdges);
                } else {
                    setNodes([]);
                    setEdges([]);
                }
            })
            .catch(console.error);
    }, [campaignIdInput, nodeTypeDefs]);

    // Subscribe to live execution events
    useEffect(() => {
        const handleNodeExecute = (data: any) => {
            if (data.campaignId === campaignIdInput || !data.campaignId) {
                // We highlight the node ID
                setActiveNodeId(data.nodeId);
            }
        };

        const handleCallEnd = () => {
            // Remove highlight when call ends entirely
            setActiveNodeId(null);
        };

        socketService.on('ivr:node:execute', handleNodeExecute);
        // Using common channel close/end events if they exist, else just clear it after timeout
        socketService.on('ivr:call_end', handleCallEnd);

        return () => {
            socketService.off('ivr:node:execute', handleNodeExecute);
            socketService.off('ivr:call_end', handleCallEnd);
        };
    }, [campaignIdInput]);

    // Fetch executions when switching to executions view
    useEffect(() => {
        if (viewMode === 'executions' && campaignIdInput) {
            setLoadingExecutions(true);
            api.getIvrExecutions(campaignIdInput)
                .then(res => setExecutions(res.executions || []))
                .catch(console.error)
                .finally(() => setLoadingExecutions(false));

            setSelectedNode(null);
            setConfigPanelOpen(false);
        } else {
            setExecutions([]);
            setSelectedExecution(null);
        }
    }, [viewMode, campaignIdInput]);

    const loadExecution = async (execSummary: any) => {
        try {
            const res = await api.getIvrExecutionDetail(execSummary.id);
            if (res.execution) {
                setSelectedExecution(res.execution);
            }
        } catch (err) {
            console.error('Error loading execution detail:', err);
        }
    };

    // Connect edges
    const onConnect = useCallback(
        (params: Connection) => {
            setEdges((eds) =>
                addEdge(
                    {
                        ...params,
                        type: 'default',
                        animated: true,
                        className: 'premium-edge',
                        markerEnd: { 
                            type: MarkerType.ArrowClosed,
                            color: '#818cf8',
                            width: 15,
                            height: 15
                        },
                        style: { stroke: '#818cf8', strokeWidth: 3 },
                        label: params.sourceHandle ? params.sourceHandle.replace('dtmf-', 'DTMF ').replace('timeout', '⏱ Timeout').replace('true', '✓ Sí').replace('false', '✗ No') : '',
                        labelStyle: { fill: '#4f46e5', fontSize: 11, fontWeight: 700 },
                        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, stroke: '#e0e7ff', strokeWidth: 1, rx: 8, ry: 8 },
                        labelBgPadding: [8, 4]
                    },
                    eds
                )
            );
        },
        [setEdges]
    );

    // Node click → open config panel
    const onNodeClick = useCallback((_: any, node: Node) => {
        setSelectedNode(node);
        setConfigPanelOpen(true);
    }, []);

    // Add node from palette
    const addNode = useCallback(
        (typeDef: NodeTypeDef) => {
            const id = `node_${Date.now()}`;
            const newNode: Node = {
                id,
                type: 'ivrNode',
                position: { x: 250, y: (nodes.length + 1) * 150 },
                data: {
                    nodeType: typeDef.type,
                    label: typeDef.label,
                    icon: typeDef.icon,
                    color: typeDef.color,
                    ...typeDef.fields.reduce((acc: any, f) => {
                        if (f.default !== undefined) acc[f.name] = f.default;
                        return acc;
                    }, {}),
                },
            };
            setNodes((nds) => [...nds, newNode]);
        },
        [nodes, setNodes]
    );

    // Delete selected node
    const deleteSelectedNode = useCallback(() => {
        if (!selectedNode) return;
        setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
        setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
        setSelectedNode(null);
        setConfigPanelOpen(false);
    }, [selectedNode, setNodes, setEdges]);

    // Update node data
    const updateNodeData = useCallback(
        (field: string, value: any) => {
            if (!selectedNode) return;
            setNodes((nds) =>
                nds.map((n) =>
                    n.id === selectedNode.id
                        ? { ...n, data: { ...n.data, [field]: value } }
                        : n
                )
            );
            setSelectedNode((prev) => (prev ? { ...prev, data: { ...prev.data, [field]: value } } : null));
        },
        [selectedNode, setNodes]
    );

    // Clone flow
    const handleClone = async () => {
        if (!targetCampaignId || !nodes.length) return;
        setCloning(true);

        const flow = {
            nodes: nodes.map((n) => ({
                id: n.id,
                type: n.data.nodeType,
                position: n.position,
                data: Object.fromEntries(
                    Object.entries(n.data).filter(([k]) => !['nodeType', 'label', 'icon', 'color'].includes(k))
                ),
            })),
            edges: edges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle,
                label: e.label,
            })),
        };

        try {
            await api.saveIvrFlow(targetCampaignId, flow, true);
            toast.success(`IVR clonado exitosamente a la campaña ${targetCampaignId}`);
            setCloneModalOpen(false);
            setTargetCampaignId('');
        } catch (err) {
            console.error('Clone error:', err);
            toast.error('Error al clonar IVR');
        } finally {
            setCloning(false);
        }
    };

    // Save flow
    const saveFlow = useCallback(async () => {
        if (!campaignIdInput) return;
        setSaving(true);

        const flow = {
            nodes: nodes.map((n) => ({
                id: n.id,
                type: n.data.nodeType,
                position: n.position,
                data: Object.fromEntries(
                    Object.entries(n.data).filter(([k]) => !['nodeType', 'label', 'icon', 'color'].includes(k))
                ),
            })),
            edges: edges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle,
                label: e.label,
            })),
        };

        try {
            await api.saveIvrFlow(campaignIdInput, flow, true);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error('Save error:', err);
        } finally {
            setSaving(false);
        }
    }, [campaignIdInput, nodes, edges]);

    // Get node type definition for selected node
    const selectedTypeDef = selectedNode
        ? nodeTypeDefs.find((t) => t.type === selectedNode.data.nodeType)
        : null;

    return (
        <div className="ivr-builder">
            {/* Top Bar */}
            <div className="ivr-builder__topbar">
                <div className="ivr-builder__topbar-left">
                    {onBack && (
                        <button onClick={onBack} className="ivr-builder__back-btn">
                            <ChevronLeft size={18} />
                        </button>
                    )}
                    <Zap size={20} className="ivr-builder__logo" />
                    <h2 className="ivr-builder__title">IVR Flow Builder</h2>
                    <span className="ivr-builder__divider" />

                    {/* Campaign selector */}
                    <select
                        value={campaignIdInput}
                        onChange={(e) => setCampaignIdInput(e.target.value)}
                        className="ivr-builder__campaign-select"
                    >
                        <option value="">Seleccionar campaña...</option>
                        {(ivrCampaignOptions ?? []).map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.id} — {c.name || c.id}
                            </option>
                        ))}
                    </select>

                    <div className="flex bg-slate-100 rounded-lg p-1 ml-4 border">
                        <button
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${viewMode === 'editor' ? 'bg-white shadow pointer-events-none' : 'text-slate-500 hover:text-slate-700'}`}
                            onClick={() => setViewMode('editor')}
                        >
                            Editor
                        </button>
                        <button
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${viewMode === 'executions' ? 'bg-white shadow pointer-events-none text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                            onClick={() => setViewMode('executions')}
                            disabled={!campaignIdInput}
                        >
                            Ejecuciones
                        </button>
                    </div>
                </div>

                <div className="ivr-builder__topbar-right">
                    <button
                        onClick={saveFlow}
                        disabled={saving || !campaignIdInput}
                        className={`ivr-builder__save-btn ${saved ? 'ivr-builder__save-btn--saved' : ''}`}
                    >
                        <Save size={16} />
                        {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar'}
                    </button>
                    <button
                        onClick={() => setCloneModalOpen(true)}
                        disabled={!campaignIdInput || nodes.length === 0}
                        className="ivr-builder__save-btn"
                        style={{ marginLeft: '8px', backgroundColor: '#6366f1' }}
                        title="Clonar IVR a otra campaña"
                    >
                        <Copy size={16} />
                        Clonar
                    </button>
                </div>
            </div>

            <div className="ivr-builder__main">
                {/* Node Palette Sidebar */}
                <div className={`ivr-builder__sidebar ${sidebarOpen ? '' : 'ivr-builder__sidebar--collapsed'}`}>
                    <div className="ivr-builder__sidebar-header">
                        <h3>{viewMode === 'editor' ? 'Nodos' : 'Historial de Ejecuciones'}</h3>
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="ivr-builder__sidebar-toggle">
                            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                        </button>
                    </div>
                    {sidebarOpen && viewMode === 'editor' && (
                        <div className="ivr-builder__sidebar-nodes">
                            {nodeTypeDefs.map((typeDef) => {
                                const Icon = ICON_MAP[typeDef.icon] || Zap;
                                return (
                                    <button
                                        key={typeDef.type}
                                        className="ivr-builder__palette-node"
                                        onClick={() => addNode(typeDef)}
                                        title={typeDef.description}
                                    >
                                        <div className="ivr-builder__palette-icon" style={{ backgroundColor: typeDef.color }}>
                                            <Icon size={16} />
                                        </div>
                                        <div className="ivr-builder__palette-info">
                                            <span className="ivr-builder__palette-label">{typeDef.label}</span>
                                            <span className="ivr-builder__palette-desc">{typeDef.description}</span>
                                        </div>
                                        <Plus size={14} className="ivr-builder__palette-add" />
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {sidebarOpen && viewMode === 'executions' && (
                        <div className="overflow-y-auto flex-1 bg-white">
                            {loadingExecutions ? (
                                <p className="text-sm text-slate-500 p-4">Cargando...</p>
                            ) : executions.length === 0 ? (
                                <p className="text-sm text-slate-500 p-4">No hay ejecuciones recientes.</p>
                            ) : (
                                executions.map(exec => (
                                    <button
                                        key={exec.id}
                                        className={`w-full text-left p-4 border-b text-sm transition-colors hover:bg-slate-50 ${selectedExecution?.id === exec.id ? 'bg-indigo-50/50 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}`}
                                        onClick={() => loadExecution(exec)}
                                    >
                                        <div className="font-medium text-slate-900">{new Date(exec.started_at).toLocaleString()}</div>
                                        <div className="flex justify-between mt-1.5 text-slate-500">
                                            <span>Lead: {exec.lead_id || 'N/A'}</span>
                                            <span className={`font-medium ${exec.status === 'ERROR' ? 'text-red-600' : exec.status === 'HUNGUP' ? 'text-orange-500' : 'text-emerald-600'}`}>{exec.status}</span>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* React Flow Canvas */}
                <div className="ivr-builder__canvas" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={viewMode === 'editor' ? onNodesChange : undefined}
                        onEdgesChange={viewMode === 'editor' ? onEdgesChange : undefined}
                        onConnect={viewMode === 'editor' ? onConnect : undefined}
                        onNodeClick={viewMode === 'editor' ? onNodeClick : undefined}
                        nodeTypes={nodeTypes}
                        nodesDraggable={viewMode === 'editor'}
                        nodesConnectable={viewMode === 'editor'}
                        elementsSelectable={viewMode === 'editor'}
                        fitView
                        snapToGrid
                        snapGrid={[16, 16]}
                        deleteKeyCode={['Backspace', 'Delete']}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Controls className="ivr-builder__controls" />
                        <MiniMap
                            className="ivr-builder__minimap"
                            nodeStrokeColor={(n: Node) => (n.data?.color as string) || '#6366f1'}
                            nodeColor={(n: Node) => ((n.data?.color as string) + '40') || '#6366f140'}
                            maskColor="rgba(0, 0, 0, 0.7)"
                        />
                        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#333" />
                    </ReactFlow>
                </div>

                {/* Config Panel */}
                {configPanelOpen && selectedNode && selectedTypeDef && (
                    <div className="ivr-builder__config-panel relative" style={{ width: `${configWidth}px` }}>
                        {/* Resize Handle */}
                        <div
                            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-300 active:bg-indigo-500 z-10 transition-colors"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                const startX = e.pageX;
                                const startWidth = configWidth;

                                const handleMouseMove = (mouseEvent: MouseEvent) => {
                                    // Calculate delta. Negative delta means moving left (widening the panel).
                                    const deltaX = startX - mouseEvent.pageX;
                                    const newWidth = Math.max(250, Math.min(600, startWidth + deltaX));
                                    setConfigWidth(newWidth);
                                };

                                const handleMouseUp = () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                };

                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                            }}
                            title="Arrastrar para redimensionar"
                        />

                        <div className="ivr-builder__config-header">
                            <div className="ivr-builder__config-header-left">
                                <div className="ivr-builder__config-icon" style={{ backgroundColor: selectedTypeDef.color }}>
                                    {(() => { const Icon = ICON_MAP[selectedTypeDef.icon] || Zap; return <Icon size={16} />; })()}
                                </div>
                                <h3>{selectedTypeDef.label}</h3>
                            </div>
                            <div className="ivr-builder__config-actions">
                                <button onClick={deleteSelectedNode} className="ivr-builder__config-delete" title="Eliminar nodo">
                                    <Trash2 size={14} />
                                </button>
                                <button onClick={() => { setConfigPanelOpen(false); setSelectedNode(null); }} className="ivr-builder__config-close">
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        <div className="ivr-builder__config-body flex flex-col h-full overflow-hidden">
                            <p className="ivr-builder__config-desc flex-shrink-0">{selectedTypeDef.description}</p>

                            <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3 custom-scrollbar">
                                {selectedTypeDef.fields.map((field) => {
                                    if (selectedNode.data.nodeType === 'menu') {
                                        const currentAudioType = selectedNode.data.audioType || 'TTS';
                                        if (currentAudioType === 'Audio' && field.name === 'text') return null;
                                        if (currentAudioType === 'TTS' && field.name === 'filename') return null;
                                    }
                                    if (selectedNode.data.nodeType === 'transfer') {
                                        const currentDestination = selectedNode.data.destinationType || (selectedNode.data.targetCampaignId || (!selectedNode.data.number && !selectedNode.data.agentUsername && !selectedNode.data.agentExtension) ? 'Campaña' : (selectedNode.data.agentUsername || selectedNode.data.agentExtension) ? 'Agente' : 'Número externo');
                                        const campaignOnly = ['targetCampaignId'];
                                        const agentOnly = ['agentUsername', 'agentExtension'];
                                        const externalOnly = ['number', 'trunk', 'prefix', 'overflowNumber'];
                                        if (currentDestination !== 'Campaña' && campaignOnly.includes(field.name)) return null;
                                        if (currentDestination !== 'Agente' && agentOnly.includes(field.name)) return null;
                                        if (currentDestination !== 'Número externo' && externalOnly.includes(field.name)) return null;
                                    }

                                    return (
                                     <div key={field.name} className="ivr-builder__config-field">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <label className="mb-0">{field.label}</label>
                                            {field.name === 'text' && (selectedNode.data.nodeType === 'play_tts' || selectedNode.data.nodeType === 'menu') && (
                                                <select
                                                    className="text-[10px] border border-indigo-200 rounded px-2 py-1 bg-indigo-50 text-indigo-700 outline-none hover:bg-indigo-100 cursor-pointer max-w-[140px] truncate font-semibold shadow-sm"
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            updateNodeData(field.name, e.target.value);
                                                            e.target.value = ''; // reset so it acts like a button
                                                        }
                                                    }}
                                                >
                                                    <option value="">Aplicar plantilla...</option>
                                                    {ttsTemplates.length > 0 ? (
                                                        ttsTemplates.map(t => (
                                                            <option key={t.id} value={t.content}>📄 {t.name}</option>
                                                        ))
                                                    ) : (
                                                        <option value="" disabled>No hay plantillas...</option>
                                                    )}
                                                </select>
                                            )}
                                        </div>
                                        {field.type === 'textarea' ? (
                                            <textarea
                                                value={(selectedNode.data[field.name] as string) || ''}
                                                onChange={(e) => updateNodeData(field.name, e.target.value)}
                                                placeholder={field.placeholder}
                                                rows={3}
                                                className={`resize-y ${(field.name === 'text' && (selectedNode.data.nodeType === 'play_tts' || selectedNode.data.nodeType === 'menu')) ? 'bg-slate-100 cursor-not-allowed opacity-70' : ''}`}
                                                disabled={field.name === 'text' && (selectedNode.data.nodeType === 'play_tts' || selectedNode.data.nodeType === 'menu')}
                                            />
                                        ) : field.type === 'select' ? (
                                            <select
                                                value={(selectedNode.data[field.name] as string) || (field.default as string) || ''}
                                                onChange={(e) => updateNodeData(field.name, e.target.value)}
                                            >
                                                <option value="">Seleccionar...</option>
                                                {(() => {
                                                    if (field.name === 'targetCampaignId') {
                                                        return campaignOptions.map((opt) => (
                                                            <option key={opt.id} value={opt.id}>{opt.id} — {opt.name || opt.id}</option>
                                                        ));
                                                    }
                                                    if (field.name !== 'status') {
                                                        return field.options?.map((opt) => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ));
                                                    }
                                                    const seenLabels = new Set<string>();
                                                    return field.options?.filter((opt) => {
                                                        const translatedLabel = translateLeadStatus(opt).label;
                                                        if (seenLabels.has(translatedLabel)) return false;
                                                        seenLabels.add(translatedLabel);
                                                        return true;
                                                    }).map((opt) => (
                                                        <option key={opt} value={opt}>
                                                            {translateLeadStatus(opt).label}
                                                        </option>
                                                    ));
                                                })()}
                                            </select>
                                        ) : field.type === 'boolean' ? (
                                            <label className="ivr-builder__config-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(selectedNode.data[field.name]) || false}
                                                    onChange={(e) => updateNodeData(field.name, e.target.checked)}
                                                />
                                                <span className="ivr-builder__config-toggle-slider" />
                                            </label>
                                        ) : field.type !== 'hidden' ? (
                                            field.name === 'validDigits' ? (
                                                <div className="flex justify-center mt-3 mb-2 w-full">
                                                    <div className="grid grid-cols-3 gap-2.5 w-[220px]">
                                                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(digit => {
                                                             const currentDigits = String(selectedNode.data.validDigits || '');
                                                             const isActive = currentDigits.includes(digit);
                                                             return (
                                                                 <button
                                                                     key={digit}
                                                                     type="button"
                                                                     onClick={() => {
                                                                         let current = currentDigits;
                                                                         if (current.includes(digit)) {
                                                                             current = current.replace(digit, '');
                                                                         } else {
                                                                             current += digit;
                                                                         }
                                                                         updateNodeData('validDigits', current);
                                                                     }}
                                                                     className={`py-3 rounded-xl text-lg font-semibold transition-all duration-200 border shadow-sm flex items-center justify-center
                                                                         ${isActive 
                                                                             ? 'bg-[linear-gradient(110deg,#3b82f6,#2563eb)] border-blue-600 text-white shadow-blue-500/40 scale-105 transform' 
                                                                             : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-600'}`}
                                                                 >
                                                                     {digit}
                                                                 </button>
                                                             );
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
                                            <div className="flex flex-col gap-2">
                                                <input
                                                    type={field.type === 'number' ? 'number' : 'text'}
                                                    value={(selectedNode.data[field.name] as string | number) || ''}
                                                    onChange={(e) => updateNodeData(field.name, field.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value)}
                                                    placeholder={field.placeholder}
                                                />
                                                {((selectedNode.data.nodeType === 'play_audio' || selectedNode.data.nodeType === 'menu') && field.name === 'filename') && (
                                                    <label
                                                        className={`w-full relative overflow-hidden flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium border rounded-md shadow-sm transition-colors ${uploadingAudio || !campaignIdInput ? 'opacity-50 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400' : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700 cursor-pointer'}`}
                                                    >
                                                        {uploadingAudio ? (
                                                            <>
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                                Subiendo...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Upload className="w-4 h-4" />
                                                                Subir nuevo audio
                                                            </>
                                                        )}
                                                        <input
                                                            type="file"
                                                            className="hidden"
                                                            accept=".wav,.mp3,audio/*"
                                                            onChange={handleNodeFileUpload}
                                                            disabled={uploadingAudio || !campaignIdInput}
                                                        />
                                                    </label>
                                                )}
                                            </div>
                                            )
                                        ) : null}
                                    </div>
                                )})}
                            </div>

                        </div>

                        {/* Node ID (for debugging) */}
                        <div className="ivr-builder__config-footer">
                            <span className="ivr-builder__config-node-id">ID: {selectedNode.id}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Clone Dialog */}
            <Dialog open={cloneModalOpen} onOpenChange={setCloneModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Clonar IVR</DialogTitle>
                        <DialogDescription className="space-y-2 text-left">
                            <span className="block">
                                Copia la configuración actual del IVR a otra campaña.
                            </span>
                            <span className="block text-amber-600 dark:text-amber-500 font-semibold">
                                ⚠️ Advertencia: esto sobrescribirá el IVR existente en la campaña seleccionada.
                            </span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-2 py-2">
                        <Label htmlFor="target-campaign">Campaña destino</Label>
                        <Select value={targetCampaignId} onValueChange={setTargetCampaignId}>
                            <SelectTrigger id="target-campaign" className="w-full">
                                <SelectValue placeholder="Seleccionar campaña..." />
                            </SelectTrigger>
                            <SelectContent>
                                {(ivrCampaignOptions ?? [])
                                    .filter((c) => c.id !== campaignIdInput)
                                    .map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.id} — {c.name}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setCloneModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleClone}
                            disabled={!targetCampaignId || cloning}
                        >
                            {cloning ? 'Clonando...' : 'Clonar IVR'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default IvrFlowBuilder;
