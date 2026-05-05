import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import socketService from '../services/socket';

type ChatMessageRow = {
  id: number;
  campaign_id: string;
  agent_username: string;
  sender_username: string;
  sender_role: 'AGENT' | 'SUPERVISOR';
  body: string;
  created_at: string;
};

type ContactItem = {
  username: string;
  lastMessage: string;
  lastAt: string | null;
};

interface GlobalSupervisorChatWidgetProps {
  username: string;
  enabled: boolean;
}

const threadKey = (campaignId: string, agentUsername: string) =>
  `${campaignId}::${agentUsername}`;

export function GlobalSupervisorChatWidget({ username, enabled }: GlobalSupervisorChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Array<{ campaign_id: string; campaign_name: string }>>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selectedAgentUsername, setSelectedAgentUsername] = useState('');
  const [threads, setThreads] = useState<Record<string, ChatMessageRow[]>>({});
  const [unreadByThread, setUnreadByThread] = useState<Record<string, number>>({});
  const [onlineByAgent, setOnlineByAgent] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const selectedThreadKey =
    selectedCampaignId && selectedAgentUsername
      ? threadKey(selectedCampaignId, selectedAgentUsername)
      : '';

  const selectedMessages = selectedThreadKey ? threads[selectedThreadKey] || [] : [];

  const getReadKey = (campaignId: string, agentUsername: string) =>
    `gescall_sup_chat_read_agent:${username}:${campaignId}:${agentUsername}`;

  const getStoredReadId = (campaignId: string, agentUsername: string): number => {
    try {
      const n = parseInt(localStorage.getItem(getReadKey(campaignId, agentUsername)) || '0', 10);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  };

  const setStoredReadId = (campaignId: string, agentUsername: string, id: number) => {
    try {
      localStorage.setItem(getReadKey(campaignId, agentUsername), String(id));
    } catch {
      /* ignore */
    }
  };

  const recomputeUnreadForThread = (
    campaignId: string,
    agentUsername: string,
    messages: ChatMessageRow[],
    markAsRead: boolean
  ) => {
    const key = threadKey(campaignId, agentUsername);
    const maxAgentMsgId = messages
      .filter((m) => m.sender_role === 'AGENT')
      .reduce((acc, m) => Math.max(acc, m.id), 0);
    if (markAsRead && maxAgentMsgId > 0) {
      setStoredReadId(campaignId, agentUsername, maxAgentMsgId);
    }
    const readId = markAsRead ? maxAgentMsgId : getStoredReadId(campaignId, agentUsername);
    const unread = messages.filter((m) => m.sender_role === 'AGENT' && m.id > readId).length;
    setUnreadByThread((prev) => ({ ...prev, [key]: unread }));
  };

  useEffect(() => {
    if (!enabled) return;
    (async () => {
      try {
        const res: any = await api.getCampaigns({});
        if (res?.success && Array.isArray(res.data)) {
          const mapped = res.data.map((c: any) => ({
            campaign_id: c.campaign_id,
            campaign_name: c.campaign_name || c.campaign_id,
          }));
          setCampaigns(mapped);
          if (!selectedCampaignId && mapped.length > 0) setSelectedCampaignId(mapped[0].campaign_id);
        }
      } catch {
        setCampaigns([]);
      }
    })();
  }, [enabled, selectedCampaignId]);

  useEffect(() => {
    if (!enabled || !selectedCampaignId) {
      setContacts([]);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const agentsRes: any = await api.getCampaignAgents(selectedCampaignId);
        const usernames: string[] = Array.isArray(agentsRes?.agents) ? agentsRes.agents : [];

        const entries = await Promise.all(
          usernames.map(async (agentUsername) => {
            try {
              const msgRes: any = await api.listAgentWorkspaceChatMessages({
                campaign_id: selectedCampaignId,
                agent_username: agentUsername,
              });
              const messages: ChatMessageRow[] =
                msgRes?.success && Array.isArray(msgRes.data) ? msgRes.data : [];
              const k = threadKey(selectedCampaignId, agentUsername);
              const last = messages[messages.length - 1];
              return {
                agentUsername,
                k,
                messages,
                lastMessage: last?.body || '',
                lastAt: last?.created_at || null,
              };
            } catch {
              return {
                agentUsername,
                k: threadKey(selectedCampaignId, agentUsername),
                messages: [],
                lastMessage: '',
                lastAt: null,
              };
            }
          })
        );

        const nextThreads: Record<string, ChatMessageRow[]> = {};
        const nextUnread: Record<string, number> = {};
        const nextContacts: ContactItem[] = [];
        for (const e of entries) {
          nextThreads[e.k] = e.messages;
          const readId = getStoredReadId(selectedCampaignId, e.agentUsername);
          nextUnread[e.k] = e.messages.filter((m) => m.sender_role === 'AGENT' && m.id > readId).length;
          nextContacts.push({
            username: e.agentUsername,
            lastMessage: e.lastMessage,
            lastAt: e.lastAt,
          });
        }

        nextContacts.sort((a, b) => {
          const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
          const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
          return tb - ta;
        });

        setThreads((prev) => ({ ...prev, ...nextThreads }));
        setUnreadByThread((prev) => ({ ...prev, ...nextUnread }));
        setContacts(nextContacts);
        if (!nextContacts.some((c) => c.username === selectedAgentUsername)) {
          setSelectedAgentUsername(nextContacts[0]?.username || '');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [enabled, selectedCampaignId]);

  useEffect(() => {
    if (!enabled || !selectedCampaignId || contacts.length === 0) return;
    socketService.connect();

    const onMessage = (payload: ChatMessageRow) => {
      if (!payload || payload.campaign_id !== selectedCampaignId) return;
      const k = threadKey(payload.campaign_id, payload.agent_username);
      setThreads((prev) => {
        const old = prev[k] || [];
        if (old.some((m) => m.id === payload.id)) return prev;
        const next = [...old, payload];
        const markAsRead = isOpen && selectedAgentUsername === payload.agent_username;
        recomputeUnreadForThread(payload.campaign_id, payload.agent_username, next, markAsRead);
        return { ...prev, [k]: next };
      });
      setContacts((prev) => {
        const target = prev.find((c) => c.username === payload.agent_username);
        if (!target) return prev;
        const updated: ContactItem = {
          ...target,
          lastMessage: payload.body,
          lastAt: payload.created_at,
        };
        const rest = prev.filter((c) => c.username !== payload.agent_username);
        return [updated, ...rest];
      });
    };

    const onPresence = (presence: any) => {
      if (!presence?.room || !presence.room.startsWith(`agent-workspace-chat:${selectedCampaignId}:`)) return;
      const agentUsername = String(presence.room).split(':').slice(2).join(':');
      setOnlineByAgent((prev) => ({ ...prev, [agentUsername]: Boolean(presence.agent_online) }));
    };

    for (const c of contacts) {
      socketService.subscribeAgentWorkspaceChat(selectedCampaignId, c.username, onMessage, {
        participantRole: 'SUPERVISOR',
        participantUsername: username,
      });
    }
    socketService.onAgentWorkspaceChatPresence(onPresence);

    return () => {
      for (const c of contacts) {
        socketService.unsubscribeAgentWorkspaceChat(selectedCampaignId, c.username, onMessage);
      }
      socketService.offAgentWorkspaceChatPresence(onPresence);
    };
  }, [enabled, selectedCampaignId, contacts, isOpen, selectedAgentUsername, username]);

  useEffect(() => {
    if (!isOpen || !selectedCampaignId || !selectedAgentUsername) return;
    const k = threadKey(selectedCampaignId, selectedAgentUsername);
    const msgs = threads[k] || [];
    recomputeUnreadForThread(selectedCampaignId, selectedAgentUsername, msgs, true);
  }, [isOpen, selectedCampaignId, selectedAgentUsername, threads]);

  useEffect(() => {
    if (!isOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [isOpen, selectedMessages, loading]);

  const totalUnread = useMemo(
    () => Object.values(unreadByThread).reduce((acc, n) => acc + (Number(n) || 0), 0),
    [unreadByThread]
  );

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !selectedCampaignId || !selectedAgentUsername) return;
    setSending(true);
    try {
      const res: any = await api.sendAgentWorkspaceChatMessage({
        campaign_id: selectedCampaignId,
        agent_username: selectedAgentUsername,
        body,
      });
      if (res?.success && res.data) {
        setDraft('');
      }
    } finally {
      setSending(false);
    }
  };

  if (!enabled) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-[860px] max-w-[calc(100vw-2rem)] h-[620px] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex">
          <div className="w-[280px] border-r border-slate-200 bg-slate-50 flex flex-col">
            <div className="p-3 border-b border-slate-200 bg-white">
              <h3 className="text-sm font-semibold text-slate-800">Chats</h3>
              <select
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="mt-2 w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
              >
                <option value="">Todas las campañas</option>
                {campaigns.map((c) => (
                  <option key={c.campaign_id} value={c.campaign_id}>
                    {c.campaign_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="text-xs text-slate-400 p-3">Cargando agentes…</p>
              ) : contacts.length === 0 ? (
                <p className="text-xs text-slate-400 p-3">Sin agentes asignados.</p>
              ) : (
                contacts.map((c) => {
                  const k = selectedCampaignId ? threadKey(selectedCampaignId, c.username) : '';
                  const unread = k ? unreadByThread[k] || 0 : 0;
                  const selected = c.username === selectedAgentUsername;
                  return (
                    <button
                      key={c.username}
                      type="button"
                      onClick={() => setSelectedAgentUsername(c.username)}
                      className={`w-full px-3 py-2 text-left border-b border-slate-100 hover:bg-white ${selected ? 'bg-white' : 'bg-transparent'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`inline-block w-2 h-2 rounded-full ${onlineByAgent[c.username] ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                          <span className="text-sm font-medium text-slate-800 truncate">{c.username}</span>
                        </div>
                        {unread > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-1">{c.lastMessage || 'Sin mensajes'}</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-800">{selectedAgentUsername || 'Selecciona un agente'}</h4>
                {selectedAgentUsername && (
                  <p className="text-xs text-slate-500">
                    {onlineByAgent[selectedAgentUsername] ? 'En linea' : 'Desconectado'}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-700"
                onClick={() => setIsOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-2">
              {!selectedCampaignId || !selectedAgentUsername ? (
                <p className="text-xs text-slate-400 text-center mt-28">Selecciona campaña y agente.</p>
              ) : selectedMessages.length === 0 ? (
                <p className="text-xs text-slate-400 text-center mt-28">Sin mensajes en este hilo.</p>
              ) : (
                selectedMessages.map((m) => {
                  const mine = m.sender_role === 'SUPERVISOR';
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`mt-1 text-[10px] ${mine ? 'text-indigo-100' : 'text-slate-400'}`}>
                          {m.sender_username} · {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={sendMessage} className="p-3 border-t border-slate-200 bg-white flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escribe un mensaje..."
                disabled={!selectedCampaignId || !selectedAgentUsername || sending}
                className="flex-1 h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400"
              />
              <button
                type="submit"
                disabled={!selectedCampaignId || !selectedAgentUsername || !draft.trim() || sending}
                className="h-10 px-4 rounded-xl bg-indigo-600 disabled:bg-slate-400 text-white text-sm font-medium"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="relative w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl flex items-center justify-center"
        title="Chat supervisor"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center tabular-nums">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>
    </div>
  );
}

