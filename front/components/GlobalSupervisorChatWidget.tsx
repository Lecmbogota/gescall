import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import socketService from '../services/socket';
import { playChatNotificationTone } from '../utils/chatSound';

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

const formatChatTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (messageDay === today) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (messageDay === today - 86400000) return 'Ayer';
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
};

const formatDayLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (messageDay === today) return 'Hoy';
  if (messageDay === today - 86400000) return 'Ayer';
  return date.toLocaleDateString([], { weekday: 'long', day: '2-digit', month: 'long' });
};

const getInitials = (value: string) => {
  const clean = value.trim();
  if (!clean) return '?';
  return clean
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
};

export function GlobalSupervisorChatWidget({ username, enabled }: GlobalSupervisorChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConversationView, setIsConversationView] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [campaigns, setCampaigns] = useState<Array<{ campaign_id: string; campaign_name: string }>>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selectedAgentUsername, setSelectedAgentUsername] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread'>('all');
  const [threads, setThreads] = useState<Record<string, ChatMessageRow[]>>({});
  const [unreadByThread, setUnreadByThread] = useState<Record<string, number>>({});
  const [onlineByAgent, setOnlineByAgent] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chipsScrollRef = useRef<HTMLDivElement | null>(null);
  const chipsDraggingRef = useRef(false);
  const chipsStartXRef = useRef(0);
  const chipsStartScrollLeftRef = useRef(0);

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
      if (payload.sender_role === 'AGENT') {
        playChatNotificationTone();
      }
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

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (launcherRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const totalUnread = useMemo(
    () => Object.values(unreadByThread).reduce((acc, n) => acc + (Number(n) || 0), 0),
    [unreadByThread]
  );

  const currentCampaignUnread = useMemo(
    () =>
      contacts.reduce((acc, c) => {
        const k = selectedCampaignId ? threadKey(selectedCampaignId, c.username) : '';
        return acc + (k ? unreadByThread[k] || 0 : 0);
      }, 0),
    [contacts, selectedCampaignId, unreadByThread]
  );

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.campaign_id === selectedCampaignId),
    [campaigns, selectedCampaignId]
  );

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contacts.filter((c) => {
      const k = selectedCampaignId ? threadKey(selectedCampaignId, c.username) : '';
      const unread = k ? unreadByThread[k] || 0 : 0;
      if (chatFilter === 'unread' && unread <= 0) return false;
      if (!q) return true;
      return (
        c.username.toLowerCase().includes(q) ||
        (c.lastMessage || '').toLowerCase().includes(q)
      );
    });
  }, [chatFilter, contacts, searchQuery, selectedCampaignId, unreadByThread]);

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
        <div
          ref={panelRef}
          className={`${isExpanded ? 'w-[960px]' : 'w-[390px]'} max-w-[calc(100vw-2rem)] h-[700px] max-h-[calc(100vh-7rem)] rounded-[28px] border border-white/10 bg-[#0b141a] shadow-[0_28px_90px_rgba(0,0,0,0.45)] overflow-hidden flex transition-[width] duration-300 ease-out`}
        >
          <div className={`${isExpanded || !isConversationView ? 'flex' : 'hidden'} ${isExpanded ? 'w-[370px] border-r border-white/10' : 'w-full'} bg-[#111b21] flex-col`}>
            <div className="px-3 pt-4 pb-3 bg-[#111b21]">
              <div className="flex items-center justify-between gap-3 px-1 mb-4">
                <div>
                  <h3 className="text-[22px] font-semibold tracking-tight text-white">Chats</h3>
                  <p className="text-[11px] text-[#8696a0]">
                    {contacts.length} agente{contacts.length === 1 ? '' : 's'} en esta campaña
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[#aebac1]">
                  <button
                    type="button"
                    className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                    title={isExpanded ? 'Contraer' : 'Expandir'}
                    onClick={() => setIsExpanded((v) => !v)}
                  >
                    {isExpanded ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 18-6-6 6-6" />
                        <path d="m9 18-6-6 6-6" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                        <path d="m15 18 6-6-6-6" />
                      </svg>
                    )}
                  </button>
                  <button type="button" className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors" title="Nuevo chat">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  <button type="button" className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors" title="Opciones">
                    <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="h-11 rounded-full bg-[#202c33] flex items-center gap-3 px-4 focus-within:ring-1 focus-within:ring-[#00a884]">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 shrink-0">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar un chat o iniciar uno nuevo"
                  className="w-full bg-transparent text-[14px] text-[#e9edef] placeholder:text-[#8696a0] outline-none"
                />
              </div>
              <div
                ref={chipsScrollRef}
                className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 cursor-grab active:cursor-grabbing select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                onWheel={(e) => {
                  const el = chipsScrollRef.current;
                  if (!el) return;
                  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    el.scrollLeft += e.deltaY;
                    e.preventDefault();
                  } else if (e.deltaX !== 0) {
                    el.scrollLeft += e.deltaX;
                    e.preventDefault();
                  }
                }}
                onPointerDown={(e) => {
                  const el = chipsScrollRef.current;
                  if (!el) return;
                  chipsDraggingRef.current = true;
                  chipsStartXRef.current = e.clientX;
                  chipsStartScrollLeftRef.current = el.scrollLeft;
                  try {
                    el.setPointerCapture(e.pointerId);
                  } catch {
                    /* ignore */
                  }
                }}
                onPointerMove={(e) => {
                  const el = chipsScrollRef.current;
                  if (!el || !chipsDraggingRef.current) return;
                  const delta = e.clientX - chipsStartXRef.current;
                  el.scrollLeft = chipsStartScrollLeftRef.current - delta;
                }}
                onPointerUp={(e) => {
                  const el = chipsScrollRef.current;
                  chipsDraggingRef.current = false;
                  if (!el) return;
                  try {
                    el.releasePointerCapture(e.pointerId);
                  } catch {
                    /* ignore */
                  }
                }}
                onPointerLeave={() => {
                  chipsDraggingRef.current = false;
                }}
              >
                <button
                  type="button"
                  onClick={() => setChatFilter('all')}
                  className={`h-8 px-4 rounded-full text-[12px] font-semibold shrink-0 transition-colors ${chatFilter === 'all' ? 'bg-[#005c4b] text-[#d9fdd3]' : 'bg-[#202c33] text-[#aebac1] hover:bg-[#26343d]'}`}
                >
                  Todos
                </button>
                {campaigns.map((c) => {
                  const active = selectedCampaignId === c.campaign_id;
                  return (
                    <button
                      key={c.campaign_id}
                      type="button"
                      onClick={() => {
                        setSelectedCampaignId(c.campaign_id);
                        setSearchQuery('');
                        setChatFilter('all');
                        setIsConversationView(false);
                      }}
                      className={`h-8 px-4 rounded-full text-[12px] font-semibold shrink-0 transition-colors ${
                        active
                          ? 'bg-[#005c4b] text-[#d9fdd3]'
                          : 'bg-[#202c33] text-[#aebac1] hover:bg-[#26343d]'
                      }`}
                      title={c.campaign_name}
                    >
                      <span className="block max-w-[150px] truncate">{c.campaign_name}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setChatFilter('unread')}
                  className={`h-8 px-4 rounded-full text-[12px] font-semibold shrink-0 transition-colors ${chatFilter === 'unread' ? 'bg-[#005c4b] text-[#d9fdd3]' : 'bg-[#202c33] text-[#aebac1] hover:bg-[#26343d]'}`}
                >
                  No leídos {currentCampaignUnread > 0 ? currentCampaignUnread > 99 ? '99+' : currentCampaignUnread : ''}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-[#111b21]">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-12 h-12 rounded-full bg-white/10"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-3 rounded bg-white/10 w-2/3"></div>
                        <div className="h-2.5 rounded bg-white/5 w-full"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : contacts.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-[#202c33] flex items-center justify-center text-[#8696a0]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-[#e9edef]">Sin agentes asignados</p>
                  <p className="mt-1 text-xs text-[#8696a0]">Selecciona otra campaña para ver conversaciones.</p>
                </div>
              ) : filteredContacts.length === 0 ? (
                <p className="text-xs text-[#8696a0] p-4 text-center">No hay chats que coincidan con este filtro.</p>
              ) : (
                filteredContacts.map((c) => {
                  const k = selectedCampaignId ? threadKey(selectedCampaignId, c.username) : '';
                  const unread = k ? unreadByThread[k] || 0 : 0;
                  const selected = c.username === selectedAgentUsername;
                  return (
                    <button
                      key={c.username}
                      type="button"
                      onClick={() => {
                        setSelectedAgentUsername(c.username);
                        if (!isExpanded) setIsConversationView(true);
                      }}
                      className={`w-full px-3 py-2 text-left transition-colors ${selected ? 'bg-[#2a3942]' : 'bg-[#111b21] hover:bg-[#202c33]'}`}
                    >
                      <div className="flex items-center gap-3 rounded-xl">
                        <div className="relative shrink-0">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-bold text-white shadow-inner ${onlineByAgent[c.username] ? 'bg-gradient-to-br from-[#00a884] to-[#027f6f]' : 'bg-gradient-to-br from-[#667781] to-[#3b4a54]'}`}>
                            {getInitials(c.username)}
                          </div>
                          <span className={`absolute right-0 bottom-0 w-3 h-3 rounded-full border-2 border-[#111b21] ${onlineByAgent[c.username] ? 'bg-[#25d366]' : 'bg-[#667781]'}`}></span>
                        </div>
                        <div className="min-w-0 flex-1 border-b border-white/10 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[15px] truncate ${unread > 0 ? 'font-bold text-white' : 'font-semibold text-[#e9edef]'}`}>{c.username}</span>
                            <span className={`text-[11px] shrink-0 ${unread > 0 ? 'text-[#25d366] font-bold' : 'text-[#8696a0]'}`}>
                              {formatChatTime(c.lastAt)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className={`text-[13px] truncate ${unread > 0 ? 'text-[#d1d7db] font-medium' : 'text-[#8696a0]'}`}>
                              {c.lastMessage || 'Sin mensajes todavía'}
                            </p>
                            {unread > 0 && (
                              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#25d366] text-white text-[10px] font-bold flex items-center justify-center tabular-nums shrink-0">
                                {unread > 99 ? '99+' : unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className={`${isExpanded || isConversationView ? 'flex' : 'hidden'} w-full flex-col bg-[#0b141a] relative`}>
            <div className="absolute inset-0 opacity-[0.18] pointer-events-none bg-[radial-gradient(circle_at_20%_15%,rgba(0,168,132,0.28)_0_1px,transparent_1px),radial-gradient(circle_at_80%_35%,rgba(37,211,102,0.18)_0_1px,transparent_1px),radial-gradient(circle_at_45%_80%,rgba(134,150,160,0.18)_0_1px,transparent_1px)] bg-[length:34px_34px]"></div>
            <div className="relative z-10 px-4 py-3 border-b border-white/10 bg-[#202c33] flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {!isExpanded && (
                  <button
                    type="button"
                    onClick={() => setIsConversationView(false)}
                    className="w-9 h-9 rounded-full text-[#aebac1] hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
                    title="Volver a chats"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                )}
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00a884] to-[#027f6f] text-white flex items-center justify-center text-sm font-bold">
                    {selectedAgentUsername ? getInitials(selectedAgentUsername) : '?'}
                  </div>
                  {selectedAgentUsername && (
                    <span className={`absolute right-0 bottom-0 w-3 h-3 rounded-full border-2 border-[#202c33] ${onlineByAgent[selectedAgentUsername] ? 'bg-[#25d366]' : 'bg-[#667781]'}`}></span>
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-[15px] font-semibold text-[#e9edef] truncate">{selectedAgentUsername || 'Selecciona un agente'}</h4>
                  <p className="text-[12px] text-[#8696a0] truncate">
                    {selectedAgentUsername
                      ? `${onlineByAgent[selectedAgentUsername] ? 'En linea' : 'Desconectado'} · ${selectedCampaign?.campaign_name || selectedCampaignId}`
                      : 'Elige una conversación para comenzar'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="w-9 h-9 rounded-full text-[#aebac1] hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                  title={isExpanded ? 'Contraer' : 'Expandir'}
                  onClick={() => setIsExpanded((v) => !v)}
                >
                  {isExpanded ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 18-6-6 6-6" />
                      <path d="m9 18-6-6 6-6" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 18 6-6-6-6" />
                      <path d="m15 18 6-6-6-6" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="w-9 h-9 rounded-full text-[#aebac1] hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                  onClick={() => setIsOpen(false)}
                  title="Cerrar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-6 py-5 space-y-2">
              {!selectedCampaignId || !selectedAgentUsername ? (
                <div className="h-full flex items-center justify-center">
                  <div className="max-w-sm rounded-3xl bg-[#202c33]/90 backdrop-blur border border-white/10 shadow-sm px-7 py-8 text-center">
                    <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-[#005c4b] text-[#d9fdd3] flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-[#e9edef]">Selecciona una conversación</p>
                    <p className="mt-1 text-xs text-[#8696a0]">Escoge campaña y agente para ver el historial y responder.</p>
                  </div>
                </div>
              ) : selectedMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="rounded-2xl bg-[#202c33]/90 px-5 py-3 text-xs text-[#aebac1] shadow-sm border border-white/10">
                    Sin mensajes en este hilo. Envía el primero para iniciar la conversación.
                  </div>
                </div>
              ) : (
                selectedMessages.map((m, index) => {
                  const mine = m.sender_role === 'SUPERVISOR';
                  const prev = selectedMessages[index - 1];
                  const currentDay = formatDayLabel(m.created_at);
                  const previousDay = prev ? formatDayLabel(prev.created_at) : '';
                  const showDay = currentDay && currentDay !== previousDay;
                  return (
                    <React.Fragment key={m.id}>
                      {showDay && (
                        <div className="flex justify-center py-2">
                          <span className="rounded-lg bg-[#182229] px-3 py-1 text-[11px] font-medium text-[#8696a0] shadow-sm border border-white/10 capitalize">
                            {currentDay}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`relative max-w-[72%] px-3.5 py-2 text-[13px] leading-relaxed shadow-sm ${
                            mine
                              ? 'bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-md'
                              : 'bg-[#202c33] text-[#e9edef] rounded-2xl rounded-tl-md'
                          }`}
                          title={`${m.sender_username} · ${new Date(m.created_at).toLocaleString()}`}
                        >
                          <p className="whitespace-pre-wrap break-words pr-10">{m.body}</p>
                          <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-[#9bd3c3]' : 'text-[#8696a0]'}`}>
                            <span>{formatChatTime(m.created_at)}</span>
                            {mine && (
                              <span className="text-[#53bdeb]" aria-label="enviado">✓✓</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            <form onSubmit={sendMessage} className="relative z-10 px-4 py-3 border-t border-white/10 bg-[#202c33] flex items-end gap-2">
              <button
                type="button"
                className="w-10 h-10 rounded-full text-[#aebac1] hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                title="Emoji"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" x2="9.01" y1="9" y2="9" />
                  <line x1="15" x2="15.01" y1="9" y2="9" />
                </svg>
              </button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={selectedAgentUsername ? 'Escribe un mensaje' : 'Selecciona un agente para responder'}
                disabled={!selectedCampaignId || !selectedAgentUsername || sending}
                className="flex-1 h-11 rounded-full border border-transparent bg-[#2a3942] px-4 text-[14px] text-[#e9edef] placeholder:text-[#8696a0] outline-none shadow-sm focus:border-[#00a884] disabled:bg-[#2a3942]/70"
              />
              <button
                type="submit"
                disabled={!selectedCampaignId || !selectedAgentUsername || !draft.trim() || sending}
                className="w-11 h-11 rounded-full bg-[#25d366] hover:bg-[#20bd5a] disabled:bg-slate-300 text-white flex items-center justify-center shadow-sm transition-colors"
                title="Enviar"
              >
                {sending ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/70 border-t-transparent animate-spin"></span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="M22 2 11 13" />
                  </svg>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={() =>
          setIsOpen((v) => {
            const next = !v;
            if (next) {
              setIsConversationView(false);
              setIsExpanded(false);
            }
            return next;
          })
        }
        className="relative w-14 h-14 rounded-full bg-[#25d366] hover:bg-[#20bd5a] text-white shadow-[0_12px_30px_rgba(37,211,102,0.35)] flex items-center justify-center transition-all hover:scale-105 active:scale-95"
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

