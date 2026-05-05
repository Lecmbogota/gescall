import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { TeleprompterWidget } from './TeleprompterWidget';
import { useTeleprompterSettings } from '../hooks/useTeleprompterSettings';
import socketService from '../services/socket';
import { StickyNotesWidget } from './StickyNotesWidget';
import GoalsWidget, { AgentGoalRow } from './GoalsWidget';
import { useWebPhone } from '../hooks/useWebPhone';
import { FloatingTeleprompter } from './FloatingTeleprompter';
import AnimatedList from './AnimatedList';
import api from '../services/api';
import corporateHeaderBg from '../assets/corporate_header_bg.png';

const AVAILABLE_WIDGETS = [
  { id: 'metas', label: 'Meta de Ventas', icon: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></>, color: 'text-amber-500' },
  { id: 'notas', label: 'Notas Rápidas (Sticky)', icon: <><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></>, color: 'text-yellow-600' },
  { id: 'avisos', label: 'Aviso del Supervisor', icon: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>, color: 'text-indigo-500' },
  { id: 'calendario', label: 'Calendario y Callbacks', icon: <><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></>, color: 'text-blue-500' },
  { id: 'ranking', label: 'Ranking (Leaderboard)', icon: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></>, color: 'text-amber-500' },
  { id: 'teleprompter', label: 'Teleprompter Dinámico', icon: <><polygon points="5 3 19 12 5 21 5 3"/><line x1="19" y1="5" x2="19" y2="19"/></>, color: 'text-yellow-500' },
];

const splitTeleprompterTemplate = (template: string) =>
  (template || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const normalizeTemplateVars = (template: string, vars: Record<string, string>) =>
  (template || '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_m, rawKey: string) => {
    const key = String(rawKey || '').trim();
    if (!key) return '';
    return vars[key] ?? `{{${key}}}`;
  });

const normalizeTeleprompterDayparts = (raw?: any) => {
  const src = raw && typeof raw === 'object' ? raw : {};
  const toHour = (v: any, fallback: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(23, Math.floor(n)));
  };
  return {
    day: typeof src.day === 'string' && src.day.trim() ? src.day.trim() : 'día',
    afternoon: typeof src.afternoon === 'string' && src.afternoon.trim() ? src.afternoon.trim() : 'tarde',
    night: typeof src.night === 'string' && src.night.trim() ? src.night.trim() : 'noche',
    day_start: toHour(src.day_start, 6),
    day_end: toHour(src.day_end, 11),
    afternoon_start: toHour(src.afternoon_start, 12),
    afternoon_end: toHour(src.afternoon_end, 18),
    night_start: toHour(src.night_start, 19),
    night_end: toHour(src.night_end, 5),
  };
};

function parseLeadTtsVars(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw == null) return out;
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return out;
    }
  }
  if (typeof obj !== 'object' || obj === null) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') continue;
    out[String(k)] = String(v);
  }
  return out;
}

