import { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import {
    LifeBuoy,
    Plus,
    ArrowLeft,
    Send,
    Clock,
    AlertCircle,
    CheckCircle2,
    Circle,
    ExternalLink,
    MessageSquare,
    Loader2,
    Filter,
    RefreshCw,
    Paperclip,
    FileText,
    Image as ImageIcon
} from 'lucide-react';
import { cn } from './ui/utils';
import api from '../services/api';
import socket from '../services/socket';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatToGlobalTimezone } from '@/lib/dateUtils';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Ticket {
    id: number;
    jira_key: string | null;
    jira_id: string | null;
    title: string;
    description: string;
    status: string;
    priority: string;
    created_by: string;
    assigned_to: string | null;
    created_at: string;
    updated_at: string;
    cliente: string | null;
    url: string | null;
    pais: string | null;
    telefono: string | null;
    usuario: string | null;
    comments?: Comment[];
    attachments?: Attachment[];
}

interface Attachment {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    url: string;
    created: string;
}

interface Comment {
    id: number;
    ticket_id: number;
    jira_comment_id: string | null;
    author: string;
    body: string;
    source: 'gescall' | 'jira';
    created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
    Open: { color: 'text-blue-700', bg: 'bg-blue-100', icon: Circle },
    'In Progress': { color: 'text-amber-700', bg: 'bg-amber-100', icon: Clock },
    'To Do': { color: 'text-blue-700', bg: 'bg-blue-100', icon: Circle },
    Done: { color: 'text-emerald-700', bg: 'bg-emerald-100', icon: CheckCircle2 },
    Closed: { color: 'text-slate-600', bg: 'bg-slate-100', icon: CheckCircle2 },
    Resolved: { color: 'text-emerald-700', bg: 'bg-emerald-100', icon: CheckCircle2 },
};

const PRIORITY_CONFIG: Record<string, { color: string; bg: string }> = {
    Critical: { color: 'text-red-700', bg: 'bg-red-100' },
    High: { color: 'text-orange-700', bg: 'bg-orange-100' },
    Medium: { color: 'text-yellow-700', bg: 'bg-yellow-100' },
    Low: { color: 'text-green-700', bg: 'bg-green-100' },
};

const KANBAN_COLUMNS = [
    { id: 'Open', title: 'Por Hacer', statuses: ['Open', 'To Do'] },
    { id: 'In Progress', title: 'En Progreso', statuses: ['In Progress'] },
    { id: 'Done', title: 'Resuelto', statuses: ['Done', 'Resolved'] },
    { id: 'Closed', title: 'Cerrado', statuses: ['Closed'] }
];

function getStatusStyle(status: string) {
    return STATUS_CONFIG[status] || { color: 'text-slate-600', bg: 'bg-slate-100', icon: Circle };
}

function getPriorityStyle(priority: string) {
    return PRIORITY_CONFIG[priority] || { color: 'text-slate-600', bg: 'bg-slate-100' };
}

