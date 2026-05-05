import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  private getSocketUrl(): string {
    // Try to get from saved settings first
    try {
      const savedSettings = localStorage.getItem('systemSettings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        if (settings.socketUrl) {
          return settings.socketUrl;
        }
      }
    } catch (error) {
      console.error('[Socket] Error loading settings:', error);
    }

    // Fallback to environment variable or default
    try {
      if (typeof window !== 'undefined' && (window as any).VITE_SOCKET_URL) {
        return (window as any).VITE_SOCKET_URL;
      }
    } catch { }

    return import.meta.env.VITE_SOCKET_URL || '/';
  }

  get isConnected(): boolean {
    return this.socket?.connected || false;
  }

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    const SOCKET_URL = this.getSocketUrl();
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      timeout: 120000, // 2 minutes connection timeout for large uploads
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('[Socket] Disconnected from server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, callback: Function) {
    if (!this.socket) {
      this.connect();
    }

    // Store callback reference
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Attach listener to socket
    this.socket?.on(event, callback as any);
  }

  off(event: string, callback?: Function) {
    if (callback) {
      this.socket?.off(event, callback as any);
      this.listeners.get(event)?.delete(callback);
    } else {
      this.socket?.off(event);
      this.listeners.delete(event);
    }
  }

  emit(event: string, data?: any) {
    if (!this.socket) {
      this.connect();
    }
    this.socket?.emit(event, data);
  }

  // Upload leads with progress tracking
  uploadLeads(
    leads: any[],
    listId: string,
    onProgress?: (progress: UploadProgress) => void,
    onComplete?: (result: UploadResult) => void
  ) {
    if (!this.socket) {
      this.connect();
    }

    if (onProgress) {
      this.on('upload:leads:progress', onProgress);
    }

    if (onComplete) {
      this.on('upload:leads:complete', (result: UploadResult) => {
        // Clean up listeners
        this.off('upload:leads:progress');
        this.off('upload:leads:complete');
        onComplete(result);
      });
    }

    this.emit('upload:leads:start', {
      leads,
      list_id: listId,
    });
  }

  // Subscribe to dashboard updates
  subscribeToDashboard(callback: (data: DashboardUpdate) => void) {
    this.on('dashboard:update', callback);
    this.on('dashboard:realtime:update', callback);
    this.emit('dashboard:subscribe');
  }

  unsubscribeFromDashboard(callback?: (data: DashboardUpdate) => void) {
    if (callback) {
      this.off('dashboard:update', callback);
      this.off('dashboard:realtime:update', callback);
    } else {
      this.off('dashboard:update');
      this.off('dashboard:realtime:update');
    }
  }

  // Subscribe to campaign real-time stats
  subscribeToCampaign(campaignId: string, callback: (stats: any[]) => void) {
    this.on('campaign:realtime:update', callback);
    this.emit('campaign:subscribe', { campaign_id: campaignId });
  }

  unsubscribeFromCampaign(campaignId: string, callback?: (stats: any[]) => void) {
    if (callback) {
      this.off('campaign:realtime:update', callback);
    } else {
      this.off('campaign:realtime:update');
    }
    this.emit('campaign:unsubscribe', { campaign_id: campaignId });
  }

  // Create a list
  createList(
    listData: CreateListData,
    callback: (response: ListResponse) => void
  ) {
    this.on('list:create:response', (response: ListResponse) => {
      this.off('list:create:response');
      callback(response);
    });
    this.emit('list:create', listData);
  }

  // Get list info
  getListInfo(listId: string, callback: (response: ListInfoResponse) => void) {
    this.on('list:info:response', (response: ListInfoResponse) => {
      if (response.list_id === listId) {
        this.off('list:info:response');
        callback(response);
      }
    });
    this.emit('list:info:request', { list_id: listId });
  }

  // Get agent status
  getAgentStatus(
    agentUser: string,
    callback: (response: AgentStatusResponse) => void
  ) {
    this.on('agent:status:response', (response: AgentStatusResponse) => {
      if (response.agent_user === agentUser) {
        this.off('agent:status:response');
        callback(response);
      }
    });
    this.emit('agent:status:request', { agent_user: agentUser });
  }

  // Update agent status
  updateAgentState(username: string, state: string, campaignId?: string) {
    this.emit('agent:state:update', {
      username,
      state,
      campaignId,
      timestamp: Date.now()
    });
  }

  /** Suscripción a métricas de turno para el workspace del agente (WebSocket cada ~5 s + disparo inicial). */
  subscribeAgentWorkspaceMetrics(username: string, callback: (data: AgentWorkspaceMetricsPayload) => void) {
    this.on('agent:workspace:metrics', callback as any);
    this.emit('agent:workspace:subscribe', { username });
  }

  unsubscribeAgentWorkspaceMetrics(username: string, callback?: (data: AgentWorkspaceMetricsPayload) => void) {
    if (callback) {
      this.off('agent:workspace:metrics', callback as any);
    } else {
      this.off('agent:workspace:metrics');
    }
    this.emit('agent:workspace:unsubscribe', { username });
  }

  subscribeAgentWorkspaceChat(
    campaignId: string,
    agentUsername: string,
    callback: (data: AgentWorkspaceChatMessagePayload) => void,
    options?: { participantRole?: 'AGENT' | 'SUPERVISOR'; participantUsername?: string }
  ) {
    this.on('agent:workspace:chat:message', callback as any);
    this.emit('agent:workspace:chat:subscribe', {
      campaign_id: campaignId,
      agent_username: agentUsername,
      participant_role: options?.participantRole,
      participant_username: options?.participantUsername,
    });
  }

  unsubscribeAgentWorkspaceChat(
    campaignId: string,
    agentUsername: string,
    callback?: (data: AgentWorkspaceChatMessagePayload) => void
  ) {
    if (callback) {
      this.off('agent:workspace:chat:message', callback as any);
    } else {
      this.off('agent:workspace:chat:message');
    }
    this.emit('agent:workspace:chat:unsubscribe', {
      campaign_id: campaignId,
      agent_username: agentUsername,
    });
  }

  onAgentWorkspaceChatPresence(callback: (data: AgentWorkspaceChatPresencePayload) => void) {
    this.on('agent:workspace:chat:presence', callback as any);
  }

  offAgentWorkspaceChatPresence(callback?: (data: AgentWorkspaceChatPresencePayload) => void) {
    if (callback) this.off('agent:workspace:chat:presence', callback as any);
    else this.off('agent:workspace:chat:presence');
  }
}

