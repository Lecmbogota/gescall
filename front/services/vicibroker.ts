import { io, Socket } from 'socket.io-client';

/**
 * Vicibroker WebSocket Service
 * Connects to Vicibroker SQL query broker via Socket.IO
 */
class VicibrokerService {
  private socket: Socket | null = null;
  private queryCallbacks: Map<string, (result: VicibrokerResponse) => void> = new Map();
  private connected: boolean = false;
  private queryIdCounter: number = 0;

  private getVicibrokerUrl(): string {
    // Try to get from saved settings first
    try {
      const savedSettings = localStorage.getItem('systemSettings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        if (settings.vicibrokerUrl) {
          return settings.vicibrokerUrl;
        }
      }
    } catch (error) {
      console.error('[Vicibroker] Error loading settings:', error);
    }

    // Fallback to environment variable or default
    try {
      if (typeof window !== 'undefined' && (window as any).VITE_VICIBROKER_URL) {
        return (window as any).VITE_VICIBROKER_URL;
      }
    } catch { }

    // Default Vicibroker URL - use relative path to go through HTTPS proxy
    // This avoids Mixed Content issues when page is served over HTTPS
    return '/vicibroker';
  }

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    const VICIBROKER_URL = this.getVicibrokerUrl();

    console.log('[Vicibroker] Connecting to:', VICIBROKER_URL);

    this.socket = io(VICIBROKER_URL, {
      path: '/ws',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('[Vicibroker] ✓ Connected to server', this.socket?.id);
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('[Vicibroker] ✗ Disconnected from server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Vicibroker] ✗ Connection error:', error);
      this.connected = false;
    });

    // Listen for query results
    this.socket.on('result', (response: VicibrokerResponse) => {
      console.log('[Vicibroker] <<< Result received for:', response.name);
      console.log('[Vicibroker] <<< Query ID:', response.queryId);
      console.log('[Vicibroker] <<< Response:', response);

      // Call the registered callback if exists. Try by queryId first, then by name.
      const callbackKey = response.queryId || response.name;
      const callback = this.queryCallbacks.get(callbackKey);

      if (callback) {
        console.log('[Vicibroker] \u2713 Callback found, executing...');
        try {
          callback(response);
        } finally {
          // Clean up callback entries for both the queryId and the name to avoid leaks.
          if (response.queryId) this.queryCallbacks.delete(response.queryId);
          if (response.name) this.queryCallbacks.delete(response.name);
        }
      } else {
        console.warn('[Vicibroker] \u2717 No callback found for key:', callbackKey);
        console.warn('[Vicibroker] \u2717 Active callbacks:', Array.from(this.queryCallbacks.keys()));
      }
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.socket !== null;
  }

  /**
   * Generic query method
   */
  private query<T = any>(
    name: string,
    payload: any,
    callback: (result: VicibrokerResponse<T>) => void
  ) {
    if (!this.socket) {
      this.connect();
    }

    // Generate unique query ID

    const queryId = `${name}_${++this.queryIdCounter}_${Date.now()}`;

    // Register callback with unique ID
    this.queryCallbacks.set(queryId, callback);
    // Also register by name as a fallback if there's not already a callback for the name
    if (!this.queryCallbacks.has(name)) {
      this.queryCallbacks.set(name, callback);
    }

    // Send query
    const message: VicibrokerQuery = {
      type: 'query',
      name,
      payload,
      queryId,
    };

    console.log('[Vicibroker] >>> Sending query:', name);
    console.log('[Vicibroker] >>> Query ID:', queryId);
    console.log('[Vicibroker] >>> Payload:', payload);
    console.log('[Vicibroker] >>> Full message:', message);
    console.log('[Vicibroker] >>> Socket connected:', this.socket?.connected);

    this.socket?.emit('query', message);
    console.log('[Vicibroker] >>> Query emitted');

    // Return the queryId so callers (or promise wrapper) can reference it
    return queryId;
  }

  /**
   * Promise-based query method
   */
  private queryPromise<T = any>(name: string, payload: any): Promise<VicibrokerResponse<T>> {
    return new Promise((resolve, reject) => {
      // Check if socket is connected before sending query
      if (!this.socket?.connected) {
        console.warn('[Vicibroker] Socket not connected, attempting to connect...');
        this.connect();

        // Wait a bit for connection before proceeding
        setTimeout(() => {
          if (!this.socket?.connected) {
            reject(new Error(`Socket not connected for query: ${name}`));
            return;
          }
          this.executeQuery(name, payload, resolve, reject);
        }, 2000);
      } else {
        this.executeQuery(name, payload, resolve, reject);
      }
    });
  }

  private executeQuery<T = any>(
    name: string,
    payload: any,
    resolve: (value: VicibrokerResponse<T>) => void,
    reject: (reason?: any) => void
  ) {
    let queryId: string | undefined;

    const timeout = setTimeout(() => {
      if (queryId) this.queryCallbacks.delete(queryId);
      // Also clean up by name fallback
      this.queryCallbacks.delete(name);
      reject(new Error(`Query timeout: ${name}`));
    }, 60000); // 60 second timeout (increased from 30)

    // Call query and capture returned queryId
    try {
      queryId = this.query<T>(name, payload, (result) => {
        clearTimeout(timeout);
        if (result.ok) {
          resolve(result);
        } else {
          reject(new Error(result.error || 'Query failed'));
        }
      });
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  }

  // ==================== QUERY METHODS ====================

  /**
   * Get dial log by campaign and date range
   */
  async dialLogByCampaignDateRange(params: {
    start_datetime: string;
    end_datetime: string;
    campaigns: string[];
    limit?: number;
  }): Promise<VicibrokerResponse<DialLogRow>> {
    return this.queryPromise('dial_log_by_campaign_date_range', {
      ...params,
      limit: params.limit || 1000,
    });
  }

  /**
   * Get status summary by list
   */
  async statusSummaryByList(params: {
    start_datetime: string;
    end_datetime: string;
    campaigns: string[];
    limit?: number;
  }): Promise<VicibrokerResponse<StatusSummaryRow>> {
    return this.queryPromise('status_summary_by_list', {
      ...params,
      limit: params.limit || 1000,
    });
  }

  /**
   * Get campaign progress by list
   */
  async campaignProgressByList(params: {
    start_datetime: string;
    end_datetime: string;
    campaigns: string[];
    limit?: number;
  }): Promise<VicibrokerResponse<CampaignProgressRow>> {
    return this.queryPromise('campaign_progress_by_list', {
      ...params,
      limit: params.limit || 1000,
    });
  }

  /**
   * Get campaigns status
   */
  async campaignsStatus(campaigns: string[]): Promise<VicibrokerResponse<CampaignStatusRow>> {
    if (!campaigns || campaigns.length === 0) {
      throw new Error('campaigns array cannot be empty');
    }
    return this.queryPromise('campaigns_status', { campaigns });
  }

  /**
   * Get lists count by campaign
   */
  async listsCountByCampaign(campaigns: string[]): Promise<VicibrokerResponse<ListCountRow>> {
    if (!campaigns || campaigns.length === 0) {
      throw new Error('campaigns array cannot be empty');
    }
    return this.queryPromise('lists_count_by_campaign', { campaigns });
  }

  /**
   * Get progress for a single campaign
   * IMPORTANT: This query accepts only ONE campaign
   */
  async progressForSingleCampaign(campaign: string): Promise<VicibrokerResponse<SingleCampaignProgressRow>> {
    if (!campaign) {
      throw new Error('campaign parameter is required');
    }
    return this.queryPromise('progress_for_single_campaign', { campaign });
  }

  /**
   * Get all campaigns status (helper method)
   */
  async getAllCampaignsStatus(): Promise<VicibrokerResponse<CampaignStatusRow>> {
    // This will get all campaigns - adjust as needed
    return this.queryPromise('campaigns_status', { campaigns: [] });
  }
}

// ==================== TYPE DEFINITIONS ====================

export interface VicibrokerQuery {
  type: 'query';
  name: string;
  payload: any;
  queryId?: string;
}

export interface VicibrokerResponse<T = any> {
  ok: boolean;
  name: string;
  queryId?: string;
  payload?: any;
  rows?: T[];
  meta?: {
    durationMs: number;
    rows: number;
    ts: string;
  };
  error?: string;
}

// Query-specific row types

export interface DialLogRow {
  call_date: string;
  campaign_id: string;
  status: string;
  phone_number: string;
  user: string;
  length_in_sec: number;
  [key: string]: any;
}

export interface StatusSummaryRow {
  list_id: string;
  list_name: string;
  status: string;
  count: number;
  campaign_id: string;
  [key: string]: any;
}

export interface CampaignProgressRow {
  campaign_id: string;
  list_id: string;
  list_name: string;
  total_leads: number;
  called_leads: number;
  progress_percentage: number;
  [key: string]: any;
}

export interface CampaignStatusRow {
  campaign_id: string;
  campaign_name: string;
  estado: string; // 'Activa', 'Pausada', 'Inactiva'
  active?: string; // Legacy field (Y/N)
  dial_status?: string;
  lead_order?: string;
  hopper_level?: number;
  auto_dial_level?: number;
  [key: string]: any;
}

export interface ListCountRow {
  campaign_id: string;
  list_id?: string;
  list_name?: string;
  cantidad_listas: number; // Number of lists per campaign from Vicibroker
  lead_count?: number; // Legacy field for backwards compatibility
  [key: string]: any;
}

export interface SingleCampaignProgressRow {
  campaign_id: string;
  list_id: string;
  list_name: string;
  total: number;
  contacted: number;
  pending: number;
  progress: number;
  [key: string]: any;
}

// Export singleton instance
export default new VicibrokerService();