function timeAgo(dateStr: string, timezone: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Justo ahora';
    if (minutes < 60) return `Hace ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `Hace ${days}d`;
    return formatToGlobalTimezone(dateStr, timezone, 'yyyy-MM-dd');
}

function formatDate(dateStr: string, timezone: string): string {
    return formatToGlobalTimezone(dateStr, timezone, "dd MMM yyyy HH:mm");
}

function renderTextWithAttachments(text: string, attachments?: Attachment[]) {
    if (!text) return null;
    if (!attachments || attachments.length === 0) return <>{text}</>;

    const regex = /!([^|!]+)(?:\|[^!]*)?!/g;
    const parts = [];
    let lastIndex = 0;

    let match;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }

        const filename = match[1].trim();
        const att = attachments.find(a => a.filename === filename);

        if (att) {
            if (att.mimeType.startsWith('image/')) {
                parts.push(
                    <div key={`img-${match.index}`} className="my-3 max-w-sm rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                        <img
                            src={att.url}
                            alt={att.filename}
                            className="w-full h-auto object-contain bg-slate-50 relative z-10"
                            style={{ maxHeight: '400px' }}
                        />
                    </div>
                );
            } else {
                parts.push(
                    <a
                        key={`file-${match.index}`}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 hover:underline bg-blue-50/50 px-2 py-1 rounded border border-blue-100 transition-colors my-1"
                    >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span className="font-medium text-sm">{att.filename}</span>
                    </a>
                );
            }
        } else {
            parts.push(match[0]);
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    return <>{parts}</>;
}

// ── Component ──────────────────────────────────────────────────────────────────
export function SupportTickets() {
    const { session } = useAuthStore();
    const timezone = useSettingsStore((state) => state.timezone);
    const username = session?.agent_user || 'unknown';

    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [commenting, setCommenting] = useState(false);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('');

    // Create form
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newPriority, setNewPriority] = useState('Medium');
    const [newCliente, setNewCliente] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [newPais, setNewPais] = useState('');
    const [newTelefono, setNewTelefono] = useState('');
    const [newUsuario, setNewUsuario] = useState('');

    // Comment form
    const [newComment, setNewComment] = useState('');
    const [newCommentFile, setNewCommentFile] = useState<File | null>(null);

    // ── Data fetch ────────────────────────────────────────────────────────────
    const fetchTickets = useCallback(async () => {
        setLoading(true);
        try {
            const filters: any = {};
            if (statusFilter) filters.status = statusFilter;
            const res = await api.getTickets(filters);
            if (res.success) setTickets(res.data);
        } catch (err) {
            console.error('[SupportTickets] fetchTickets error:', err);
            toast.error('Error al cargar tickets');
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        fetchTickets();
    }, [fetchTickets]);

    // ── Real-time sync via Socket.IO (Jira webhook pushes) ──────────────────
    useEffect(() => {
        socket.connect();
        const handler = (data: any) => {
            console.log('[SupportTickets] ticket:updated event:', data);
            toast.info('Ticket actualizado desde Jira', { duration: 3000 });
            // Silently refresh the list (no loading spinner)
            api.getTickets(statusFilter ? { status: statusFilter } : undefined)
                .then(res => { if (res.success) setTickets(res.data); })
                .catch(() => { });
            // If viewing a detail, refresh it too
            if (selectedTicket) {
                api.getTicket(selectedTicket.id)
                    .then(res => { if (res.success) setSelectedTicket(res.data); })
                    .catch(() => { });
            }
        };
        socket.on('ticket:updated', handler);
        return () => { socket.off('ticket:updated', handler); };
    }, [statusFilter, selectedTicket]);

    const openTicketDetail = async (ticket: Ticket) => {
        setDetailLoading(true);
        setSelectedTicket(ticket);
        try {
            const res = await api.getTicket(ticket.id);
            if (res.success) setSelectedTicket(res.data);
        } catch (err) {
            console.error('[SupportTickets] getTicket error:', err);
            toast.error('Error al cargar detalle del ticket');
        } finally {
            setDetailLoading(false);
        }
    };

    // ── Create ticket ─────────────────────────────────────────────────────────
    const handleCreateTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;
        setCreating(true);
        try {
            const res = await api.createTicket({
                title: newTitle.trim(),
                description: newDescription.trim(),
                priority: newPriority,
                cliente: newCliente.trim() || undefined,
                url: newUrl.trim() || undefined,
                pais: newPais.trim() || undefined,
                telefono: newTelefono.trim() || undefined,
                usuario: newUsuario.trim() || undefined,
            });
            if (res.success) {
                toast.success(
                    res.data.jira_key
                        ? `Ticket ${res.data.jira_key} creado en Jira`
                        : 'Ticket creado exitosamente'
                );
                setNewTitle('');
                setNewDescription('');
                setNewPriority('Medium');
                setNewCliente('');
                setNewUrl('');
                setNewPais('');
                setNewTelefono('');
                setNewUsuario('');
                setShowCreateDialog(false);
                fetchTickets();
            }
        } catch (err: any) {
            toast.error(err.message || 'Error al crear ticket');
        } finally {
            setCreating(false);
        }
    };

    // ── Add comment ───────────────────────────────────────────────────────────
    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTicket) return;
        if (!newComment.trim() && !newCommentFile) return;

        setCommenting(true);
        try {
            // If we only have a file, and no text, add a default message
            const commentBody = newComment.trim() || `Adjunto: ${newCommentFile?.name || ''}`;
            const res = await api.addTicketComment(selectedTicket.id, commentBody);

            if (res.success) {
                // Upload file if selected
                if (newCommentFile) {
                    await api.addTicketAttachment(selectedTicket.id, newCommentFile);
                }

                toast.success('Comentario enviado');
                setNewComment('');
                setNewCommentFile(null);
                // Refresh detail
                openTicketDetail(selectedTicket);
            }
        } catch (err: any) {
            toast.error(err.message || 'Error al enviar comentario');
        } finally {
            setCommenting(false);
        }
    };


    // ── Render ────────────────────────────────────────────────────────────────
    // Detail view
    if (selectedTicket) {
        return (
            <div className="h-full flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTicket(null)}
                        className="gap-1.5 text-slate-600 hover:text-slate-900"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Volver
                    </Button>
                    <Separator orientation="vertical" className="h-5" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl font-bold text-slate-800 truncate">{selectedTicket.title}</h1>
                            {selectedTicket.jira_key && (
                                <Badge variant="outline" className="text-xs font-mono bg-blue-50 text-blue-600 border-blue-200">
                                    <ExternalLink className="w-3 h-3 mr-1" />
                                    {selectedTicket.jira_key}
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                            <span>Creado por <strong>{selectedTicket.created_by}</strong></span>
                            <span>·</span>
                            <span>{formatDate(selectedTicket.created_at, timezone)}</span>
                        </div>
                    </div>
                    {(() => {
                        const st = getStatusStyle(selectedTicket.status);
                        const StatusIcon = st.icon;
                        return (
                            <Badge className={cn('gap-1 px-3 py-1.5 text-sm font-medium', st.bg, st.color)}>
                                <StatusIcon className="w-3.5 h-3.5" />
                                {selectedTicket.status}
                            </Badge>
                        );
                    })()}
                </div>

                {/* Content */}
                <div className="flex-1 flex gap-6 min-h-0">
                    {/* Left panel – description + comments */}
                    <div className="flex-1 flex flex-col bg-white/90 backdrop-blur rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
                        {/* Description */}
                        {selectedTicket.description && (
                            <div className="p-5 border-b border-slate-100">
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                    Descripción
                                </h3>
                                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                                    {renderTextWithAttachments(selectedTicket.description, selectedTicket.attachments)}
                                </div>
                            </div>
                        )}

                        {/* Attachments (Gallery) */}
                        {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
                            <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <Paperclip className="w-3.5 h-3.5" />
                                    Adjuntos ({selectedTicket.attachments.length})
                                </h3>
                                <div className="flex flex-wrap gap-3">
                                    {selectedTicket.attachments.map(att => {
                                        const isImage = att.mimeType.startsWith('image/');
                                        return (
                                            <a
                                                key={att.id}
                                                href={att.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="group flex flex-col w-36 bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all relative"
                                            >
                                                {isImage ? (
                                                    <div className="h-24 bg-slate-100 flex items-center justify-center p-2 border-b border-slate-100 overflow-hidden">
                                                        <img src={att.url} alt={att.filename} className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform" />
                                                    </div>
                                                ) : (
                                                    <div className="h-24 bg-slate-50 flex items-center justify-center border-b border-slate-100">
                                                        <FileText className="w-10 h-10 text-slate-300 group-hover:text-blue-400 transition-colors" />
                                                    </div>
                                                )}
                                                <div className="p-2.5">
                                                    <p className="text-[11px] font-semibold text-slate-700 group-hover:text-blue-600 truncate" title={att.filename}>
                                                        {att.filename}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                                        {(att.size / 1024).toFixed(1)} KB
                                                    </p>
                                                </div>
                                            </a>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Comments */}
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-slate-400" />
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    Comentarios ({selectedTicket.comments?.length || 0})
                                </h3>
                            </div>

                            <ScrollArea className="flex-1 px-5">
                                {detailLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                    </div>
                                ) : selectedTicket.comments && selectedTicket.comments.length > 0 ? (
                                    <div className="space-y-4 pb-4">
                                        {selectedTicket.comments.map((comment) => (
                                            <div
                                                key={comment.id}
                                                className={cn(
                                                    'rounded-xl p-4 transition-all',
                                                    comment.source === 'jira'
                                                        ? 'bg-blue-50/80 border border-blue-100'
                                                        : 'bg-slate-50 border border-slate-100'
                                                )}
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div
                                                        className={cn(
                                                            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                                                            comment.source === 'jira'
                                                                ? 'bg-blue-500 text-white'
                                                                : 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white'
                                                        )}
                                                    >
                                                        {comment.author.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="font-medium text-sm text-slate-800">
                                                        {comment.author}
                                                    </span>
                                                    {comment.source === 'jira' && (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px] font-mono bg-blue-100 text-blue-600 border-blue-200 px-1.5 py-0"
                                                        >
                                                            Jira
                                                        </Badge>
                                                    )}
                                                    <span className="text-xs text-slate-400 ml-auto">
                                                        {formatDate(comment.created_at, timezone)}
                                                    </span>
                                                </div>
                                                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed pl-9">
                                                    {renderTextWithAttachments(comment.body, selectedTicket.attachments)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                        <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
                                        <p className="text-sm">Sin comentarios aún</p>
                                    </div>
                                )}
                            </ScrollArea>

                            {/* Add comment form */}
                            <form onSubmit={handleAddComment} className="p-4 border-t border-slate-100 flex flex-col gap-3">
                                {newCommentFile && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg max-w-sm">
                                        <Paperclip className="w-4 h-4 text-blue-500" />
                                        <span className="text-xs font-medium text-blue-700 truncate min-w-0 pr-2">
                                            {newCommentFile.name}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setNewCommentFile(null)}
                                            className="ml-auto text-blue-400 hover:text-blue-600 focus:outline-none"
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <label className="flex items-center justify-center p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-400">
                                        <Paperclip className="w-4 h-4" />
                                        <input
                                            type="file"
                                            className="sr-only"
                                            onChange={(e) => {
                                                if (e.target.files && e.target.files[0]) {
                                                    setNewCommentFile(e.target.files[0]);
                                                }
                                                // Reset so we can select the same file again if aborted
                                                e.target.value = '';
                                            }}
                                            disabled={commenting}
                                        />
                                    </label>
                                    <input
                                        type="text"
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Escribe un comentario..."
                                        className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 bg-white placeholder:text-slate-400 transition-all"
                                        disabled={commenting}
                                    />
                                    <Button
                                        type="submit"
                                        disabled={commenting || (!newComment.trim() && !newCommentFile)}
                                        className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 gap-1.5 shadow-sm"
                                    >
                                        {commenting ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Send className="w-4 h-4" />
                                        )}
                                        Enviar
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>

                    {/* Right panel – meta info */}
                    <div className="w-56 space-y-4 hidden lg:block">
                        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-sm border border-slate-200/60 p-4 space-y-4">
                            <div>
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Prioridad</span>
                                {(() => {
                                    const ps = getPriorityStyle(selectedTicket.priority);
                                    return (
                                        <Badge className={cn('mt-1 gap-1', ps.bg, ps.color)}>
                                            <AlertCircle className="w-3 h-3" />
                                            {selectedTicket.priority}
                                        </Badge>
                                    );
                                })()}
                            </div>

                            <div>
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Asignado a</span>
                                <p className="text-sm text-slate-700 mt-1">{selectedTicket.assigned_to || '—'}</p>
                            </div>

                            <div>
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Última actualización</span>
                                <p className="text-sm text-slate-700 mt-1">{timeAgo(selectedTicket.updated_at, timezone)}</p>
                            </div>
                        </div>

                        {/* Custom Jira fields */}
                        {(selectedTicket.cliente || selectedTicket.usuario || selectedTicket.pais || selectedTicket.telefono || selectedTicket.url) && (
                            <div className="bg-white/90 backdrop-blur rounded-2xl shadow-sm border border-slate-200/60 p-4 space-y-3">
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Info del ticket</span>
                                {selectedTicket.cliente && (
                                    <div>
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase">Cliente</span>
                                        <p className="text-sm text-slate-700">{selectedTicket.cliente}</p>
                                    </div>
                                )}
                                {selectedTicket.usuario && (
                                    <div>
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase">Usuario</span>
                                        <p className="text-sm text-slate-700">{selectedTicket.usuario}</p>
                                    </div>
                                )}
                                {selectedTicket.pais && (
                                    <div>
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase">País</span>
                                        <p className="text-sm text-slate-700">{selectedTicket.pais}</p>
                                    </div>
                                )}
                                {selectedTicket.telefono && (
                                    <div>
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase">Teléfono</span>
                                        <p className="text-sm text-slate-700">{selectedTicket.telefono}</p>
                                    </div>
                                )}
                                {selectedTicket.url && (
                                    <div>
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase">URL</span>
                                        <a href={selectedTicket.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate block">{selectedTicket.url}</a>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Ticket list view ──────────────────────────────────────────────────────
    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 relative z-20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md">
                        <LifeBuoy className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                            Soporte
                        </h1>
                        <p className="text-sm text-slate-500">Tickets de soporte sincronizados con Jira</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchTickets}
                        className="rounded-xl gap-1.5 text-slate-600"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Actualizar
                    </Button>
                    <Button
                        onClick={() => setShowCreateDialog(true)}
                        className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white gap-1.5 shadow-md"
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Ticket
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 mb-4">
                <Filter className="w-4 h-4 text-slate-400" />
                {['', 'Open', 'In Progress', 'Done', 'Closed'].map((s) => (
                    <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                            statusFilter === s
                                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700'
                        )}
                    >
                        {s || 'Todos'}
                    </button>
                ))}
            </div>

            {/* Create dialog overlay */}
            {showCreateDialog && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Plus className="w-5 h-5 text-blue-600" />
                                Nuevo Ticket de Soporte
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">
                                Se creará en Jira automáticamente si la integración está configurada.
                            </p>
                        </div>
                        <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                                    Título *
                                </label>
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    placeholder="Resumen del problema..."
                                    required
                                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 placeholder:text-slate-400 transition-all"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                                    Descripción
                                </label>
                                <textarea
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    placeholder="Describe el problema con detalle..."
                                    rows={4}
                                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 placeholder:text-slate-400 transition-all resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Cliente</label>
                                    <input
                                        type="text"
                                        value={newCliente}
                                        onChange={(e) => setNewCliente(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Usuario</label>
                                    <input
                                        type="text"
                                        value={newUsuario}
                                        onChange={(e) => setNewUsuario(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">País</label>
                                    <input
                                        type="text"
                                        value={newPais}
                                        onChange={(e) => setNewPais(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Teléfono</label>
                                    <input
                                        type="text"
                                        value={newTelefono}
                                        onChange={(e) => setNewTelefono(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">URL</label>
                                <input
                                    type="url"
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                                    Prioridad
                                </label>
                                <div className="flex gap-2">
                                    {['Low', 'Medium', 'High', 'Critical'].map((p) => {
                                        const ps = getPriorityStyle(p);
                                        return (
                                            <button
                                                type="button"
                                                key={p}
                                                onClick={() => setNewPriority(p)}
                                                className={cn(
                                                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                                                    newPriority === p
                                                        ? cn(ps.bg, ps.color, 'border-current shadow-sm')
                                                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                                )}
                                            >
                                                {p}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setShowCreateDialog(false)}
                                    className="rounded-xl"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={creating || !newTitle.trim()}
                                    className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white gap-1.5 shadow-sm"
                                >
                                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    Crear Ticket
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Ticket list / Kanban */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {loading ? (
                    <div className="flex items-center justify-center py-24 flex-1">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                ) : tickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400 flex-1">
                        <LifeBuoy className="w-12 h-12 mb-3 opacity-30" />
                        <p className="text-lg font-medium text-slate-500">No hay tickets</p>
                        <p className="text-sm mt-1">
                            {statusFilter
                                ? 'No se encontraron tickets con ese filtro.'
                                : 'Crea tu primer ticket de soporte.'}
                        </p>
                    </div>
                ) : (
                    <div className="flex gap-4 h-full overflow-x-auto pb-4 items-start px-1">
                        {KANBAN_COLUMNS.map(col => {
                            const colTickets = tickets.filter(t =>
                                col.statuses.includes(t.status) ||
                                (col.id === 'Open' && !col.statuses.includes(t.status) && !KANBAN_COLUMNS.some(c => c.statuses.includes(t.status)))
                            );

                            return (
                                <div
                                    key={col.id}
                                    className="flex-1 min-w-[280px] max-w-[340px] flex flex-col bg-slate-50/50 rounded-2xl border border-slate-200/60 max-h-full"
                                >
                                    <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-white/50 rounded-t-2xl">
                                        <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                                            {col.title}
                                        </h3>
                                        <Badge variant="secondary" className="bg-white text-slate-600 shadow-sm">{colTickets.length}</Badge>
                                    </div>
                                    <ScrollArea className="flex-1 p-3">
                                        <div className="space-y-3 pb-2 min-h-[50px]">
                                            {colTickets.map(ticket => {
                                                const ps = getPriorityStyle(ticket.priority);
                                                return (
                                                    <div
                                                        key={ticket.id}
                                                        onClick={() => openTicketDetail(ticket)}
                                                        className="bg-white rounded-xl border border-slate-200/60 hover:border-blue-300 hover:shadow-md transition-all p-3 group shadow-sm flex flex-col gap-2 cursor-pointer"
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="font-semibold text-sm text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-2 leading-tight">
                                                                    {ticket.title}
                                                                </h4>
                                                            </div>
                                                            {ticket.jira_key && (
                                                                <Badge variant="outline" className="text-[10px] font-mono bg-blue-50 text-blue-500 border-blue-200 px-1 py-0 h-4 flex-shrink-0">
                                                                    {ticket.jira_key}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-500 line-clamp-2">
                                                            {ticket.description || 'Sin descripción'}
                                                        </p>
                                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 flex-shrink-0" title={`Creado por: ${ticket.created_by}`}>
                                                                    {ticket.created_by.charAt(0).toUpperCase()}
                                                                </div>
                                                                <span className="text-[10px] text-slate-400 truncate">{timeAgo(ticket.updated_at, timezone)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                <div className={cn('flex items-center justify-center w-5 h-5 rounded-md', ps.bg, ps.color)} title={`Prioridad: ${ticket.priority}`}>
                                                                    <AlertCircle className="w-3 h-3" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </ScrollArea>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