// Types
export interface UploadProgress {
  total: number;
  processed: number;
  successful: number;
  errors: number;
  percentage: number;
}

export interface UploadResult {
  total: number;
  successful: number;
  errors: number;
  results: Array<{
    success: boolean;
    phone_number: string;
    data?: string;
    error?: string;
  }>;
}

export interface DashboardUpdate {
  timestamp: string;
  agents?: any[];
  campaigns?: any[];
}

export interface CreateListData {
  list_id: string;
  list_name: string;
  campaign_id: string;
  active?: string;
  list_description?: string;
  outbound_cid?: string;
  [key: string]: any;
}

export interface ListResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ListInfoResponse {
  list_id: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface AgentStatusResponse {
  agent_user: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface AgentWorkspaceMetricsPayload {
  username: string;
  logged_seconds: number;
  calls_today: number;
  queue_depth: number;
  timestamp?: string;
}

export interface AgentWorkspaceChatMessagePayload {
  id: number;
  campaign_id: string;
  agent_username: string;
  sender_user_id?: number | null;
  sender_username: string;
  sender_role: 'AGENT' | 'SUPERVISOR';
  body: string;
  created_at: string;
}

export interface AgentWorkspaceChatPresencePayload {
  room: string;
  supervisor_online: boolean;
  agent_online: boolean;
  supervisor_count: number;
  agent_count: number;
  timestamp?: string;
}

export default new SocketService();
