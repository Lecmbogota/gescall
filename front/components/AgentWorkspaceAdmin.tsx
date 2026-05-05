import React, { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import socketService from '../services/socket';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

type NoticeRow = {
  id: number;
  body: string;
  campaign_id: string | null;
  campaign_name?: string | null;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  created_by_username?: string | null;
};

type CallbackRow = {
  id: number;
  assignee_user_id: number;
  assignee_username?: string | null;
  campaign_id: string | null;
  campaign_name?: string | null;
  contact_name: string;
  phone: string | null;
  scheduled_at: string;
  notes: string | null;
  status: string;
  created_at: string;
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

interface AgentWorkspaceAdminProps {
  username: string;
}

export function AgentWorkspaceAdmin({ username }: AgentWorkspaceAdminProps) {
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [callbacks, setCallbacks] = useState<CallbackRow[]>([]);
  const [loadingNotices, setLoadingNotices] = useState(true);
  const [loadingCallbacks, setLoadingCallbacks] = useState(true);
  const [savingNotice, setSavingNotice] = useState(false);
  const [savingCallback, setSavingCallback] = useState(false);
  const [campaigns, setCampaigns] = useState<Array<{ campaign_id: string; campaign_name: string }>>([]);
  const [users, setUsers] = useState<Array<{ user_id: number; username: string }>>([]);

  const [noticeBody, setNoticeBody] = useState('');
  const [noticeCampaignId, setNoticeCampaignId] = useState('');
  const [noticeEndsAt, setNoticeEndsAt] = useState('');

  const [cbAssignee, setCbAssignee] = useState('');
  const [cbContact, setCbContact] = useState('');
  const [cbPhone, setCbPhone] = useState('');
  const [cbWhen, setCbWhen] = useState('');
  const [cbCampaign, setCbCampaign] = useState('');
  const [cbNotes, setCbNotes] = useState('');
  const [chatCampaignId, setChatCampaignId] = useState('');
  const [chatAgentUsername, setChatAgentUsername] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessageRow[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const chatScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [isAgentOnline, setIsAgentOnline] = useState(false);
  const [isChatWidgetOpen, setIsChatWidgetOpen] = useState(false);
  const [chatLastReadAgentId, setChatLastReadAgentId] = useState(0);

  const loadNotices = useCallback(async () => {
    try {
      setLoadingNotices(true);
      const res: any = await api.listAgentWorkspaceNoticesAdmin();
      if (res.success && Array.isArray(res.data)) setNotices(res.data);
      else setNotices([]);
    } catch {
      setNotices([]);
      toast.error('No se pudieron cargar los avisos');
    } finally {
      setLoadingNotices(false);
    }
  }, []);

  const loadCallbacks = useCallback(async () => {
    try {
      setLoadingCallbacks(true);
      const res: any = await api.listAgentWorkspaceCallbacksAdmin('ALL');
      if (res.success && Array.isArray(res.data)) setCallbacks(res.data);
      else setCallbacks([]);
    } catch {
      setCallbacks([]);
      toast.error('No se pudieron cargar los callbacks');
    } finally {
      setLoadingCallbacks(false);
    }
  }, []);

  const loadChatMessages = useCallback(async () => {
    if (!chatCampaignId || !chatAgentUsername) {
      setChatMessages([]);
      return;
    }
    try {
      setChatLoading(true);
      const res: any = await api.listAgentWorkspaceChatMessages({
        campaign_id: chatCampaignId,
        agent_username: chatAgentUsername,
      });
      if (res?.success && Array.isArray(res.data)) setChatMessages(res.data);
      else setChatMessages([]);
    } catch {
      setChatMessages([]);
    } finally {
      setChatLoading(false);
    }
  }, [chatCampaignId, chatAgentUsername]);

  useEffect(() => {
    loadNotices();
    loadCallbacks();
  }, [loadNotices, loadCallbacks]);

  useEffect(() => {
    (async () => {
      try {
        const [cRes, uRes]: any[] = await Promise.all([api.getCampaigns({}), api.get('/users')]);
        if (cRes?.success && Array.isArray(cRes.data)) {
          const mappedCampaigns = cRes.data.map((c: any) => ({
            campaign_id: c.campaign_id,
            campaign_name: c.campaign_name || c.campaign_id,
          }));
          setCampaigns(mappedCampaigns);
          if (!chatCampaignId && mappedCampaigns.length > 0) {
            setChatCampaignId(mappedCampaigns[0].campaign_id);
          }
        }
        if (uRes?.success && Array.isArray(uRes.data)) {
          const mappedUsers = uRes.data
            .filter((u: any) => u.active)
            .map((u: any) => ({ user_id: u.user_id, username: u.username }));
          setUsers(mappedUsers);
          if (!chatAgentUsername && mappedUsers.length > 0) {
            setChatAgentUsername(mappedUsers[0].username);
          }
        }
      } catch {
        /* ignore — forms still work partially */
      }
    })();
  }, [chatAgentUsername, chatCampaignId]);

  useEffect(() => {
    socketService.connect();
    const onRefresh = () => {
      loadNotices();
      loadCallbacks();
    };
    socketService.on('agent:workspace:refresh', onRefresh);
    return () => socketService.off('agent:workspace:refresh', onRefresh);
  }, [loadNotices, loadCallbacks]);

  useEffect(() => {
    loadChatMessages();
  }, [loadChatMessages]);

  useEffect(() => {
    if (!chatCampaignId || !chatAgentUsername) return;
    socketService.connect();
    const onMessage = (payload: ChatMessageRow) => {
      if (!payload) return;
      if (payload.campaign_id !== chatCampaignId) return;
      if (payload.agent_username !== chatAgentUsername) return;
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) return prev;
        return [...prev, payload];
      });
    };
    const onPresence = (presence: any) => {
      if (!presence || typeof presence.agent_online !== 'boolean') return;
      const expectedRoom = `agent-workspace-chat:${chatCampaignId}:${chatAgentUsername}`;
      if (presence.room !== expectedRoom) return;
      setIsAgentOnline(Boolean(presence.agent_online));
    };
    socketService.subscribeAgentWorkspaceChat(chatCampaignId, chatAgentUsername, onMessage, {
      participantRole: 'SUPERVISOR',
      participantUsername: username,
    });
    socketService.onAgentWorkspaceChatPresence(onPresence);
    return () => {
      socketService.unsubscribeAgentWorkspaceChat(chatCampaignId, chatAgentUsername, onMessage);
      socketService.offAgentWorkspaceChatPresence(onPresence);
      setIsAgentOnline(false);
    };
  }, [chatCampaignId, chatAgentUsername, username]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatLoading, chatCampaignId, chatAgentUsername, isChatWidgetOpen]);

  const chatReadStorageKey =
    chatCampaignId && chatAgentUsername
      ? `gescall_sup_chat_read_agent:${username}:${chatCampaignId}:${chatAgentUsername}`
      : '';

  useEffect(() => {
    if (!chatReadStorageKey) {
      setChatLastReadAgentId(0);
      return;
    }
    try {
      const stored = parseInt(localStorage.getItem(chatReadStorageKey) || '0', 10);
      setChatLastReadAgentId(Number.isFinite(stored) ? stored : 0);
    } catch {
      setChatLastReadAgentId(0);
    }
  }, [chatReadStorageKey]);

  useEffect(() => {
    if (!isChatWidgetOpen || !chatReadStorageKey) return;
    const maxAgentId = chatMessages
      .filter((m) => m.sender_role === 'AGENT')
      .reduce((acc, m) => Math.max(acc, m.id), 0);
    if (maxAgentId <= 0) return;
    setChatLastReadAgentId((prev) => {
      const next = Math.max(prev, maxAgentId);
      if (next > prev) {
        try {
          localStorage.setItem(chatReadStorageKey, String(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, [isChatWidgetOpen, chatMessages, chatReadStorageKey]);

  const chatUnreadCount = React.useMemo(
    () =>
      chatMessages.filter((m) => m.sender_role === 'AGENT' && m.id > chatLastReadAgentId).length,
    [chatMessages, chatLastReadAgentId]
  );

  const submitNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noticeBody.trim()) {
      toast.error('Escribe el mensaje del aviso');
      return;
    }
    setSavingNotice(true);
    try {
      const payload: Parameters<typeof api.createAgentWorkspaceSupervisorNotice>[0] = {
        body: noticeBody.trim(),
        campaign_id: noticeCampaignId ? noticeCampaignId : null,
        ends_at: noticeEndsAt ? new Date(noticeEndsAt).toISOString() : null,
      };
      await api.createAgentWorkspaceSupervisorNotice(payload);
      toast.success('Aviso publicado');
      setNoticeBody('');
      setNoticeCampaignId('');
      setNoticeEndsAt('');
      await loadNotices();
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo crear el aviso');
    } finally {
      setSavingNotice(false);
    }
  };

  const submitCallback = async (e: React.FormEvent) => {
    e.preventDefault();
    const aid = parseInt(cbAssignee, 10);
    if (!aid) {
      toast.error('Selecciona agente');
      return;
    }
    if (!cbContact.trim()) {
      toast.error('Nombre del contacto requerido');
      return;
    }
    if (!cbWhen) {
      toast.error('Indica fecha y hora');
      return;
    }
    setSavingCallback(true);
    try {
      await api.createAgentWorkspaceSupervisorCallback({
        assignee_user_id: aid,
        contact_name: cbContact.trim(),
        scheduled_at: new Date(cbWhen).toISOString(),
        notes: cbNotes.trim() || null,
        campaign_id: cbCampaign || null,
        phone: cbPhone.trim() || null,
      });
      toast.success('Callback agendado');
      setCbContact('');
      setCbPhone('');
      setCbWhen('');
      setCbCampaign('');
      setCbNotes('');
      await loadCallbacks();
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo crear el callback');
    } finally {
      setSavingCallback(false);
    }
  };

  const submitChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = chatDraft.trim();
    if (!chatCampaignId || !chatAgentUsername) {
      toast.error('Selecciona campaña y agente para abrir el chat');
      return;
    }
    if (!body) {
      toast.error('Escribe un mensaje');
      return;
    }
    setChatSending(true);
    try {
      const res: any = await api.sendAgentWorkspaceChatMessage({
        campaign_id: chatCampaignId,
        agent_username: chatAgentUsername,
        body,
      });
      if (res?.success && res.data) {
        setChatDraft('');
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === res.data.id)) return prev;
          return [...prev, res.data];
        });
      }
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo enviar el mensaje');
    } finally {
      setChatSending(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Workspace de agentes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Avisos y callbacks para el panel del agente. Conectado como <span className="font-semibold">{username}</span>.
        </p>
      </div>

      <Tabs defaultValue="avisos" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="avisos">Avisos supervisor</TabsTrigger>
          <TabsTrigger value="callbacks">Callbacks</TabsTrigger>
        </TabsList>

        <TabsContent value="avisos" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Nuevo aviso</CardTitle>
              <CardDescription>
                Opcionalmente limita a una campaña; sin campaña será visible para todos los agentes (según su alcance).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={submitNotice}>
                <div className="space-y-2">
                  <Label htmlFor="aviso-body">Mensaje</Label>
                  <Textarea
                    id="aviso-body"
                    value={noticeBody}
                    onChange={(e) => setNoticeBody(e.target.value)}
                    rows={4}
                    placeholder="Texto que verán los agentes en la tarjeta morada..."
                    className="resize-none"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Campaña (opcional)</Label>
                    <select
                      value={noticeCampaignId}
                      onChange={(e) => setNoticeCampaignId(e.target.value)}
                      className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="">Todas (sin filtro de campaña)</option>
                      {campaigns.map((c) => (
                        <option key={c.campaign_id} value={c.campaign_id}>
                          {c.campaign_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="aviso-fin">Cierra después de (opcional)</Label>
                    <Input
                      id="aviso-fin"
                      type="datetime-local"
                      value={noticeEndsAt}
                      onChange={(e) => setNoticeEndsAt(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={savingNotice}>
                  {savingNotice ? 'Publicando…' : 'Publicar aviso'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Avisos recientes</CardTitle>
              <CardDescription>Gestiona avisos activos o cerrados recientes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingNotices ? (
                <p className="text-sm text-slate-400">Cargando…</p>
              ) : notices.length === 0 ? (
                <p className="text-sm text-slate-500">Sin avisos en el historial.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden bg-white">
                  {notices.map((n) => (
                    <li key={n.id} className="p-4 text-sm">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-800 whitespace-pre-wrap">{n.body}</p>
                          <p className="text-[11px] text-slate-500 mt-2">
                            #{n.id} · {n.campaign_name || (n.campaign_id ? n.campaign_id : 'todas')} ·{' '}
                            {n.active ? 'activo' : 'inactivo'} ·{' '}
                            {new Date(n.created_at).toLocaleString()}
                            {n.created_by_username ? ` · por ${n.created_by_username}` : ''}
                          </p>
                        </div>
                        {n.active && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => {
                              api
                                .deactivateAgentWorkspaceNotice(n.id)
                                .then(() => {
                                  toast.success('Aviso desactivado');
                                  loadNotices();
                                })
                                .catch((err: any) =>
                                  toast.error(err?.message || 'Error')
                                );
                            }}
                          >
                            Desactivar
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="callbacks" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agendar callback</CardTitle>
              <CardDescription>Asigna una devolución de llamada a un agente.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={submitCallback}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Agente asignado</Label>
                    <select
                      value={cbAssignee}
                      onChange={(e) => setCbAssignee(e.target.value)}
                      className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                      required
                    >
                      <option value="">Seleccionar…</option>
                      {users.map((u) => (
                        <option key={u.user_id} value={String(u.user_id)}>
                          {u.username}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Campaña (opcional)</Label>
                    <select
                      value={cbCampaign}
                      onChange={(e) => setCbCampaign(e.target.value)}
                      className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="">—</option>
                      {campaigns.map((c) => (
                        <option key={c.campaign_id} value={c.campaign_id}>
                          {c.campaign_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cb-nombre">Contacto</Label>
                    <Input
                      id="cb-nombre"
                      value={cbContact}
                      onChange={(e) => setCbContact(e.target.value)}
                      placeholder="Nombre o empresa"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cb-tel">Teléfono (opcional)</Label>
                    <Input
                      id="cb-tel"
                      value={cbPhone}
                      onChange={(e) => setCbPhone(e.target.value)}
                      placeholder="+52…"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cb-cuando">Fecha y hora</Label>
                    <Input
                      id="cb-cuando"
                      type="datetime-local"
                      value={cbWhen}
                      onChange={(e) => setCbWhen(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="cb-notes">Notas</Label>
                    <Textarea
                      id="cb-notes"
                      value={cbNotes}
                      onChange={(e) => setCbNotes(e.target.value)}
                      rows={2}
                      placeholder="Motivo, recordatorio..."
                    />
                  </div>
                </div>
                <Button type="submit" disabled={savingCallback}>
                  {savingCallback ? 'Guardando…' : 'Agendar'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Callbacks</CardTitle>
              <CardDescription>Historial reciente · Puede cancelar los pendientes.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCallbacks ? (
                <p className="text-sm text-slate-400">Cargando…</p>
              ) : callbacks.length === 0 ? (
                <p className="text-sm text-slate-500">No hay registros.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden bg-white">
                  {callbacks.map((cb) => (
                    <li key={cb.id} className="p-4 text-sm flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{cb.contact_name}</p>
                        <p className="text-slate-600 text-[13px]">
                          Agente: {cb.assignee_username || cb.assignee_user_id}{' '}
                          ·{' '}
                          {new Date(cb.scheduled_at).toLocaleString()}
                        </p>
                        {(cb.phone || cb.notes) && (
                          <p className="text-slate-500 text-xs mt-1">
                            {[cb.phone, cb.notes].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <span
                          className={`inline-block mt-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            cb.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : cb.status === 'DONE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {cb.status}
                        </span>
                      </div>
                      {cb.status === 'PENDING' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => {
                            api
                              .cancelAgentWorkspaceSupervisorCallback(cb.id)
                              .then(() => {
                                toast.success('Cancelado');
                                loadCallbacks();
                              })
                              .catch((err: any) => toast.error(err?.message || 'Error'));
                          }}
                        >
                          Cancelar
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

    </div>
  );
}