const DEFAULT_PAUSE_CONFIG: Record<string, { label: string; limit: number; icon?: string }> = {
  'not_ready': { label: 'No Disponible', limit: 600 },
  'not_ready_bano': { label: 'Pausa - Baño', limit: 900, icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  'not_ready_almuerzo': { label: 'Pausa - Almuerzo', limit: 1800, icon: 'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3' },
  'not_ready_backoffice': { label: 'Pausa - Backoffice', limit: 900, icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' },
  'not_ready_capacitacion': { label: 'Pausa - Capacitación', limit: 3600, icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' },
};

function normalizePauseConfig(raw?: any) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out: Record<string, { name: string; limit: number; icon?: string; enabled: boolean }> = {} as any;
  const incomingKeys = Object.keys(src).filter((k) => k === 'not_ready' || /^not_ready_[a-z0-9_]{2,60}$/i.test(k));
  const keys = Array.from(new Set([...Object.keys(DEFAULT_PAUSE_CONFIG), ...incomingKeys]));
  for (const id of keys) {
    const def = DEFAULT_PAUSE_CONFIG[id] || { label: id.replace(/^not_ready_?/, '').replace(/_/g, ' ') || 'Pausa', limit: 900 };
    const row = src[id] && typeof src[id] === 'object' ? src[id] : {};
    const enabled = typeof row.enabled === 'boolean' ? row.enabled : true;
    const n = Number(row.limit_seconds);
    const limit = Number.isFinite(n) ? Math.max(15, Math.min(28800, Math.floor(n))) : def.limit;
    const rowLabel = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : def.label;
    out[id] = { name: rowLabel, limit, icon: def.icon, enabled };
  }
  return out;
}

export const AgentWorkspace: React.FC = () => {
  const { session, logout } = useAuthStore();
  const [phoneNumber, setPhoneNumber] = useState('');

  const handleLogout = () => {
    const username = (session?.user as any)?.username || (session?.user as any)?.name || 'AG';
    // Broadcast OFFLINE immediately so supervisors see agent as disconnected
    socketService.updateAgentState(username, 'OFFLINE');
    // Allow WS message to be sent before disconnecting
    setTimeout(() => {
      socketService.disconnect();
    }, 200);
    logout();
  };
  
  const sipExtension = (session?.user as any)?.sip_extension;
  const sipPassword = (session?.user as any)?.sip_password;
  
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${window.location.hostname}/ws`;
  
  const { status: sipStatus, call: makeCall, answer, hangup, mute, audioRef, callerId } = useWebPhone(
    sipExtension, sipPassword, wsUrl
  );

  const callStatus = sipStatus === 'incall' ? 'connected' : (sipStatus === 'calling' ? 'calling' : 'idle');

  const [agentState, setAgentState] = useState<'ready' | 'not_ready'>(() => {
    const saved = localStorage.getItem('gescall_agentState');
    return saved ? (saved as 'ready' | 'not_ready') : 'ready';
  });
  const [isTipificarOpen, setIsTipificarOpen] = useState(false);
  const [selectedTypification, setSelectedTypification] = useState('');
  const [selectedTypId, setSelectedTypId] = useState<number | null>(null);
  const [isPhoneExpanded, setIsPhoneExpanded] = useState(false);
  const [isWidgetManagerOpen, setIsWidgetManagerOpen] = useState(false);

  // Tipificación dinámica
  const [typs, setTyps] = useState<any[]>([]);
  const [formFields, setFormFields] = useState<any[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [typsLoading, setTypsLoading] = useState(false);
  const [typsSubmitting, setTypsSubmitting] = useState(false);
  const agentCampaigns: string[] = React.useMemo(() => {
    const raw = (session as any)?.campaigns || [];
    return raw.map((c: any) => typeof c === 'string' ? c : c.id).filter(Boolean);
  }, [session]);
  const agentUsername = (session?.user as any)?.username || (session?.user as any)?.name || 'AG';
  const [campaignName, setCampaignName] = useState<string>('');
  const [campaignTeleprompterTemplate, setCampaignTeleprompterTemplate] = useState<string>('');
  const [campaignTeleprompterDayparts, setCampaignTeleprompterDayparts] = useState(() => normalizeTeleprompterDayparts());
  const [assignedLeadVars, setAssignedLeadVars] = useState<Record<string, string>>({});
  const [crmLeadDetail, setCrmLeadDetail] = useState<Record<string, unknown> | null>(null);
  const [crmLeadLoading, setCrmLeadLoading] = useState(false);
  const [campaignPauseConfig, setCampaignPauseConfig] = useState(() => normalizePauseConfig());
  const activeCampaignId = selectedCampaignId || agentCampaigns[0] || '';

  const loadAgentWorkspaceLead = React.useCallback(async (leadId: string) => {
    const id = parseInt(String(leadId), 10);
    if (!Number.isFinite(id) || id <= 0) {
      setCrmLeadDetail(null);
      return;
    }
    setCrmLeadLoading(true);
    try {
      const res: any = await api.getAgentWorkspaceLead(String(id));
      if (res?.success && res?.data) setCrmLeadDetail(res.data as Record<string, unknown>);
      else setCrmLeadDetail(null);
    } catch {
      setCrmLeadDetail(null);
    } finally {
      setCrmLeadLoading(false);
    }
  }, []);

  const [agentCampaignType, setAgentCampaignType] = useState<string | null>(null);
  React.useEffect(() => {
    if (activeCampaignId) {
      api.getCampaignById(activeCampaignId).then((res: any) => {
        const row = Array.isArray(res?.data) ? res.data[0] : res?.data;
        if (row?.campaign_type) setAgentCampaignType(row.campaign_type);
        if (row?.campaign_name) setCampaignName(row.campaign_name);
        if (typeof row?.teleprompter_template === 'string') {
          setCampaignTeleprompterTemplate(row.teleprompter_template);
        } else {
          setCampaignTeleprompterTemplate('');
        }
        setCampaignTeleprompterDayparts(normalizeTeleprompterDayparts(row?.teleprompter_dayparts));
        setCampaignPauseConfig(normalizePauseConfig(row?.pause_settings));
      }).catch(() => {});
    }
  }, [activeCampaignId]);

  const teleprompterSegments = React.useMemo(() => {
    const hour = new Date().getHours();
    const isWithinRange = (h: number, start: number, end: number) => {
      if (start <= end) return h >= start && h <= end;
      return h >= start || h <= end;
    };
    const timePeriod =
      isWithinRange(hour, campaignTeleprompterDayparts.day_start, campaignTeleprompterDayparts.day_end)
        ? campaignTeleprompterDayparts.day
        : isWithinRange(hour, campaignTeleprompterDayparts.afternoon_start, campaignTeleprompterDayparts.afternoon_end)
          ? campaignTeleprompterDayparts.afternoon
          : isWithinRange(hour, campaignTeleprompterDayparts.night_start, campaignTeleprompterDayparts.night_end)
            ? campaignTeleprompterDayparts.night
            : campaignTeleprompterDayparts.night;

    const row = crmLeadDetail;
    const tts = row ? parseLeadTtsVars(row.tts_vars) : {};
    const merged: Record<string, string> = { ...tts, ...assignedLeadVars };
    const fn = (row?.first_name != null && String(row.first_name).trim()) || merged.first_name || merged.nombre || '';
    const ln = (row?.last_name != null && String(row.last_name).trim()) || merged.last_name || merged.apellido || '';
    const resolvedCustomer =
      [fn, ln].filter(Boolean).join(' ').trim() ||
      merged.customer_name ||
      merged.name ||
      merged.nombre_completo ||
      'cliente';

    const withVars = normalizeTemplateVars(campaignTeleprompterTemplate || '', {
      agent_name: agentUsername,
      time_period: timePeriod,
      campaign_name: campaignName || activeCampaignId || '',
      phone_number: callerId || phoneNumber || merged.phone_number || merged.phone || '',
      customer_name: merged.customer_name || merged.nombre || merged.name || resolvedCustomer,
      balance: merged.balance || merged.saldo || 'pendiente',
      due_date: merged.due_date || merged.fecha_limite || 'por confirmar',
      ...merged,
    });
    return splitTeleprompterTemplate(withVars);
  }, [
    campaignTeleprompterTemplate,
    campaignTeleprompterDayparts,
    agentUsername,
    campaignName,
    activeCampaignId,
    callerId,
    phoneNumber,
    assignedLeadVars,
    crmLeadDetail,
  ]);

  const crmSnapshot = React.useMemo(() => {
    const row = crmLeadDetail;
    const tts = row ? parseLeadTtsVars(row.tts_vars) : {};
    const merged: Record<string, string> = { ...tts, ...assignedLeadVars };
    const phone =
      (row?.phone_number != null && String(row.phone_number)) ||
      merged.phone_number ||
      merged.phone ||
      callerId ||
      phoneNumber ||
      '';
    const fn = (row?.first_name != null && String(row.first_name).trim()) || merged.first_name || merged.nombre || '';
    const ln = (row?.last_name != null && String(row.last_name).trim()) || merged.last_name || merged.apellido || '';
    let displayName = [fn, ln].filter(Boolean).join(' ').trim();
    if (!displayName) {
      displayName =
        merged.customer_name ||
        merged.name ||
        merged.nombre_completo ||
        (phone ? `Contacto · ${phone}` : 'Contacto');
    }
    const subtitleParts: string[] = [];
    if (row?.vendor_lead_code != null && String(row.vendor_lead_code).trim()) {
      subtitleParts.push(`Ref: ${String(row.vendor_lead_code).trim()}`);
    }
    if (row?.lead_id != null) subtitleParts.push(`Lead #${row.lead_id}`);
    const subtitle =
      (merged.email && merged.email.trim()) ||
      (merged.correo && merged.correo.trim()) ||
      subtitleParts.join(' · ') ||
      (crmLeadLoading ? 'Cargando ficha…' : 'Sin datos adicionales');
    const headerTitle = campaignName || selectedCampaignId || agentCampaigns[0] || 'Ficha de contacto';
    const listName = (row?.list_name != null && String(row.list_name)) || '—';
    const leadStatus = (row?.status != null && String(row.status)) || merged.status || '—';
    const extraLine =
      (merged.plan && merged.plan.trim()) ||
      (merged.producto && merged.producto.trim()) ||
      (merged.product && merged.product.trim()) ||
      '—';
    const campaignIdRow = row?.campaign_id != null ? String(row.campaign_id) : '';
    const comments =
      row?.comments != null && String(row.comments).trim() ? String(row.comments).trim() : '';
    const altPhone = (merged.alt_phone && merged.alt_phone.trim()) || (merged.telefono2 && merged.telefono2.trim()) || '';
    return {
      displayName,
      subtitle,
      headerTitle,
      listName,
      leadStatus,
      extraLine,
      phone,
      comments,
      altPhone,
      campaignIdRow,
    };
  }, [
    crmLeadDetail,
    assignedLeadVars,
    callerId,
    phoneNumber,
    campaignName,
    selectedCampaignId,
    agentCampaigns,
    crmLeadLoading,
  ]);

  const formatShiftLogged = React.useCallback((totalSec: number) => {
    const s = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  }, []);

  const [shiftLoggedBase, setShiftLoggedBase] = useState<{ value: number; atMs: number }>({ value: 0, atMs: Date.now() });
  const [shiftMetricsHydrated, setShiftMetricsHydrated] = useState(false);
  const [callsTodayLive, setCallsTodayLive] = useState<number | null>(null);
  const [queueDepthLive, setQueueDepthLive] = useState<number | null>(null);
  const [nowTickerMs, setNowTickerMs] = useState(Date.now());

  React.useEffect(() => {
    const id = window.setInterval(() => setNowTickerMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    socketService.connect();
    const handler = (payload: {
      username: string;
      logged_seconds?: number;
      calls_today?: number;
      queue_depth?: number;
    }) => {
      if (!payload || payload.username !== agentUsername) return;
      setShiftLoggedBase({
        value: Math.max(0, Number(payload.logged_seconds) || 0),
        atMs: Date.now(),
      });
      setCallsTodayLive(Number(payload.calls_today) || 0);
      setQueueDepthLive(Number(payload.queue_depth) || 0);
      setShiftMetricsHydrated(true);
    };
    socketService.subscribeAgentWorkspaceMetrics(agentUsername, handler);
    return () => socketService.unsubscribeAgentWorkspaceMetrics(agentUsername, handler);
  }, [agentUsername]);

  const liveLoggedSeconds =
    shiftLoggedBase.value + Math.floor((nowTickerMs - shiftLoggedBase.atMs) / 1000);

  type WorkspaceDashboardData = {
    notices: Array<{ id: number; body: string; campaign_id: string | null; created_at: string }>;
    callbacks: Array<{
      id: number;
      contact_name: string;
      phone?: string | null;
      scheduled_at: string;
      notes?: string | null;
      campaign_id?: string | null;
      status: string;
    }>;
    goals: AgentGoalRow[];
    leaderboard: Array<{ rank: number; username: string; score: number; is_self: boolean }>;
  };
  type ChatMessageRow = {
    id: number;
    campaign_id: string;
    agent_username: string;
    sender_username: string;
    sender_role: 'AGENT' | 'SUPERVISOR';
    body: string;
    created_at: string;
  };
  const [workspaceDash, setWorkspaceDash] = useState<WorkspaceDashboardData | null>(null);
  const [workspaceDashLoading, setWorkspaceDashLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessageRow[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [activeApp, setActiveApp] = useState<'home' | 'estado' | 'telefono' | 'historial' | 'chat'>('home');
  const [chatLastReadSupId, setChatLastReadSupId] = React.useState(0);
  const chatScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [isSupervisorOnline, setIsSupervisorOnline] = useState(false);

  const reloadWorkspaceDashboard = React.useCallback(async () => {
    try {
      setWorkspaceDashLoading(true);
      const res = await api.getAgentWorkspaceDashboard();
      if (res.success && res.data) setWorkspaceDash(res.data as WorkspaceDashboardData);
      else setWorkspaceDash(null);
    } catch {
      setWorkspaceDash(null);
    } finally {
      setWorkspaceDashLoading(false);
    }
  }, []);

  React.useEffect(() => {
    reloadWorkspaceDashboard();
  }, [agentUsername, reloadWorkspaceDashboard]);

  React.useEffect(() => {
    socketService.connect();
    const handler = () => {
      reloadWorkspaceDashboard();
    };
    socketService.on('agent:workspace:refresh', handler);
    return () => socketService.off('agent:workspace:refresh', handler);
  }, [reloadWorkspaceDashboard]);

  const activeChatCampaignId = selectedCampaignId || agentCampaigns[0] || '';
  const chatReadStorageKey =
    activeChatCampaignId && agentUsername
      ? `gescall_chat_last_read_sup:${activeChatCampaignId}:${agentUsername}`
      : '';

  const loadChatMessages = React.useCallback(async () => {
    if (!activeChatCampaignId) {
      setChatMessages([]);
      return;
    }
    try {
      setChatLoading(true);
      const res: any = await api.listAgentWorkspaceChatMessages({
        campaign_id: activeChatCampaignId,
      });
      if (res?.success && Array.isArray(res.data)) setChatMessages(res.data);
      else setChatMessages([]);
    } catch {
      setChatMessages([]);
    } finally {
      setChatLoading(false);
    }
  }, [activeChatCampaignId]);

  React.useEffect(() => {
    loadChatMessages();
  }, [loadChatMessages]);

  React.useEffect(() => {
    if (!chatReadStorageKey) {
      setChatLastReadSupId(0);
      return;
    }
    try {
      const stored = parseInt(localStorage.getItem(chatReadStorageKey) || '0', 10);
      setChatLastReadSupId(Number.isFinite(stored) ? stored : 0);
    } catch {
      setChatLastReadSupId(0);
    }
  }, [chatReadStorageKey]);

  React.useEffect(() => {
    if (!activeChatCampaignId || !agentUsername) return;
    socketService.connect();
    const handler = (payload: any) => {
      if (!payload) return;
      if (payload.campaign_id !== activeChatCampaignId) return;
      if (payload.agent_username !== agentUsername) return;
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) return prev;
        return [...prev, payload];
      });
    };
    const presenceHandler = (presence: any) => {
      if (!presence || typeof presence.supervisor_online !== 'boolean') return;
      const expectedRoom = `agent-workspace-chat:${activeChatCampaignId}:${agentUsername}`;
      if (presence.room !== expectedRoom) return;
      setIsSupervisorOnline(Boolean(presence.supervisor_online));
    };
    socketService.subscribeAgentWorkspaceChat(activeChatCampaignId, agentUsername, handler, {
      participantRole: 'AGENT',
      participantUsername: agentUsername,
    });
    socketService.onAgentWorkspaceChatPresence(presenceHandler);
    return () => {
      socketService.unsubscribeAgentWorkspaceChat(activeChatCampaignId, agentUsername, handler);
      socketService.offAgentWorkspaceChatPresence(presenceHandler);
      setIsSupervisorOnline(false);
    };
  }, [activeChatCampaignId, agentUsername]);

  React.useEffect(() => {
    if (activeApp !== 'chat' || !chatReadStorageKey) return;
    const maxSupervisorId = chatMessages
      .filter((m) => m.sender_role === 'SUPERVISOR')
      .reduce((acc, m) => Math.max(acc, m.id), 0);
    if (maxSupervisorId <= 0) return;
    setChatLastReadSupId((prev) => {
      const next = Math.max(prev, maxSupervisorId);
      if (next > prev) {
        try {
          localStorage.setItem(chatReadStorageKey, String(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, [activeApp, chatMessages, chatReadStorageKey]);

  const supervisorChatUnreadCount = React.useMemo(
    () =>
      chatMessages.filter((m) => m.sender_role === 'SUPERVISOR' && m.id > chatLastReadSupId).length,
    [chatMessages, chatLastReadSupId]
  );
  const hasSupervisorUnread = supervisorChatUnreadCount > 0 && activeApp !== 'chat';

  React.useEffect(() => {
    if (activeApp !== 'chat') return;
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeApp, chatMessages, chatLoading]);

  const sendChatMessage = React.useCallback(async () => {
    if (!activeChatCampaignId) return;
    const body = chatDraft.trim();
    if (!body || chatSending) return;
    setChatSending(true);
    try {
      const res: any = await api.sendAgentWorkspaceChatMessage({
        body,
        campaign_id: activeChatCampaignId,
      });
      if (res?.success && res.data) {
        setChatDraft('');
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === res.data.id)) return prev;
          return [...prev, res.data];
        });
      }
    } finally {
      setChatSending(false);
    }
  }, [activeChatCampaignId, chatDraft, chatSending]);

  const formatWorkspaceCallbackSlot = React.useCallback((scheduledAt: string) => {
    const d = new Date(scheduledAt);
    if (Number.isNaN(d.getTime())) return { label: '—', timeShort: '--:--' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const slotDay = new Date(d);
    slotDay.setHours(0, 0, 0, 0);
    const diff = Math.round((slotDay.getTime() - today.getTime()) / 86400000);
    let label = 'Otro día';
    if (diff === 0) label = 'Hoy';
    else if (diff === 1) label = 'Mañana';
    const timeShort = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return { label, timeShort };
  }, []);

  const defaultOrder = AVAILABLE_WIDGETS.map(w => w.id);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gescall_widget_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure all default widgets exist in the loaded order, append missing ones
        return [...new Set([...parsed, ...defaultOrder])];
      }
    } catch(e) {}
    return defaultOrder;
  });

  const [activeWidgets, setActiveWidgets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gescall_active_widgets');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return defaultOrder;
  });

  React.useEffect(() => {
    localStorage.setItem('gescall_widget_order', JSON.stringify(widgetOrder));
  }, [widgetOrder]);

  React.useEffect(() => {
    localStorage.setItem('gescall_active_widgets', JSON.stringify(activeWidgets));
  }, [activeWidgets]);

  const moveWidgetUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...widgetOrder];
    const temp = newOrder[index - 1];
    newOrder[index - 1] = newOrder[index];
    newOrder[index] = temp;
    setWidgetOrder(newOrder);
  };

  const moveWidgetDown = (index: number) => {
    if (index === widgetOrder.length - 1) return;
    const newOrder = [...widgetOrder];
    const temp = newOrder[index + 1];
    newOrder[index + 1] = newOrder[index];
    newOrder[index] = temp;
    setWidgetOrder(newOrder);
  };

  const [isTeleprompterVisible, setIsTeleprompterVisible] = useState(false);
  const { settings: teleprompterSettings, updateSetting: updateTeleprompterSetting } = useTeleprompterSettings();
  const [canManualDial, setCanManualDial] = useState(false); // Demo: Inbound only por defecto
  const [chatHeight, setChatHeight] = useState('h-[320px]');
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const [isSpeechExpanded, setIsSpeechExpanded] = useState(true);
  const [showContactCard, setShowContactCard] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);

  React.useEffect(() => {
    if (callStatus !== 'idle') {
      setShowContactCard(true);
    }
  }, [callStatus]);

  const PAUSE_CONFIG = campaignPauseConfig;
  const AUX_PAUSES = React.useMemo(() => {
    return Object.entries(PAUSE_CONFIG)
      .filter(([id, cfg]) => id !== 'not_ready' && cfg.enabled)
      .map(([id, cfg]) => ({
        id,
        label: cfg.name,
        icon: cfg.icon || 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
      }));
  }, [PAUSE_CONFIG]);

  const [pauseOverlay, setPauseOverlay] = useState<{
    isOpen: boolean;
    step: 'request_pin' | 'timer';
    targetStateId: string;
    targetStateName: string;
    limitSeconds: number;
    startTime: number;
  } | null>(() => {
    const saved = localStorage.getItem('gescall_pauseOverlay');
    return saved ? JSON.parse(saved) : null;
  });

  const [pausePinInput, setPausePinInput] = useState('');
  const [pauseElapsed, setPauseElapsed] = useState(() => {
    const saved = localStorage.getItem('gescall_pauseOverlay');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.step === 'timer') {
        return Math.floor((Date.now() - parsed.startTime) / 1000);
      }
    }
    return 0;
  });
  const [pinError, setPinError] = useState(false);
  const [pinVerifying, setPinVerifying] = useState(false);

  const verifyPausePin = React.useCallback(
    async (pin: string, onValid: () => void) => {
      if (pinVerifying) return;
      setPinVerifying(true);
      setPinError(false);
      try {
        const res: any = await api.verifyAgentWorkspacePausePin(pin);
        if (res?.success) {
          onValid();
          setPausePinInput('');
          return;
        }
      } catch (_) {
        // handled as invalid PIN below
      } finally {
        setPinVerifying(false);
      }
      setPinError(true);
      window.setTimeout(() => setPausePinInput(''), 400);
    },
    [pinVerifying]
  );

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (pauseOverlay?.step === 'timer') {
      interval = setInterval(() => {
        setPauseElapsed(Math.floor((Date.now() - pauseOverlay.startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [pauseOverlay]);

  // Estado hacia Redis / dialer: solo READY recibe marcación entrante/desde cola.
  // Con PIN pendiente enviamos PAUSE_PENDING (no READY, sin fila en reporte hasta confirmar).
  const detailedState = React.useMemo(() => {
    if (sipStatus === 'disconnected') return 'OFFLINE';
    if (callStatus === 'connected') return 'ON_CALL';
    if (callStatus === 'calling') return 'DIALING';
    if (isTipificarOpen) return 'WRAPUP';
    if (pauseOverlay?.isOpen && pauseOverlay.targetStateId) {
      if (pauseOverlay.step === 'request_pin') return 'PAUSE_PENDING';
      return String(pauseOverlay.targetStateId).toUpperCase();
    }
    return agentState.toUpperCase();
  }, [
    agentState,
    callStatus,
    isTipificarOpen,
    sipStatus,
    pauseOverlay?.isOpen,
    pauseOverlay?.step,
    pauseOverlay?.targetStateId,
  ]);

  // Keep latest state in a ref so reconnect/heartbeat handlers always read the freshest value
  const detailedStateRef = React.useRef(detailedState);
  React.useEffect(() => { detailedStateRef.current = detailedState; }, [detailedState]);

  const usernameRef = React.useRef<string>('AG');
  React.useEffect(() => {
    usernameRef.current = (session?.user as any)?.username || (session?.user as any)?.name || 'AG';
  }, [session]);

  const agentCampaignsRef = React.useRef<string[]>([]);
  React.useEffect(() => {
    agentCampaignsRef.current = agentCampaigns;
  }, [agentCampaigns]);

  // Broadcast state on every change
  React.useEffect(() => {
    localStorage.setItem('gescall_agentState', agentState);
    const username = (session?.user as any)?.username || (session?.user as any)?.name || 'AG';
    const campaignId = agentCampaigns[0] || undefined;
    socketService.updateAgentState(username, detailedState, campaignId);
  }, [detailedState, agentState, session, agentCampaigns]);

  // Ensure socket is connected and re-emit current state on (re)connection.
  // This prevents Redis from staying as OFFLINE after a reload/network blip
  // because the disconnect handler in the backend forces OFFLINE on disconnect.
  React.useEffect(() => {
    const sock = socketService.connect();
    const reEmit = () => {
      const cid = agentCampaignsRef.current[0] || undefined;
      socketService.updateAgentState(usernameRef.current, detailedStateRef.current, cid);
    };
    // On first connection
    if (sock?.connected) reEmit();
    sock?.on('connect', reEmit);
    sock?.on('reconnect', reEmit);
    return () => {
      sock?.off('connect', reEmit);
      sock?.off('reconnect', reEmit);
    };
  }, []);

  // Listen for call assignments from the predictive/progressive dispatcher.
  // When a call is bridged to this agent, auto-select the correct campaign for typification.
  React.useEffect(() => {
    const sock = socketService.connect();
    const handler = (data: any) => {
      if (data && data.username === usernameRef.current && data.campaign_id) {
        console.log('[AgentWorkspace] agent:call:assigned received — campaign:', data.campaign_id);
        setSelectedCampaignId(data.campaign_id);
        localStorage.setItem('gescall_last_call_campaign', data.campaign_id);

        const mergedVars: Record<string, string> = {};
        const pushVars = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          for (const [k, v] of Object.entries(obj)) {
            if (!k || v === null || v === undefined) continue;
            if (typeof v === 'object') continue;
            mergedVars[String(k)] = String(v);
          }
        };
        pushVars(data);
        pushVars(data.lead);
        pushVars(data.lead_data);
        pushVars(data.tts_vars);
        pushVars(data.form_data);
        setAssignedLeadVars(mergedVars);
        setCrmLeadDetail(null);
        const lid = data.lead_id != null ? String(data.lead_id).trim() : '';
        if (lid && lid !== '0') void loadAgentWorkspaceLead(lid);
      }
    };
    sock?.on('agent:call:assigned', handler);
    return () => {
      sock?.off('agent:call:assigned', handler);
    };
  }, [loadAgentWorkspaceLead]);

  // When typification modal opens, ensure campaign is set.
  // Falls back to localStorage (set by agent:call:assigned) or agent's first campaign.
  React.useEffect(() => {
    if (isTipificarOpen && !selectedCampaignId) {
      const stored = localStorage.getItem('gescall_last_call_campaign');
      if (stored && agentCampaigns.includes(stored)) {
        setSelectedCampaignId(stored);
      } else if (agentCampaigns.length > 0) {
        setSelectedCampaignId(agentCampaigns[0]);
      }
    }
  }, [isTipificarOpen]);

  // Load typifications once modal is open and campaign is resolved
  React.useEffect(() => {
    if (isTipificarOpen && selectedCampaignId) {
      loadTypifications();
    }
  }, [isTipificarOpen, selectedCampaignId]);

  // Heartbeat: re-broadcast state every 15s so Redis never expires/staling
  // and any stale OFFLINE caused by disconnect race conditions self-heals.
  React.useEffect(() => {
    const interval = setInterval(() => {
      const cid = agentCampaignsRef.current[0] || undefined;
      socketService.updateAgentState(usernameRef.current, detailedStateRef.current, cid);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (pauseOverlay) {
      localStorage.setItem('gescall_pauseOverlay', JSON.stringify(pauseOverlay));
    } else {
      localStorage.removeItem('gescall_pauseOverlay');
    }
  }, [pauseOverlay]);

  const prevCallStatusRef = React.useRef(callStatus);
  React.useEffect(() => {
    if (prevCallStatusRef.current === 'connected' && callStatus === 'idle') {
      setIsTipificarOpen(true);
    }
    prevCallStatusRef.current = callStatus;
  }, [callStatus]);

  const loadTypifications = async () => {
    const campId = selectedCampaignId || agentCampaigns[0];
    if (!campId) return;
    if (selectedCampaignId !== campId) setSelectedCampaignId(campId);
    setTypsLoading(true);
    try {
      const res = await api.getTypifications(campId);
      setTyps(res.data || []);
    } catch (e) {
      setTyps([]);
    } finally {
      setTypsLoading(false);
    }
  };

  const selectTyp = async (typId: number, typName: string) => {
    setSelectedTypId(typId);
    setSelectedTypification(typName);
    setFormData({});
    const typ = typs.find(t => t.id === typId);
    if (typ && typ.form_id) {
      try {
        const res = await api.getFormFields(selectedCampaignId, typ.form_id);
        setFormFields(res.data || []);
      } catch (e) {
        setFormFields([]);
      }
    } else {
      setFormFields([]);
      // If no form, save immediately
      submitTypification(typId);
    }
  };

  const submitTypification = async (typId?: number) => {
    const finalTypId = typId || selectedTypId;
    if (!finalTypId || !selectedCampaignId) return;
    setTypsSubmitting(true);
    try {
      await api.submitTypification({
        typification_id: finalTypId,
        campaign_id: selectedCampaignId,
        phone_number: callerId || phoneNumber,
        form_data: Object.keys(formData).length > 0 ? formData : undefined,
      });
    } catch (e: any) {
      console.error('Error submitting typification:', e);
    } finally {
      setTypsSubmitting(false);
      finishWrapup();
    }
  };

  const goBackToTypes = () => {
    setSelectedTypification('');
    setSelectedTypId(null);
    setFormFields([]);
    setFormData({});
  };

  // Auto-expand WebPhone when a call is coming in or connected
  React.useEffect(() => {
    if (sipStatus === 'calling' || sipStatus === 'incall') {
      setIsPhoneExpanded(true);
      setActiveApp('telefono');
      if (activeWidgets.includes('teleprompter')) {
        setIsTeleprompterVisible(true);
      }
    } else if (sipStatus === 'disconnected' || sipStatus === 'registered') {
      // Automatically hide the teleprompter when the call ends
      setIsTeleprompterVisible(false);
      setAssignedLeadVars({});
    }
  }, [sipStatus, activeWidgets]);

  // Simulated inbound call removed for real SIP integration


  const handleDigitClick = (digit: string) => {
    if (callStatus === 'idle') setPhoneNumber((prev) => prev + digit);
  };

  const handleDial = () => {
    if (!phoneNumber) return;
    makeCall(phoneNumber);
  };

  const handleHangup = () => {
    hangup();
    setIsTipificarOpen(true);
  };

  const finishWrapup = () => {
    setPhoneNumber('');
    setIsTipificarOpen(false);
    setIsPhoneExpanded(false);
    setShowContactCard(false);
    setSelectedTypification('');
    setSelectedTypId(null);
    setFormFields([]);
    setFormData({});
  };

  const dialpadDigits = [
    { num: '1', letters: '' }, { num: '2', letters: 'ABC' }, { num: '3', letters: 'DEF' },
    { num: '4', letters: 'GHI' }, { num: '5', letters: 'JKL' }, { num: '6', letters: 'MNO' },
    { num: '7', letters: 'PQRS' }, { num: '8', letters: 'TUV' }, { num: '9', letters: 'WXYZ' },
    { num: '*', letters: '' }, { num: '0', letters: '+' }, { num: '#', letters: '' }
  ];

  const renderWidgets = () => {
    const widgets = widgetOrder.map(widgetId => {
      if (!activeWidgets.includes(widgetId)) return null;

      switch (widgetId) {
          case 'metas':
            return (
              <GoalsWidget
                key="metas"
                goals={(workspaceDash?.goals ?? []) as AgentGoalRow[]}
                loading={workspaceDashLoading}
              />
            );
            
          case 'notas':
            return <StickyNotesWidget key="notas" />;
            
          case 'avisos':
            return (() => {
              const notice = workspaceDash?.notices?.[0];
              return (
              <div key="avisos" className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-lg p-4 text-white group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-200"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                    Aviso del Supervisor
                  </div>
                  {notice?.id !== undefined ? (
                  <button
                    type="button"
                    title="Ocultar aviso"
                    onClick={(e) => {
                      e.stopPropagation();
                      api.dismissAgentWorkspaceNotice(notice.id).then(() => reloadWorkspaceDashboard()).catch(() => {});
                    }}
                    className="text-white/50 hover:text-white opacity-70 group-hover:opacity-100 transition-opacity"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                  ) : (
                  <button type="button" className="text-white/40 cursor-default opacity-0 group-hover:opacity-80" aria-hidden>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                  )}
                </div>
                {workspaceDashLoading ? (
                  <p className="text-xs text-indigo-200/80 italic">Cargando aviso…</p>
                ) : notice ? (
                  <p className="text-xs text-indigo-100 leading-relaxed font-medium">{notice.body}</p>
                ) : (
                  <p className="text-xs text-indigo-100/70 leading-relaxed font-medium italic">No hay avisos activos del supervisor para tus campañas.</p>
                )}
              </div>
              );
            })();

          case 'teleprompter':
            return (
              <TeleprompterWidget 
                key="teleprompter"
                isVisible={isTeleprompterVisible}
                onToggleVisibility={() => setIsTeleprompterVisible(!isTeleprompterVisible)}
                settings={teleprompterSettings}
                onUpdateSetting={updateTeleprompterSetting}
              />
            );

          case 'calendario':
            return (
              <div key="calendario" className="bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-white/50 p-4 group">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
                    Callbacks Agendados
                  </div>
                </div>
                {workspaceDashLoading ? (
                  <p className="text-xs text-slate-400 italic">Cargando…</p>
                ) : !(workspaceDash?.callbacks?.length) ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No tienes callbacks agendados.</p>
                ) : (
                <div className="flex flex-col gap-2">
                  {workspaceDash.callbacks.slice(0, 6).map((cb) => {
                    const { label: dayLabel, timeShort } = formatWorkspaceCallbackSlot(cb.scheduled_at);
                    const isTodaySlot = dayLabel === 'Hoy';
                    const subtitle = (cb.notes || '').trim() || (cb.phone ? String(cb.phone) : 'Sin detalle');
                    return (
                    <div
                      key={cb.id}
                      className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${isTodaySlot ? 'bg-blue-50 border border-blue-100' : 'hover:bg-slate-50 border border-transparent'}`}
                    >
                      <div className={`flex flex-col items-center justify-center rounded-md w-10 h-10 shrink-0 ${isTodaySlot ? 'bg-white shadow-sm border border-slate-100' : 'bg-slate-100'}`}>
                        <span className={`text-[9px] font-bold uppercase leading-none mt-1 ${isTodaySlot ? 'text-red-500' : 'text-slate-400'}`}>{dayLabel}</span>
                        <span className={`text-sm font-black leading-none mb-1 ${isTodaySlot ? 'text-slate-700' : 'text-slate-600'}`}>{timeShort}</span>
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className={`text-xs font-bold ${isTodaySlot ? 'text-slate-800' : 'text-slate-600'}`}>{cb.contact_name}</span>
                        <span className="text-[10px] text-slate-500 truncate" title={subtitle}>{subtitle}</span>
                      </div>
                      <button
                        type="button"
                        title="Marcar como hecho"
                        onClick={() =>
                          api.completeAgentWorkspaceCallback(cb.id).then(() => reloadWorkspaceDashboard()).catch(() => {})
                        }
                        className="shrink-0 text-[10px] font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-md hover:bg-blue-100/80"
                      >
                        Hecho
                      </button>
                    </div>
                  );
                  })}
                </div>
                )}
              </div>
            );

          case 'ranking':
            return (() => {
              const top = (workspaceDash?.leaderboard ?? []).slice(0, 3);
              const rankStyle = (r: number) => {
                if (r === 1) return 'bg-white/10 border border-yellow-400/30 shadow-[0_0_10px_rgba(250,204,21,0.1)]';
                if (r === 2) return 'bg-white/5 border border-white/5';
                return 'bg-white/5 rounded-lg border border-transparent opacity-90';
              };
              const medal = (r: number) => {
                if (r === 1) return 'bg-yellow-400 text-yellow-900';
                if (r === 2) return 'bg-slate-300 text-slate-700';
                return 'bg-amber-600 text-white';
              };
              const nameCls = (isSelf: boolean) =>
                isSelf ? 'text-xs font-bold text-indigo-200 flex-1' : 'text-xs font-medium flex-1 text-slate-300';

              return (
              <div key="ranking" className="bg-slate-900 rounded-2xl shadow-lg border border-slate-800 p-4 text-white group">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                    Top 3 — Tipificaciones hoy
                  </div>
                </div>
                {workspaceDashLoading ? (
                  <p className="text-xs text-slate-400 italic">Cargando ranking…</p>
                ) : top.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">Sin tipificaciones hoy en tus campañas.</p>
                ) : (
                <div className="flex flex-col gap-2">
                  {top.map((row) => (
                    <div
                      key={row.rank + row.username}
                      className={`flex items-center gap-3 rounded-lg p-2 ${rankStyle(row.rank)}`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs ${medal(row.rank)}`}>{row.rank}</div>
                      <span className={nameCls(row.is_self)}>
                        {row.is_self ? `Tú (${agentUsername})` : row.username}
                      </span>
                      <span className={`text-xs font-black tabular-nums ${row.rank === 1 ? 'text-yellow-400' : row.is_self ? 'text-indigo-200' : 'text-slate-400'}`}>{row.score}</span>
                    </div>
                  ))}
                </div>
                )}
              </div>
              );
            })();

          default:
            return null;
        }
    }).filter(Boolean);

    widgets.push(
      <div 
        key="add-new-widget"
        onClick={() => setIsWidgetManagerOpen(true)}
        className="w-full shrink-0 flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 text-slate-400 hover:text-indigo-500 transition-colors group cursor-pointer shadow-sm mt-2 mb-4"
      >
        <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        </div>
        <span className="text-[13px] font-bold tracking-wide">Agregar nuevo widget</span>
      </div>
    );
    
    return widgets;
  };

  return (
    <div className="flex h-full gap-6 w-full p-2 relative">
      <audio ref={audioRef} autoPlay className="hidden" />
      {pauseOverlay?.isOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full flex flex-col items-center relative overflow-hidden">
            {pauseOverlay.step === 'request_pin' ? (
              <>
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">Autorizar Pausa</h2>
                <p className="text-slate-500 text-center mb-8">Por favor ingresa tu PIN de 4 dígitos para entrar en estado de <strong className="text-slate-700">{pauseOverlay.targetStateName}</strong>.</p>
                <input 
                  type="password" 
                  maxLength={4}
                  value={pausePinInput}
                  onChange={async (e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setPinError(false);
                    setPausePinInput(val);
                    if (val.length === 4) {
                      await verifyPausePin(val, () => {
                        setAgentState(pauseOverlay.targetStateId as any);
                        setPauseOverlay({ ...pauseOverlay, step: 'timer', startTime: Date.now() });
                        setPauseElapsed(0);
                      });
                    }
                  }}
                  disabled={pinVerifying}
                  className={`text-center text-4xl tracking-[1em] font-mono border-b-2 bg-slate-50 w-full py-4 rounded-xl outline-none transition-colors ${pinError ? 'border-red-500 text-red-500 bg-red-50' : 'border-indigo-200 focus:border-indigo-500 focus:bg-indigo-50/30 text-slate-800'}`}
                  placeholder="••••"
                  autoFocus
                />
                {pinVerifying && <p className="text-slate-500 text-sm mt-3 font-medium">Validando PIN...</p>}
                {pinError && !pinVerifying && <p className="text-red-500 text-sm mt-3 font-medium">PIN incorrecto. Intenta de nuevo.</p>}
                
                <button 
                  onClick={() => setPauseOverlay(null)}
                  className="mt-8 text-sm font-medium text-slate-400 hover:text-slate-600 underline underline-offset-4 transition-colors"
                >
                  Cancelar y regresar
                </button>
              </>
            ) : (
              <>
                <div className="absolute top-0 left-0 w-full h-2 bg-slate-100">
                  <div 
                    className={`h-full transition-all duration-1000 ${pauseElapsed > pauseOverlay.limitSeconds ? 'bg-red-500' : 'bg-green-500'}`} 
                    style={{ width: `${Math.min((pauseElapsed / pauseOverlay.limitSeconds) * 100, 100)}%` }}
                  ></div>
                </div>
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 mt-4 shadow-xl ${pauseElapsed > pauseOverlay.limitSeconds ? 'bg-red-50 text-red-500 shadow-red-100 animate-pulse' : 'bg-green-50 text-green-500 shadow-green-100'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">{pauseOverlay.targetStateName}</h2>
                <div className={`text-6xl font-light tabular-nums tracking-tight my-6 ${pauseElapsed > pauseOverlay.limitSeconds ? 'text-red-500 font-medium' : 'text-slate-800'}`}>
                  {String(Math.floor(pauseElapsed / 60)).padStart(2, '0')}:{String(pauseElapsed % 60).padStart(2, '0')}
                </div>
                {pauseElapsed > pauseOverlay.limitSeconds ? (
                  <p className="text-red-500 font-bold mb-8 px-4 py-2 bg-red-50 rounded-lg">¡Tiempo de pausa excedido!</p>
                ) : (
                  <p className="text-slate-500 mb-8">
                    Límite establecido: {pauseOverlay.limitSeconds < 60 ? `${pauseOverlay.limitSeconds} seg` : `${Math.floor(pauseOverlay.limitSeconds / 60)} min`}
                  </p>
                )}
                
                <div className="w-full bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <p className="text-sm font-bold text-slate-600 mb-4 text-center">INGRESA EL PIN PARA VOLVER A ESTAR DISPONIBLE</p>
                  <input 
                    type="password" 
                    maxLength={4}
                    value={pausePinInput}
                    onChange={async (e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setPinError(false);
                      setPausePinInput(val);
                      if (val.length === 4) {
                        await verifyPausePin(val, () => {
                          setAgentState('ready');
                          setPauseOverlay(null);
                        });
                      }
                    }}
                    disabled={pinVerifying}
                    className={`text-center text-3xl tracking-[0.8em] font-mono border-b-2 bg-white w-full py-3 rounded-lg outline-none transition-colors ${pinError ? 'border-red-500 text-red-500' : 'border-slate-300 focus:border-indigo-500 text-slate-800'}`}
                    placeholder="••••"
                  />
                  {pinVerifying && <p className="text-slate-500 text-sm mt-2 text-center font-medium">Validando PIN...</p>}
                  {pinError && !pinVerifying && <p className="text-red-500 text-sm mt-2 text-center font-medium">PIN incorrecto</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Left Column: Agent Context & Status */}
      <div className={`shrink-0 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-5 flex flex-col justify-between relative transition-all duration-300 ${isLeftSidebarOpen ? 'w-[280px]' : 'w-[88px] items-center'}`}>
        <button 
          onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
          className={`absolute top-4 ${isLeftSidebarOpen ? 'right-4' : 'right-1/2 translate-x-1/2'} w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-all z-10`}
          title={isLeftSidebarOpen ? "Ocultar panel lateral" : "Mostrar panel lateral"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${!isLeftSidebarOpen ? 'rotate-180' : ''}`}><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="w-full">
          {/* Shift Stats / Queue */}
          <h2 className={`text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 transition-all duration-300 ${isLeftSidebarOpen ? 'mb-4 opacity-100' : 'mb-6 opacity-0 h-0 overflow-hidden text-transparent select-none'}`}>
            Métricas de mi Turno
          </h2>
          <div className="flex flex-col gap-3 mb-6 w-full">
            <div className={`flex items-center p-3 rounded-lg bg-slate-50 border border-slate-100 transition-colors ${isLeftSidebarOpen ? 'justify-between' : 'justify-center cursor-pointer hover:bg-slate-100'}`} title={`Tiempo logueado en turno hoy (${formatShiftLogged(liveLoggedSeconds)})`}>
              <div className={`flex items-center gap-2 text-slate-600 font-medium ${isLeftSidebarOpen ? 'text-sm' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {isLeftSidebarOpen && "Tiempo Logueado"}
              </div>
              {isLeftSidebarOpen && (
                <span className="text-sm font-bold text-slate-800 tabular-nums">
                  {shiftMetricsHydrated ? formatShiftLogged(liveLoggedSeconds) : '—'}
                </span>
              )}
            </div>
            <div className={`flex items-center p-3 rounded-lg bg-slate-50 border border-slate-100 transition-colors ${isLeftSidebarOpen ? 'justify-between' : 'justify-center cursor-pointer hover:bg-slate-100'}`} title={`Llamadas donde participaste hoy (${callsTodayLive ?? '…'}): registros con tu usuario en tipificación o transferido`}
            >
              <div className={`flex items-center gap-2 text-slate-600 font-medium ${isLeftSidebarOpen ? 'text-sm' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                {isLeftSidebarOpen && "Llamadas Hoy"}
              </div>
              {isLeftSidebarOpen && (
                <span className="text-sm font-bold text-slate-800 tabular-nums">
                  {callsTodayLive === null ? '—' : callsTodayLive}
                </span>
              )}
            </div>
            <div className={`flex items-center p-3 rounded-lg bg-red-50 border border-red-100 transition-colors ${isLeftSidebarOpen ? 'justify-between' : 'justify-center relative cursor-pointer hover:bg-red-100'}`} title={`Prospectos en cola o pendientes (${queueDepthLive ?? '…'}): listas activas de tus campañas; si sin campaña, todas`}
            >
              <div className={`flex items-center gap-2 text-red-600 font-medium ${isLeftSidebarOpen ? 'text-sm' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2"/><rect width="18" height="18" x="3" y="4" rx="2"/><circle cx="12" cy="10" r="2"/><line x1="8" x2="8" y1="2" y2="4"/><line x1="16" x2="16" y1="2" y2="4"/></svg>
                {isLeftSidebarOpen && "Llamadas en Cola"}
              </div>
              {isLeftSidebarOpen ? (
                <span className={`text-sm font-black text-red-600 tabular-nums ${queueDepthLive !== null && queueDepthLive > 0 ? 'animate-pulse' : ''}`}>
                  {queueDepthLive === null ? '—' : queueDepthLive}
                </span>
              ) : (
                <div className={`absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold min-w-[1.25rem] px-1 h-5 flex items-center justify-center rounded-full shadow-md ${queueDepthLive !== null && queueDepthLive > 0 ? '' : 'opacity-70'}`}>
                  {queueDepthLive === null ? '—' : queueDepthLive}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* User Profile & Hidden Logout */}
        <div className={`pt-4 border-t border-slate-200 group relative w-full ${!isLeftSidebarOpen ? 'flex justify-center' : ''}`}>
          <div className={`flex items-center p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors ${isLeftSidebarOpen ? 'justify-between' : 'justify-center'}`} title="Cerrar sesión o ver perfil">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shadow-inner shrink-0">
                {((session?.user as any)?.username || (session?.user as any)?.name || 'AG').substring(0, 2).toUpperCase()}
              </div>
              {isLeftSidebarOpen && (
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-800 leading-tight">{agentUsername}</span>
                <span className="text-[10px] text-slate-500 uppercase">Extensión {sipExtension || 'N/A'}</span>
                {agentCampaignType && agentCampaignType !== 'BLASTER' && (
                  <span className={`text-[9px] font-bold uppercase mt-0.5 ${agentCampaignType === 'OUTBOUND_PREDICTIVE' ? 'text-blue-600 bg-blue-50 border-blue-200' : agentCampaignType === 'OUTBOUND_PROGRESSIVE' ? 'text-purple-600 bg-purple-50 border-purple-200' : 'text-green-600 bg-green-50 border-green-200'} px-1.5 py-0.5 rounded-full border inline-block w-fit`}>
                    {agentCampaignType === 'OUTBOUND_PREDICTIVE' ? 'Predictivo' : agentCampaignType === 'OUTBOUND_PROGRESSIVE' ? 'Progresivo' : agentCampaignType}
                  </span>
                )}
              </div>
              )}
            </div>
            {isLeftSidebarOpen && (
            <button className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            </button>
            )}
          </div>
          
          {/* Hidden Logout Menu (appears on hover of the profile section) */}
          <div className="absolute bottom-full left-0 w-full pb-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
            <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-1">
              <button 
                onClick={handleLogout}
                className={`w-full flex items-center gap-2 py-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium text-sm ${isLeftSidebarOpen ? 'px-4' : 'px-0 justify-center'}`}
                title="Cerrar Sesión"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                {isLeftSidebarOpen && "Cerrar Sesión"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Column: Customer 360 & Workspace */}
      <div className="flex-1 flex flex-col gap-4 h-full min-h-0">
        {/* Ficha de Contacto Panel */}
        {showContactCard && (
        <div className="flex-1 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 flex flex-col overflow-hidden p-6 min-h-0 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex justify-between items-center mb-6 pb-5 border-b border-slate-200/60">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              {crmSnapshot.headerTitle}
            </h2>
            <button 
              onClick={() => setIsTipificarOpen(true)}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm rounded-xl font-bold transition-all shadow-lg shadow-slate-200 hover:shadow-slate-300 hover:-translate-y-0.5 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
              Tipificar Llamada
            </button>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col pr-2 custom-scrollbar min-h-0">
            
            {/* Speech Teleprompter was here, moved to FloatingTeleprompter */}

            {/* Contact Profile Split Layout */}
            <div className="flex flex-col lg:flex-row gap-6 mb-8 items-stretch flex-1">
              
              {/* Left Column: Profile Snapshot */}
              <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4">
                <div className="bg-white rounded-[24px] border border-slate-200 p-6 flex flex-col items-center text-center shadow-sm relative overflow-hidden flex-1">
                  <div className="absolute top-0 left-0 w-full h-24 border-b border-slate-100/50" style={{ backgroundImage: `url(${corporateHeaderBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                    <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]"></div>
                  </div>
                  
                  <div className="w-20 h-20 rounded-full bg-white border-4 border-white shadow-md flex items-center justify-center text-slate-300 mb-4 z-10 relative mt-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  
                  <h3 className="text-xl font-black text-slate-800 leading-tight mb-1 relative z-10">{crmSnapshot.displayName}</h3>
                  <p className="text-[13px] font-semibold text-slate-400 mb-6 relative z-10">{crmSnapshot.subtitle}</p>

                  <div className="w-full flex flex-col gap-2.5 mt-auto">
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 rounded-2xl border border-slate-100/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado lead</span>
                      <span className="text-[11px] font-bold text-slate-700 px-2 py-1 rounded-lg border border-slate-200 bg-white max-w-[60%] truncate" title={crmSnapshot.leadStatus}>
                        {crmSnapshot.leadStatus}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 rounded-2xl border border-slate-100/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Extra</span>
                      <span className="text-[12px] font-bold text-slate-700 max-w-[65%] truncate text-right" title={crmSnapshot.extraLine}>
                        {crmSnapshot.extraLine}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 rounded-2xl border border-slate-100/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lista / campaña</span>
                      <span className="text-[12px] font-bold text-slate-700 max-w-[65%] truncate text-right" title={crmSnapshot.campaignIdRow ? `${crmSnapshot.listName} · ${crmSnapshot.campaignIdRow}` : crmSnapshot.listName}>
                        {crmSnapshot.campaignIdRow ? `${crmSnapshot.listName} · ${crmSnapshot.campaignIdRow}` : crmSnapshot.listName}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Interaction & Notes */}
              <div className="flex-1 flex flex-col gap-6">
                
                {/* Contact Channels Grid */}
                <div className="bg-white rounded-[24px] border border-slate-200 p-6 shadow-sm">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                     Canales de Contacto Directo
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    {crmSnapshot.phone ? (
                      <div 
                        onDoubleClick={() => makeCall(crmSnapshot.phone)}
                        className="bg-slate-50/60 rounded-[16px] border border-slate-200/60 p-4 shadow-sm flex items-center gap-4 group hover:border-indigo-300 hover:bg-white hover:shadow-md transition-all cursor-pointer"
                        title="Doble clic para marcar desde el softphone"
                      >
                        <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] font-bold text-slate-400">TELÉFONO PRINCIPAL</span>
                          <span className="text-[14px] font-bold text-slate-800 truncate" title={crmSnapshot.phone}>{crmSnapshot.phone}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="col-span-2 bg-slate-50/60 rounded-[16px] border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                        Sin número en la ficha. Si la llamada fue asignada por cola/IVR, debería aparecer al enlazar el lead.
                      </div>
                    )}
                    {crmSnapshot.altPhone ? (
                      <div 
                        onDoubleClick={() => makeCall(crmSnapshot.altPhone)}
                        className="bg-slate-50/60 rounded-[16px] border border-slate-200/60 p-4 shadow-sm flex items-center gap-4 group hover:border-emerald-300 hover:bg-white hover:shadow-md transition-all cursor-pointer"
                        title="Doble clic para marcar"
                      >
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] font-bold text-slate-400">TELÉFONO ALTERNATIVO</span>
                          <span className="text-[14px] font-bold text-slate-800 truncate" title={crmSnapshot.altPhone}>{crmSnapshot.altPhone}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Notes Block */}
                <div className="flex flex-col flex-1 min-h-[180px] group">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2 group-focus-within:text-slate-700 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                    Registro de Notas
                  </span>
                  <div className="relative flex-1 flex flex-col rounded-[24px] border border-slate-200 shadow-sm bg-white overflow-hidden focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
                    
                    {/* Notes History (Scrollable) */}
                    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 custom-scrollbar bg-slate-50/50">
                      {crmSnapshot.comments ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                              DB
                            </div>
                            <span className="text-[12px] font-bold text-slate-700">Comentario en lead</span>
                          </div>
                          <div className="ml-8 bg-white border border-slate-200/80 rounded-2xl rounded-tl-none p-3 shadow-sm relative">
                            <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">{crmSnapshot.comments}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-6">Sin comentarios guardados en el lead.</p>
                      )}
                    </div>

                    {/* New Note Input Area */}
                    <div className="bg-white border-t border-slate-100 flex flex-col shrink-0">
                      <div className="bg-slate-50/80 border-b border-slate-100 flex gap-1 px-4 py-2 shrink-0">
                        <button className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors" title="Negrita"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 12a4 4 0 0 0 0-8H6v8"/><path d="M15 20a4 4 0 0 0 0-8H6v8Z"/></svg></button>
                        <button className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors" title="Cursiva"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
                        <div className="w-px h-4 bg-slate-200 my-auto mx-2"></div>
                        <button className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors" title="Lista"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></button>
                      </div>
                      <div className="flex items-end p-3 gap-3">
                        <textarea 
                          className="w-full h-[50px] bg-transparent text-slate-800 text-[13px] resize-none outline-none placeholder:text-slate-400 font-medium leading-relaxed custom-scrollbar"
                          placeholder="Escribe una nueva nota..."
                        ></textarea>
                        <button className="w-9 h-9 shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-200 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
            
          </div>
        </div>
        )}

        {!showContactCard && (
          <div className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar pt-4 pb-6 px-4 animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-[22px] font-bold text-slate-800/80 mb-6 flex items-center gap-3 px-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
              Tu Espacio de Trabajo
            </h2>
            <div className="columns-1 lg:columns-2 xl:columns-3 gap-6 [&>*]:break-inside-avoid [&>*]:mb-6">
              {renderWidgets()}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: WebPhone & Widgets */}
      <div className="w-[320px] flex flex-col h-full relative">
        {/* iPhone WebPhone Container (Fixed) */}
        <div className="shrink-0 pt-2 z-40 flex justify-center mb-6">
          <div 
            className={`bg-[#0A0A0C] shadow-2xl relative overflow-hidden flex flex-col transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] mx-auto 
              ${isPhoneExpanded 
                ? 'w-[300px] h-[600px] rounded-[45px] border-[6px] border-slate-800' 
                : (callStatus !== 'idle' 
                    ? 'w-[280px] h-[64px] rounded-[32px] border-[2px] border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.3)] cursor-pointer hover:border-green-400' 
                    : (canManualDial 
                        ? 'w-[300px] h-[72px] rounded-[36px] border-[4px] border-slate-800 cursor-pointer hover:border-slate-700'
                        : 'w-[240px] h-[44px] rounded-[22px] border-[2px] border-slate-800 cursor-pointer hover:border-slate-700')
                  )
              }`}
            onClick={() => {
              if (!isPhoneExpanded) {
                setIsPhoneExpanded(true);
              }
            }}
            onWheel={(e) => {
              // Avoid contracting when scrolling inside scrollable apps
              if (['chat', 'historial', 'estado'].includes(activeApp)) return;
              
              if (e.deltaY > 0 && isPhoneExpanded) {
                setIsPhoneExpanded(false);
              } else if (e.deltaY < 0 && !isPhoneExpanded) {
                setIsPhoneExpanded(true);
              }
            }}
          >
            {!isPhoneExpanded && hasSupervisorUnread && (
              <>
                <div className="pointer-events-none absolute -inset-1 rounded-[40px] border border-cyan-400/60 animate-pulse"></div>
                <div className="pointer-events-none absolute -inset-2 rounded-[44px] border border-cyan-300/30 animate-pulse [animation-delay:220ms]"></div>
                <div className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-[#0A0A0C] flex items-center justify-center tabular-nums z-20">
                  {supervisorChatUnreadCount > 99 ? '99+' : supervisorChatUnreadCount}
                </div>
              </>
            )}

            {/* Compact Mini Phone Content (Fades out when expanded) */}
            <div className={`absolute inset-0 flex items-center justify-between px-4 transition-opacity duration-300 ${!isPhoneExpanded ? 'opacity-100 delay-200 z-10' : 'opacity-0 pointer-events-none z-0'}`}>
              {callStatus !== 'idle' ? (
                <div className="w-full flex items-center justify-between px-1">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center animate-pulse">
                       <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-white text-xs font-bold">{phoneNumber}</span>
                        <span className="text-green-400 text-[10px] font-mono">{callStatus === 'connected' ? '00:03' : 'Llamando...'}</span>
                     </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-end gap-0.5 h-3 mr-2">
                      <div className="w-0.5 h-1 bg-green-500 animate-pulse"></div>
                      <div className="w-0.5 h-2 bg-green-500 animate-pulse delay-75"></div>
                      <div className="w-0.5 h-3 bg-green-500 animate-pulse delay-150"></div>
                      <div className="w-0.5 h-1.5 bg-green-500 animate-pulse delay-300"></div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleHangup(); setIsPhoneExpanded(true); }} className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors shadow-md shadow-red-500/20" title="Colgar">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" x2="1" y1="1" y2="23"></line></svg>
                    </button>
                  </div>
                </div>
              ) : canManualDial ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#333333] rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                    </div>
                    <span className={`text-xl font-light tracking-widest ${phoneNumber ? 'text-white' : 'text-slate-500'}`}>
                      {phoneNumber || 'Marcar...'}
                    </span>
                  </div>
                  <button className="w-12 h-12 rounded-full flex items-center justify-center bg-[#34C759] shadow-lg shadow-green-900/20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  </button>
                </>
              ) : (
                <div className={`w-full flex items-center justify-center gap-2 ${sipStatus === 'registered' ? 'text-green-400' : sipStatus === 'disconnected' ? 'text-red-400' : 'text-slate-400'}`}>
                  <div className="relative flex items-center justify-center w-3 h-3">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 ${sipStatus === 'registered' ? 'bg-green-500' : sipStatus === 'disconnected' ? 'bg-red-500' : 'bg-slate-500'}`}></span>
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${sipStatus === 'registered' ? 'bg-green-400' : sipStatus === 'disconnected' ? 'bg-red-400' : 'bg-slate-400'}`}></span>
                  </div>
                  <span className="text-xs font-medium tracking-wide">
                    {sipStatus === 'registered' ? 'Disponible' : 
                     sipStatus === 'disconnected' ? 'Desconectado' : 
                     sipStatus === 'connecting' ? 'Conectando...' : 
                     'Esperando...'}
                  </span>
                </div>
              )}
            </div>

            {/* Full iPhone Content (Fades in when expanded) */}
            <div className={`absolute inset-0 flex flex-col p-4 transition-opacity duration-300 ${isPhoneExpanded ? 'opacity-100 delay-200 z-10' : 'opacity-0 pointer-events-none z-0'}`}>
              
            {/* Dynamic Island glow effect & Collapse button */}
            {callStatus !== 'idle' ? (
              <div 
                className="absolute top-4 left-1/2 -translate-x-1/2 w-44 h-8 bg-black border border-green-500/30 rounded-full z-20 flex justify-between items-center pl-3 pr-1 shadow-[0_0_15px_rgba(34,197,94,0.3)] cursor-pointer group"
                onClick={(e) => { e.stopPropagation(); setIsPhoneExpanded(false); }}
                title="Contraer"
              >
                 <div className="flex items-center gap-1.5">
                   <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                   </div>
                   {callStatus === 'connected' && (
                     <div className="flex gap-0.5">
                        <div className="w-1 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <div className="w-1 h-2 bg-green-500 rounded-full animate-pulse delay-75"></div>
                        <div className="w-1 h-2.5 bg-green-500 rounded-full animate-pulse delay-150"></div>
                     </div>
                   )}
                 </div>
                 <span className="text-green-500 text-xs font-bold font-mono">{callStatus === 'calling' ? 'Calling' : '00:03'}</span>
                 
                 <div className="w-6 h-6 rounded-full flex items-center justify-center text-green-500/50 group-hover:bg-green-500/20 group-hover:text-green-500 transition-colors">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                 </div>
              </div>
            ) : (
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 h-6 bg-black rounded-b-xl z-20 flex justify-center items-center px-4 cursor-pointer group"
                onClick={(e) => { e.stopPropagation(); setIsPhoneExpanded(false); }}
                title="Contraer"
              >
                 <div className="w-8 h-1.5 bg-slate-800 rounded-full mr-3"></div>
                 <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 group-hover:text-slate-400 transition-colors"><path d="m18 15-6-6-6 6"/></svg>
              </div>
            )}

            {/* Display / Input for Idle state */}
            {callStatus === 'idle' ? (
              activeApp === 'home' ? (
                <>
                  {/* iPhone Apps Grid */}
                  <div className="w-full pt-14 px-3 grid grid-cols-4 gap-y-6 justify-items-center">
                    {/* App: Estado del Agente */}
                    <div 
                      className="relative flex flex-col items-center gap-1.5 group cursor-pointer"
                      onClick={() => setActiveApp('estado')}
                    >
                      <div className={`w-[52px] h-[52px] rounded-[14px] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform group-active:scale-95 ${agentState === 'ready' ? 'bg-gradient-to-b from-[#32D74B] to-[#28CD41]' : 'bg-gradient-to-b from-[#FF9F0A] to-[#FF8A00]'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                      </div>
                      <span className="text-[11px] text-white font-medium tracking-wide drop-shadow-md">Estado</span>
                    </div>

                    {/* App: Teléfono */}
                    <div 
                      className="relative flex flex-col items-center gap-1.5 group cursor-pointer"
                      onClick={() => setActiveApp('telefono')}
                    >
                      <div className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform group-active:scale-95 bg-gradient-to-b from-[#32D74B] to-[#28CD41]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                      </div>
                      <span className="text-[11px] text-white font-medium tracking-wide drop-shadow-md">Teléfono</span>
                    </div>

                    {/* App: Historial */}
                    <div 
                      className="relative flex flex-col items-center gap-1.5 group cursor-pointer"
                      onClick={() => setActiveApp('historial')}
                    >
                      <div className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform group-active:scale-95 bg-gradient-to-b from-[#0A84FF] to-[#006EE6]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </div>
                      <span className="text-[11px] text-white font-medium tracking-wide drop-shadow-md">Historial</span>
                    </div>

                    {/* App: Chat Interno */}
                    <div 
                      className="relative flex flex-col items-center gap-1.5 group cursor-pointer"
                      onClick={() => setActiveApp('chat')}
                    >
                      <div className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform group-active:scale-95 bg-gradient-to-b from-[#34C759] to-[#248A3D] relative">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        {supervisorChatUnreadCount > 0 && (
                          <div className="absolute -top-1 -right-1 min-w-[20px] h-5 px-0.5 bg-red-500 rounded-full border-2 border-[#0A0A0C] flex items-center justify-center">
                            <span className="text-[10px] font-bold text-white tabular-nums">
                              {supervisorChatUnreadCount > 99 ? '99+' : supervisorChatUnreadCount}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] text-white font-medium tracking-wide drop-shadow-md">Chat</span>
                    </div>
                  </div>
                </>
              ) : activeApp === 'telefono' ? (
                /* iOS Phone App View (Dialpad) */
                <div className="absolute inset-0 bg-[#0A0A0C] z-30 flex flex-col rounded-[39px] overflow-hidden">
                  <div className="pt-12 pb-2 px-4 flex items-center relative shrink-0">
                    <button 
                      onClick={() => setActiveApp('home')}
                      className="absolute left-4 flex items-center text-green-500 hover:opacity-70 transition-opacity"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                      <span className="text-[17px]">Inicio</span>
                    </button>
                  </div>
                  <div className="w-full flex-1 flex flex-col justify-end pb-4 relative">
                    <input 
                      type="text" 
                      value={phoneNumber}
                      className="w-full bg-transparent text-center text-4xl font-light text-white focus:outline-none tracking-widest h-10"
                      readOnly
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-4 w-full mb-8 px-4">
                    {dialpadDigits.map((item, idx) => (
                      <button key={idx} onClick={() => handleDigitClick(item.num)} className="w-16 h-16 rounded-full flex flex-col items-center justify-center bg-[#333333] hover:bg-[#444444] active:bg-[#555555] transition-colors mx-auto">
                        <span className={`text-3xl font-light text-white leading-none ${item.num === '*' ? 'mt-2' : ''}`}>{item.num}</span>
                        {item.letters && <span className="text-[9px] font-bold tracking-widest text-slate-400 leading-none mt-0.5">{item.letters}</span>}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-center w-full px-4 mb-8">
                    <button onClick={handleDial} className="w-16 h-16 rounded-full flex items-center justify-center bg-[#34C759] hover:bg-[#30B753] mx-auto shadow-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    </button>
                  </div>
                </div>
              ) : activeApp === 'estado' ? (
                /* iOS Settings-style App View for Agent State */
                <div className="absolute inset-0 bg-[#f2f2f7] z-30 flex flex-col rounded-[39px] overflow-hidden">
                  {/* iOS App Header */}
                  <div className="pt-12 pb-3 px-4 bg-[#f2f2f7] border-b border-slate-300 flex items-center relative shrink-0">
                    <button 
                      onClick={() => setActiveApp('home')}
                      className="absolute left-4 flex items-center text-[#007aff] hover:opacity-70 transition-opacity"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                      <span className="text-[17px]">Atrás</span>
                    </button>
                    <h2 className="text-[17px] font-semibold text-black mx-auto">Estado</h2>
                  </div>
                  
                  {/* iOS List Content */}
                  <div className="flex-1 overflow-y-auto px-4 py-6">
                    <h3 className="text-[13px] uppercase text-slate-500 font-medium ml-4 mb-2 tracking-wide">Disponibilidad</h3>
                    <div className="bg-white rounded-xl overflow-hidden mb-6">
                      <div 
                        className="flex items-center justify-between p-4 border-b border-slate-100 active:bg-slate-50 cursor-pointer"
                        onClick={() => { setAgentState('ready'); setActiveApp('home'); }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-md bg-[#34C759] flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                          </div>
                          <span className="text-[17px] text-black">Disponible (Ready)</span>
                        </div>
                        {agentState === 'ready' && <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                      </div>
                      <div 
                        className="flex items-center justify-between p-4 active:bg-slate-50 cursor-pointer"
                        onClick={() => {
                          const config = PAUSE_CONFIG['not_ready'];
                          if (!config?.enabled) return;
                          setPauseOverlay({ isOpen: true, step: 'request_pin', targetStateId: 'not_ready', targetStateName: config.name, limitSeconds: config.limit, startTime: 0 });
                          setPausePinInput('');
                          setPinError(false);
                          setActiveApp('home');
                          setIsPhoneExpanded(false);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-md bg-[#FF3B30] flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                          </div>
                          <span className="text-[17px] text-black">No Disponible</span>
                        </div>
                        {agentState === 'not_ready' && <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                      </div>
                    </div>

                    <h3 className="text-[13px] uppercase text-slate-500 font-medium ml-4 mb-2 tracking-wide">Pausas Auxiliares</h3>
                    <div className="bg-white rounded-xl overflow-hidden">
                      {AUX_PAUSES.map((pausa, idx, arr) => (
                        <div 
                          key={pausa.id}
                          className={`flex items-center justify-between p-4 active:bg-slate-50 cursor-pointer ${idx !== arr.length - 1 ? 'border-b border-slate-100' : ''}`}
                          onClick={() => {
                            const config = PAUSE_CONFIG[pausa.id];
                            if (!config?.enabled) return;
                            setPauseOverlay({ isOpen: true, step: 'request_pin', targetStateId: pausa.id, targetStateName: config.name, limitSeconds: config.limit, startTime: 0 });
                            setPausePinInput('');
                            setPinError(false);
                            setActiveApp('home');
                            setIsPhoneExpanded(false);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-md bg-[#FF9500] flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={pausa.icon}/></svg>
                            </div>
                            <span className="text-[17px] text-black">{pausa.label}</span>
                          </div>
                          {agentState === pausa.id && <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                        </div>
                      ))}
                      {AUX_PAUSES.length === 0 && (
                        <div className="p-4 text-xs text-slate-400">No hay pausas auxiliares habilitadas en esta campaña.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : activeApp === 'historial' ? (
                /* iOS Historial App View */
                <div className="absolute inset-0 bg-white z-30 flex flex-col rounded-[39px] overflow-hidden">
                  <div className="pt-12 pb-2 px-4 flex items-center border-b border-slate-100 relative shrink-0">
                    <button 
                      onClick={() => setActiveApp('home')}
                      className="absolute left-4 flex items-center text-[#007aff] hover:opacity-70 transition-opacity"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                      <span className="text-[17px]">Atrás</span>
                    </button>
                    <h2 className="text-[17px] font-semibold text-black mx-auto">Recientes</h2>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
                    {/* Dummy History Items */}
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0">
                        <div className="flex flex-col">
                          <span className={`text-[17px] font-medium ${i % 2 === 0 ? 'text-red-500' : 'text-black'}`}>
                            {i % 2 === 0 ? '+52 55 1234 5678' : 'Carlos Mendoza'}
                          </span>
                          <span className="text-[13px] text-slate-500">Móvil</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="text-[15px]">{i === 1 ? '10:45' : i === 2 ? 'Ayer' : 'Lunes'}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeApp === 'chat' ? (
                /* iOS Chat App View */
                <div className="absolute inset-0 bg-[#F2F2F7] z-30 flex flex-col rounded-[39px] overflow-hidden">
                  <div className="pt-12 pb-2 px-4 flex items-center bg-white/80 backdrop-blur-md border-b border-slate-200 relative shrink-0 z-10">
                    <button 
                      onClick={() => setActiveApp('home')}
                      className="absolute left-4 flex items-center text-[#007aff] hover:opacity-70 transition-opacity"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                      <span className="text-[17px] ml-0.5">Atrás</span>
                    </button>
                    <div className="flex flex-col items-center mx-auto">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center mb-0.5">
                        <span className="text-xs font-semibold text-slate-500">Sup</span>
                      </div>
                      <h2 className="text-[11px] font-semibold text-black">Supervisor</h2>
                      <div className="flex items-center gap-1">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${isSupervisorOnline ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                        <span className="text-[10px] text-slate-500">{isSupervisorOnline ? 'en linea' : 'desconectado'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 custom-scrollbar relative">
                    {!activeChatCampaignId ? (
                      <div className="my-auto text-center text-xs text-slate-400">
                        No tienes una campaña activa para abrir el chat.
                      </div>
                    ) : chatLoading ? (
                      <div className="my-auto text-center text-xs text-slate-400">Cargando chat…</div>
                    ) : chatMessages.length === 0 ? (
                      <div className="my-auto text-center text-xs text-slate-400">
                        Aun no hay mensajes con tu supervisor.
                      </div>
                    ) : (
                      chatMessages.map((msg) => {
                        const mine = msg.sender_role === 'AGENT';
                        return (
                          <div
                            key={msg.id}
                            className={`${mine ? 'self-end bg-[#007aff] text-white rounded-br-sm' : 'self-start bg-white text-black rounded-bl-sm border border-slate-200'} text-[15px] px-3.5 py-2 rounded-2xl max-w-[85%] shadow-sm`}
                            title={`${msg.sender_username} · ${new Date(msg.created_at).toLocaleString()}`}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                            <p className={`mt-1 text-[10px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                  
                  <div className="p-3 bg-[#F2F2F7] border-t border-slate-200 shrink-0 flex items-end gap-2 relative z-10 pb-8">
                    <div className="flex-1 bg-white border border-slate-300 rounded-2xl min-h-[36px] flex items-center px-3 shadow-sm">
                      <input
                        type="text"
                        placeholder="Escribe un mensaje"
                        className="w-full text-[15px] bg-transparent outline-none py-1.5 text-black"
                        value={chatDraft}
                        onChange={(e) => setChatDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            sendChatMessage();
                          }
                        }}
                        disabled={!activeChatCampaignId || chatSending}
                      />
                    </div>
                    <button
                      className="w-9 h-9 rounded-full bg-[#007aff] flex items-center justify-center shrink-0 disabled:opacity-40"
                      onClick={sendChatMessage}
                      disabled={!activeChatCampaignId || !chatDraft.trim() || chatSending}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="translate-x-[-1px] translate-y-[1px]"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                    </button>
                  </div>
                </div>
              ) : null
            ) : (
              /* Active Call Screen */
              <>
                <div className="w-full mt-24 flex flex-col items-center">
                   {/* Nice gradient avatar with pulse effect */}
                   <div className="relative mb-6">
                     <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20"></div>
                     <div className="relative w-24 h-24 bg-gradient-to-tr from-slate-700 to-slate-800 rounded-full flex items-center justify-center shadow-2xl border border-slate-600/50">
                       <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                     </div>
                   </div>
                   <h2 className="text-[32px] font-extralight text-white mb-2 text-center px-2 line-clamp-2">{crmSnapshot.displayName}</h2>
                   <p className="text-base text-slate-400 font-light tracking-[0.08em] text-center truncate max-w-[90%]">{crmSnapshot.phone || callerId || phoneNumber || '—'}</p>
                </div>

                <div className="flex justify-center gap-5 w-full mt-auto mb-10 px-4">
                   <div className="flex flex-col items-center gap-2.5">
                     <button className="w-16 h-16 rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all">
                       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                     </button>
                     <span className="text-[11px] font-medium text-slate-300">silenciar</span>
                   </div>
                   <div className="flex flex-col items-center gap-2.5">
                     <button className="w-16 h-16 rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all">
                       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                     </button>
                     <span className="text-[11px] font-medium text-slate-300">espera</span>
                   </div>
                   <div className="flex flex-col items-center gap-2.5">
                     <button className="w-16 h-16 rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all">
                       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"></path><path d="M21 3 9 15"></path><path d="M15 21H3V9"></path></svg>
                     </button>
                     <span className="text-[11px] font-medium text-slate-300">transferir</span>
                   </div>
                </div>
                
                <div className="flex justify-center w-full mb-12">
                  <button onClick={handleHangup} className="w-[72px] h-[72px] rounded-full bg-gradient-to-b from-[#FF453A] to-[#D70015] hover:from-[#FF5E55] hover:to-[#FF3B30] flex items-center justify-center shadow-[0_10px_20px_rgba(215,0,21,0.4)] transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{transform: "rotate(135deg)"}}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  </button>
                </div>
              </>
            )}
            
            {/* Home Indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-600 rounded-full"></div>
            </div>
          </div>
        </div>



        {/* Widgets Panel (Scrollable) */}
        {showContactCard && (
          <AnimatedList displayScrollbar={false} className="animate-in fade-in slide-in-from-right-8 duration-300">
            {renderWidgets()}
          </AnimatedList>
        )}
      </div>

      {/* Tipificar Modal */}
      {isTipificarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsTipificarOpen(false)}></div>
          <div className="relative bg-white w-[750px] h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 p-6 z-10 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center mb-5 pb-4 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                Tipificar Interacción
              </h3>
              <button onClick={() => setIsTipificarOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            {/* Body — no campaign selector; system already knows from dispatched call */}
            <div className="flex-1 overflow-y-auto pr-3 -mr-3 custom-scrollbar flex flex-col">
              {typsLoading ? (
                <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Cargando tipificaciones...</div>
              ) : selectedTypification === '' ? (
                typs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-300"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                    <p>No hay tipificaciones configuradas para esta campaña.</p>
                    {!selectedCampaignId && agentCampaigns.length === 0 && <p className="text-[10px]">Contacta al administrador para configurarlas.</p>}
                    {selectedCampaignId && <button onClick={loadTypifications} className="text-indigo-500 underline text-xs">Reintentar</button>}
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-300 my-auto py-8">
                    {['Contactado', 'No Contactado'].map(cat => {
                      const items = typs.filter((t: any) => t.category === cat && t.active);
                      if (items.length === 0) return null;
                      const isContactado = cat === 'Contactado';
                      return (
                        <div key={cat} className="mb-8">
                          <h4 className={`text-sm font-bold uppercase tracking-wider mb-5 flex items-center gap-2 ${isContactado ? 'text-emerald-600' : 'text-rose-600'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              {isContactado
                                ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
                                : <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>
                              }
                            </svg>
                            {cat}
                          </h4>
                          <div className="grid grid-cols-2 gap-3">
                            {items.map((typ: any) => (
                              <button
                                key={typ.id}
                                onDoubleClick={() => selectTyp(typ.id, typ.name)}
                                className={`px-4 py-3 text-sm font-semibold rounded-lg border text-left transition-all bg-white border-slate-200 text-slate-600 select-none ${isContactado ? 'hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700' : 'hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700'}`}
                              >
                                {typ.name}
                                {typ.form_name && <span className="block text-[10px] text-slate-400 font-normal mt-0.5">Formulario: {typ.form_name}</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="animate-in slide-in-from-right-4 fade-in duration-300 pb-4">
                  <button onClick={goBackToTypes} className="mb-4 text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-colors px-2 py-1 -ml-2 rounded-md hover:bg-slate-50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    Volver a resultados
                  </button>

                  {formFields.length > 0 && (
                    <div className="bg-indigo-50/30 rounded-xl p-5 border border-indigo-100 shadow-sm">
                      <h4 className="text-sm font-black text-indigo-700 uppercase tracking-wider mb-6 flex items-center gap-2 border-b border-indigo-100 pb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        Formulario: {selectedTypification}
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        {formFields.map((field: any) => (
                          <div key={field.id} className={field.field_type === 'textarea' ? 'col-span-2' : ''}>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">
                              {field.field_label}
                              {field.is_required && <span className="text-red-500 ml-0.5">*</span>}
                            </label>
                            {field.field_type === 'select' ? (
                              <select
                                className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                value={formData[field.field_name] || ''}
                                onChange={e => setFormData({ ...formData, [field.field_name]: e.target.value })}
                              >
                                <option value="">Seleccionar...</option>
                                {(field.options || []).map((opt: any) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            ) : field.field_type === 'textarea' ? (
                              <textarea
                                className="w-full h-20 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                                value={formData[field.field_name] || ''}
                                onChange={e => setFormData({ ...formData, [field.field_name]: e.target.value })}
                              />
                            ) : (
                              <input
                                type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'}
                                className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                value={formData[field.field_name] || ''}
                                onChange={e => setFormData({ ...formData, [field.field_name]: e.target.value })}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {formFields.length === 0 && selectedTypId && (
                    <div className="text-center py-10 text-slate-400 text-sm">Esta tipificación no requiere formulario adicional.</div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 mt-auto pt-5 border-t border-slate-100 flex justify-end gap-3 bg-white">
              <button
                onClick={() => setIsTipificarOpen(false)}
                className="px-5 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              {selectedTypification !== '' && (
                <button
                  onClick={() => submitTypification()}
                  disabled={typsSubmitting}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-all shadow-md shadow-indigo-200 flex items-center gap-2 disabled:opacity-50"
                >
                  {typsSubmitting ? (
                    <><svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Guardando...</>
                  ) : (
                    <><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Guardar Gestión</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isWidgetManagerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsWidgetManagerOpen(false)}></div>
          <div className="relative bg-white w-[450px] rounded-2xl shadow-2xl border border-slate-200 p-6 z-10 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-5 pb-4 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                Personalizar Widgets
              </h3>
              <button onClick={() => setIsWidgetManagerOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {widgetOrder.map((widgetId, index) => {
                const widget = AVAILABLE_WIDGETS.find(w => w.id === widgetId);
                if (!widget) return null;
                return (
                  <div key={widget.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5 mr-1">
                        <button 
                          onClick={() => moveWidgetUp(index)} 
                          disabled={index === 0}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                        </button>
                        <button 
                          onClick={() => moveWidgetDown(index)} 
                          disabled={index === widgetOrder.length - 1}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={widget.color}>
                        {widget.icon}
                      </svg>
                      <span className="text-sm font-semibold text-slate-700">{widget.label}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={activeWidgets.includes(widget.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setActiveWidgets([...activeWidgets, widget.id]);
                          } else {
                            setActiveWidgets(activeWidgets.filter(id => id !== widget.id));
                          }
                        }}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button 
                onClick={() => setIsWidgetManagerOpen(false)}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold transition-all shadow-md flex items-center gap-2"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Teleprompter */}
      <FloatingTeleprompter 
        isOpen={isTeleprompterVisible} 
        onClose={() => setIsTeleprompterVisible(false)}
        autoPlay={true}
        scriptSegments={teleprompterSegments}
        allowDefaultFallback={false}
        settings={teleprompterSettings}
        onUpdateSetting={updateTeleprompterSetting}
      />
    </div>
  );
};
