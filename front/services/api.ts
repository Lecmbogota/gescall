class ApiService {
  private getApiUrl(): string {
    let source = 'default';
    let url = import.meta.env.VITE_API_URL || '/api';

    // Try to get from saved settings first
    try {
      const savedSettings = localStorage.getItem('systemSettings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        if (settings.apiUrl) {
          url = settings.apiUrl;
          source = 'settings';
        }
      }
    } catch (error) {
      console.error('[API] Error loading settings:', error);
    }

    // Fallback to environment variable or default
    try {
      if (source === 'default' && typeof window !== 'undefined' && (window as any).VITE_API_URL) {
        url = (window as any).VITE_API_URL;
        source = 'env';
      }
    } catch { }

    return url;
  }

  public async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.getApiUrl()}${endpoint}`;

    let authHeaders: Record<string, string> = {};
    try {
      const authStr = localStorage.getItem('auth-storage');
      if (authStr) {
        const authData = JSON.parse(authStr);
        const token = authData?.state?.session?.token;
        const userGroup = authData?.state?.session?.user?.group;
        const userName = authData?.state?.session?.user?.id || authData?.state?.session?.user?.name;

        // JWT Bearer token (primary authentication)
        if (token) authHeaders['Authorization'] = `Bearer ${token}`;
        // Legacy headers (backward compatibility)
        if (userGroup) authHeaders['X-User-Role'] = userGroup;
        if (userName) authHeaders['X-User-Name'] = userName;
      }
    } catch (e) {
      console.error('[API] Failed to parse auth storage for headers');
    }

    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      ...options,
    };

    try {
      const response = await fetch(url, defaultOptions);
      const contentType = response.headers.get('content-type');

      // Handle 401 — token expired or invalid
      if (response.status === 401) {
        console.warn('[API] Unauthorized — session expired');
        localStorage.removeItem('auth-storage');
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        throw new Error('Session expired. Please login again.');
      }

      const data = await response.json();

      if (!response.ok) {
        const msg = typeof data?.error === 'string' ? data.error : 'Request failed';
        const err = new Error(msg) as Error & { code?: string; status?: number };
        if (data && typeof data === 'object' && data.code != null) {
          err.code = String((data as { code?: unknown }).code);
        }
        err.status = response.status;
        throw err;
      }

      return data;
    } catch (error) {
      console.error(`[API] Error ${options.method || 'GET'} ${endpoint}:`, error);
      throw error;
    }
  }

  // Generic REST Methods
  async get(endpoint: string) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint: string, data: any) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async put(endpoint: string, data: any) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async delete(endpoint: string) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // Lists
  async getLists() {
    // Note: This would need a backend endpoint to list all lists
    // For now, we'll use campaigns to get associated lists
    return this.request('/campaigns');
  }

  async getList(listId: string) {
    return this.request(`/lists/${listId}`);
  }

  async createList(listData: any) {
    return this.request('/lists', {
      method: 'POST',
      body: JSON.stringify(listData),
    });
  }

  async updateList(listId: string, updates: any) {
    return this.request(`/lists/${listId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteList(listId: string, deleteLeads = false) {
    return this.request(`/lists/${listId}?delete_leads=${deleteLeads}`, {
      method: 'DELETE',
    });
  }

  async getListLeads(listId: string, limit = 100, offset = 0) {
    return this.request(`/lists/${listId}/leads?limit=${limit}&offset=${offset}`);
  }

  async getNextListId() {
    return this.request('/lists/next-id');
  }

  async getStatusCounts(listId: string) {
    return this.request(`/lists/${listId}/status-counts`);
  }

  async recycleList(listId: string, statuses: string[]) {
    return this.request(`/lists/${listId}/recycle`, {
      method: 'POST',
      body: JSON.stringify({ statuses }),
    });
  }

  // File-based lead upload (streaming, low memory)
  async uploadLeadsFile(listId: string, file: File, campaignId?: string): Promise<{ success: boolean; taskId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    if (campaignId) formData.append('campaign_id', campaignId);

    const apiUrl = this.getApiUrl();
    const token = (() => {
      try {
        const authStr = localStorage.getItem('auth-storage');
        if (authStr) return JSON.parse(authStr)?.state?.session?.token;
      } catch { }
      return null;
    })();

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${apiUrl}/lists/${listId}/upload-file`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al subir archivo');
    }

    return response.json();
  }

  // Leads
  async searchLeads(phoneNumber: string, records = 1000) {
    return this.request(`/leads/search?phone_number=${phoneNumber}&records=${records}`);
  }

  async getLead(leadId: string, customFields = false) {
    return this.request(`/leads/${leadId}?custom_fields=${customFields ? 'Y' : 'N'}`);
  }

  async createLead(leadData: any) {
    return this.request('/leads', {
      method: 'POST',
      body: JSON.stringify(leadData),
    });
  }

  async updateLead(leadId: string, updates: any) {
    return this.request(`/leads/${leadId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteLead(leadId: string) {
    return this.request(`/leads/${leadId}`, {
      method: 'DELETE',
    });
  }

  // Campaigns
  async getCampaignPrefixes() {
    return this.request('/campaigns/prefixes');
  }

  async createCampaign(data: { campaign_id?: string; campaign_name: string; dial_prefix?: string; auto_dial_level?: number | string; max_retries?: number | string; campaign_cid?: string }) {
    return this.request('/campaigns/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCampaigns(params: {
    campaignId?: string;
    allowedCampaigns?: string[];
  } = {}) {
    const { campaignId, allowedCampaigns } = params;
    const searchParams = new URLSearchParams();

    if (campaignId) {
      searchParams.append('campaign_id', campaignId);
    }

    if (allowedCampaigns && allowedCampaigns.length > 0) {
      searchParams.append('allowed_campaigns', allowedCampaigns.join(','));
    }

    const queryString = searchParams.toString();
    const url = queryString ? `/campaigns?${queryString}` : '/campaigns';

    return this.request(url);
  }

  async getCampaignAgents(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/agents`);
  }

  async getCampaignAgentStatuses(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/agent-status`);
  }

  async assignCampaignAgents(campaignId: string, agents: string[]) {
    return this.request(`/campaigns/${campaignId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ agents }),
    });
  }

  async getCampaignStats(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/stats`);
  }

  async getCampaignHopper(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/hopper`);
  }

  async getCampaignProgress(campaignId: string, limit = 1000) {
    return this.request(`/campaigns/${campaignId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ limit }),
    });
  }

  async updateListStatus(listId: string, active: 'Y' | 'N'): Promise<{ success: boolean; message?: string }> {
    return this.request(`/lists/${listId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
  }

  async getCampaignLists(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/lists`);
  }

  async getCampaignDialLog(campaignId: string, startDatetime: string, endDatetime: string, limit = 500000) {
    return this.request(`/campaigns/${campaignId}/dial-log`, {
      method: 'POST',
      body: JSON.stringify({ startDatetime, endDatetime, limit }),
    });
  }

  // NEW: Call log from gescall_call_log table (correct pool CallerID)
  async getCampaignCallLog(campaignId: string, startDatetime: string, endDatetime: string, limit = 500000, callDirection?: string) {
    return this.request(`/campaigns/${campaignId}/call-log`, {
      method: 'POST',
      body: JSON.stringify({ startDatetime, endDatetime, limit, call_direction: callDirection }),
    });
  }

  // Consolidated report across multiple campaigns
  async getConsolidatedReport(campaigns: string[], startDatetime: string, endDatetime: string, limit = 500000) {
    return this.request('/campaigns/consolidated', {
      method: 'POST',
      body: JSON.stringify({ campaigns, startDatetime, endDatetime, limit }),
    });
  }

  // Aggregated stats across multiple campaigns
  async getConsolidatedStats(campaigns: string[], startDatetime: string, endDatetime: string) {
    return this.request('/campaigns/consolidated-stats', {
      method: 'POST',
      body: JSON.stringify({ campaigns, startDatetime, endDatetime }),
    });
  }

  async getCampaignCallerIdSettings(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/callerid-settings`);
  }

  async updateCampaignCallerIdSettings(campaignId: string, data: {
    rotation_mode: string;
    pool_id?: number | null;
    match_mode?: string;
    fixed_area_code?: string | null;
    fallback_callerid?: string | null;
    selection_strategy?: string;
    match_area_code?: boolean;
  }) {
    return this.request(`/campaigns/${campaignId}/callerid-settings`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async startCampaign(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/start`, {
      method: 'POST',
    });
  }

  async stopCampaign(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/stop`, {
      method: 'POST',
    });
  }

  async archiveCampaign(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/archive`, {
      method: 'POST',
    });
  }

  async unarchiveCampaign(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/unarchive`, {
      method: 'POST',
    });
  }

  async deleteCampaign(campaignId: string) {
    return this.request(`/campaigns/${campaignId}`, {
      method: 'DELETE',
    });
  }

  async updateCampaignDialLevel(campaignId: string, level: string | number) {
    return this.request(`/campaigns/${campaignId}/dial-level`, {
      method: 'PUT',
      body: JSON.stringify({ level: String(level) }),
    });
  }

  async updateCampaignRetries(campaignId: string, maxRetries: number) {
    return this.request(`/campaigns/${campaignId}/retries`, {
      method: 'PUT',
      body: JSON.stringify({ maxRetries }),
    });
  }

  async updateCampaignWorkspaceDailyTarget(campaignId: string, workspaceDailyTarget: number) {
    return this.request(`/campaigns/${campaignId}/workspace-daily-target`, {
      method: 'PUT',
      body: JSON.stringify({ workspace_daily_target: workspaceDailyTarget }),
    });
  }

  /** Meta del workspace: objetivo, ventana en días y tipificación que cuenta para +1 (null = todas). */
  async updateCampaignWorkspaceGoal(
    campaignId: string,
    payload: {
      workspace_daily_target: number;
      workspace_goal_period_days: number;
      workspace_goal_typification_id: number | null;
    }
  ) {
    return this.request(`/campaigns/${campaignId}/workspace-daily-target`, {
      method: 'PUT',
      body: JSON.stringify({
        workspace_daily_target: payload.workspace_daily_target,
        workspace_goal_period_days: payload.workspace_goal_period_days,
        workspace_goal_typification_id: payload.workspace_goal_typification_id,
      }),
    });
  }

  async updateCampaignPredictive(campaignId: string, settings: {
    predictive_target_drop_rate?: number;
    predictive_min_factor?: number;
    predictive_max_factor?: number;
  }) {
    return this.request(`/campaigns/${campaignId}/predictive`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async updateCampaignTeleprompterScript(campaignId: string, template: string) {
    return this.request(`/campaigns/${campaignId}/teleprompter-script`, {
      method: 'PUT',
      body: JSON.stringify({ template }),
    });
  }

  async updateCampaignTeleprompterDayparts(campaignId: string, dayparts: {
    day: string;
    afternoon: string;
    night: string;
    day_start: number;
    day_end: number;
    afternoon_start: number;
    afternoon_end: number;
    night_start: number;
    night_end: number;
  }) {
    return this.request(`/campaigns/${campaignId}/teleprompter-dayparts`, {
      method: 'PUT',
      body: JSON.stringify({ dayparts }),
    });
  }

  async updateCampaignPauseSettings(
    campaignId: string,
    pauseSettings: Record<string, { enabled: boolean; limit_seconds: number }>
  ) {
    return this.request(`/campaigns/${campaignId}/pause-settings`, {
      method: 'PUT',
      body: JSON.stringify({ pause_settings: pauseSettings }),
    });
  }

  async getCampaignById(campaignId: string) {
    return this.request(`/campaigns?campaign_id=${campaignId}`);
  }

  async getAgentWorkspaceDashboard(): Promise<{
    success: boolean;
    data?: {
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
      goals: Array<{
        id: string;
        campaignName: string;
        target: number;
        current: number;
        color: string;
        icon: 'trophy' | 'target' | 'star';
        periodDays?: number;
        typificationName?: string | null;
      }>;
      leaderboard: Array<{ rank: number; username: string; score: number; is_self: boolean }>;
    };
  }> {
    return this.request('/agent-workspace/dashboard');
  }

  async getAgentWorkspaceRecentCalls(params?: { days?: number; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.days != null) qs.set('days', String(params.days));
    if (params?.limit != null) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return this.request(`/agent-workspace/recent-calls${q ? `?${q}` : ''}`);
  }

  async dismissAgentWorkspaceNotice(noticeId: number) {
    return this.post(`/agent-workspace/notices/${noticeId}/dismiss`, {});
  }

  async completeAgentWorkspaceCallback(callbackId: number) {
    return this.request(`/agent-workspace/callbacks/${callbackId}/complete`, { method: 'PATCH' });
  }

  async verifyAgentWorkspacePausePin(pin: string) {
    return this.post('/agent-workspace/verify-pause-pin', { pin });
  }

  async setAgentWorkspacePausePin(pin: string, currentPin?: string) {
    const body: { pin: string; current_pin?: string } = { pin };
    if (currentPin != null && currentPin !== '') body.current_pin = currentPin;
    return this.post('/agent-workspace/pause-pin', body);
  }

  async getAgentWorkspaceLead(leadId: string) {
    return this.request(`/agent-workspace/lead/${encodeURIComponent(leadId)}`);
  }

  async listAgentWorkspaceNoticesAdmin() {
    return this.request('/agent-workspace/supervisor/notices');
  }

  async createAgentWorkspaceSupervisorNotice(data: {
    body: string;
    campaign_id?: string | null;
    starts_at?: string;
    ends_at?: string | null;
  }) {
    return this.post('/agent-workspace/supervisor/notices', data);
  }

  async deactivateAgentWorkspaceNotice(noticeId: number) {
    return this.request(`/agent-workspace/supervisor/notices/${noticeId}/deactivate`, { method: 'PATCH' });
  }

  async listAgentWorkspaceCallbacksAdmin(status?: 'PENDING' | 'DONE' | 'CANCELLED' | 'ALL') {
    const q =
      status && status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : '';
    return this.request(`/agent-workspace/supervisor/callbacks${q}`);
  }

  async createAgentWorkspaceSupervisorCallback(data: {
    assignee_user_id: number;
    contact_name: string;
    scheduled_at: string;
    notes?: string | null;
    campaign_id?: string | null;
    phone?: string | null;
  }) {
    return this.post('/agent-workspace/supervisor/callbacks', data);
  }

  async cancelAgentWorkspaceSupervisorCallback(callbackId: number) {
    return this.request(`/agent-workspace/supervisor/callbacks/${callbackId}/cancel`, {
      method: 'PATCH',
    });
  }

  async listAgentWorkspaceChatMessages(params?: { campaign_id?: string; agent_username?: string }) {
    const qs = new URLSearchParams();
    if (params?.campaign_id) qs.set('campaign_id', params.campaign_id);
    if (params?.agent_username) qs.set('agent_username', params.agent_username);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return this.request(`/agent-workspace/chat/messages${query}`);
  }

  async sendAgentWorkspaceChatMessage(data: {
    body: string;
    campaign_id?: string;
    agent_username?: string;
  }) {
    return this.post('/agent-workspace/chat/messages', data);
  }

  async updateCampaignAltPhone(campaignId: string, enabled: boolean) {
    return this.request(`/campaigns/${campaignId}/alt-phone`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
  }

  async updateCampaignRetrySettings(campaignId: string, retrySettings: Record<string, number>) {
    return this.request(`/campaigns/${campaignId}/retry-settings`, {
      method: 'PUT',
      body: JSON.stringify({ retry_settings: retrySettings }),
    });
  }

  async updateCampaignDialSchedule(campaignId: string, dialSchedule: {
    enabled: boolean;
    timezone: string;
    windows: { days: number[]; start: string; end: string }[];
  }) {
    return this.request(`/campaigns/${campaignId}/dial-schedule`, {
      method: 'PUT',
      body: JSON.stringify({ dial_schedule: dialSchedule }),
    });
  }

  async setCampaignScheduleTemplate(campaignId: string, templateId: number | null) {
    return this.request(`/campaigns/${campaignId}/schedule-template`, {
      method: 'PUT',
      body: JSON.stringify({ schedule_template_id: templateId }),
    });
  }

  // ─── Plantillas de horarios reutilizables ───
  async listScheduleTemplates() {
    return this.request('/schedule-templates');
  }

  async getScheduleTemplate(id: number) {
    return this.request(`/schedule-templates/${id}`);
  }

  async getScheduleTemplateCampaigns(id: number) {
    return this.request(`/schedule-templates/${id}/campaigns`);
  }

  async createScheduleTemplate(data: {
    name: string;
    description?: string | null;
    timezone: string;
    enabled: boolean;
    windows: { days: number[]; start: string; end: string }[];
  }) {
    return this.request('/schedule-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateScheduleTemplate(id: number, data: {
    name?: string;
    description?: string | null;
    timezone?: string;
    enabled?: boolean;
    windows?: { days: number[]; start: string; end: string }[];
  }) {
    return this.request(`/schedule-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteScheduleTemplate(id: number) {
    return this.request(`/schedule-templates/${id}`, {
      method: 'DELETE',
    });
  }

  async updateCampaignStructure(campaignId: string, schema: any[]) {
    return this.request(`/campaigns/${campaignId}/structure`, {
      method: 'PUT',
      body: JSON.stringify({ schema }),
    });
  }
  async getTTSTemplates() {
    // GesCall nativo: no hay catálogo global de plantillas TTS; usamos las de cada campaña (tts_templates en PG).
    return { success: true, data: [] };
  }

  async updateCampaignTTSTemplates(campaignId: string, templates: any[]) {
    return this.request(`/campaigns/${campaignId}/tts_templates`, {
      method: 'PUT',
      body: JSON.stringify({ templates }),
    });
  }

  // MOH (Music on Hold)
  async getMohClasses() {
    return this.request('/audio/moh-classes');
  }

  async updateCampaignMoh(campaignId: string, data: { moh_class?: string | null; moh_custom_file?: string | null }) {
    return this.request(`/campaigns/${campaignId}/moh`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async uploadMohAudio(file: File, campaign: string) {
    const formData = new FormData();
    formData.append('audio', file);
    formData.append('campaign', campaign);

    const apiUrl = this.getApiUrl();
    const token = (() => {
      try {
        const authStr = localStorage.getItem('auth-storage');
        if (authStr) return JSON.parse(authStr)?.state?.session?.token;
      } catch {}
      return null;
    })();

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${apiUrl}/audio/moh/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al subir audio MOH');
    }

    return response.json();
  }

  async removeMohAudio(campaign: string) {
    const apiUrl = this.getApiUrl();
    const token = (() => {
      try {
        const authStr = localStorage.getItem('auth-storage');
        if (authStr) return JSON.parse(authStr)?.state?.session?.token;
      } catch {}
      return null;
    })();

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${apiUrl}/audio/moh/${campaign}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al remover audio MOH');
    }

    return response.json();
  }

  // Recording Settings
  async updateCampaignRecordingSettings(campaignId: string, recordingSettings: {
    enabled: boolean;
    storage: string;
    external_type?: string;
    host?: string;
    port?: string;
    username?: string;
    password?: string;
    access_key?: string;
    secret_key?: string;
    region?: string;
    bucket?: string;
    filename_pattern: string;
  }) {
    return this.request(`/campaigns/${campaignId}/recording-settings`, {
      method: 'PUT',
      body: JSON.stringify({ recording_settings: recordingSettings }),
    });
  }

  async testRecordingConnection(campaignId: string, data: {
    external_type: string;
    host: string;
    port?: string | number;
    username?: string;
    password?: string;
    access_key?: string;
    secret_key?: string;
    region?: string;
    bucket?: string;
  }) {
    return this.request(`/campaigns/${campaignId}/recording-test-connection`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCpsAvailability() {
    return this.request('/campaigns/cps-availability');
  }

  async getCampaignsSummary(campaigns?: string[]) {
    return this.request('/campaigns/summary', {
      method: 'POST',
      body: JSON.stringify({ campaigns }),
    });
  }

  // Dashboard: agregación de stats/listas por campaña (REST nativo)
  async getBulkCampaignsStatus(campaigns?: string[]) {
    // Para entornos PG, los endpoints /bulk pueden no estar disponibles.
    // Simulamos el comportamiento llamando a los endpoints individuales y uniendo las respuestas.
    if (!campaigns || campaigns.length === 0) {
      return { success: true, data: [] };
    }

    try {
      const results = await Promise.all(
        campaigns.map((campId) => this.request(`/campaigns/${campId}/stats`).catch(() => null))
      );

      const validData = results
        .filter((res) => res && res.success && res.data)
        .map((res) => ({
          campaign_id: res.data.campaign_id,
          campaign_name: res.data.campaign_name,
          estado: res.data.active === 'Y' ? 'Activa' : 'Inactiva',
          active: res.data.active,
        }));

      return { success: true, data: validData };
    } catch (error) {
      console.error('[API] Error in getBulkCampaignsStatus:', error);
      throw error;
    }
  }

  async getBulkListsCount(campaigns: string[]) {
    if (!campaigns || campaigns.length === 0) {
      return { success: true, data: [] };
    }

    try {
      const results = await Promise.all(
        campaigns.map((campId) => this.request(`/campaigns/${campId}/lists`).catch(() => null))
      );

      const validData = results
        .filter((res) => res && res.success && res.data)
        .map((res, index) => ({
          campaign_id: campaigns[index],
          cantidad_listas: Array.isArray(res.data) ? res.data.length : 0,
        }));

      return { success: true, data: validData };
    } catch (error) {
      console.error('[API] Error in getBulkListsCount:', error);
      throw error;
    }
  }

  // Agents
  async getLoggedInAgents(campaigns?: string, userGroups?: string) {
    const params = new URLSearchParams();
    if (campaigns) params.append('campaigns', campaigns);
    if (userGroups) params.append('user_groups', userGroups);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/agents/logged-in${query}`);
  }

  async getAgentStatus(agentUser: string) {
    return this.request(`/agents/${agentUser}/status`);
  }

  async supervisorSpyAgent(username: string) {
    return this.request(`/supervisor/agents/${encodeURIComponent(username)}/spy`, {
      method: 'POST',
    });
  }

  async supervisorWhisperAgent(username: string) {
    return this.request(`/supervisor/agents/${encodeURIComponent(username)}/whisper`, {
      method: 'POST',
    });
  }

  async supervisorForceReadyAgent(username: string) {
    return this.request(`/supervisor/agents/${encodeURIComponent(username)}/force-ready`, {
      method: 'POST',
    });
  }

  async supervisorRemoteLogoutAgent(username: string) {
    return this.request(`/supervisor/agents/${encodeURIComponent(username)}/remote-logout`, {
      method: 'POST',
    });
  }

  // Health check
  async healthCheck() {
    // Health endpoint is on root, not /api
    const apiUrl = this.getApiUrl();
    const baseUrl = apiUrl.replace('/api', '');
    const response = await fetch(`${baseUrl}/health`);
    return response.json();
  }

  // Audio management
  async getAudioFiles() {
    return this.request('/audio');
  }

  async uploadAudio(file: File, campaign: string, isNodeUpload: boolean = false) {
    const formData = new FormData();
    formData.append('audio', file);
    formData.append('campaign', campaign);
    if (isNodeUpload) {
      formData.append('isNodeUpload', 'true');
    }

    const apiUrl = this.getApiUrl();
    const token = localStorage.getItem('auth-storage') ? JSON.parse(localStorage.getItem('auth-storage')!).state?.session?.token : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${apiUrl}/audio/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al subir archivo');
    }

    return response.json();
  }

  async deleteAudio(filename: string) {
    return this.request(`/audio/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
  }

  // Blacklist / DNC
  async getDncList(limit = 100, page = 1, search = '', campaignId?: string) {
    let url = `/dnc?limit=${limit}&page=${page}&search=${search}`;
    if (campaignId) url += `&campaign_id=${campaignId}`;
    return this.request(url);
  }

  async addDncNumber(phoneNumber: string, campaignId?: string) {
    return this.request('/dnc', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, campaign_id: campaignId || undefined }),
    });
  }

  async removeDncNumber(phoneNumber: string, campaignId?: string) {
    let url = `/dnc/${phoneNumber}`;
    if (campaignId) url += `?campaign_id=${campaignId}`;
    return this.request(url, {
      method: 'DELETE',
    });
  }

  async clearAllDncNumbers(campaignId?: string) {
    let url = '/dnc/all';
    if (campaignId) url += `?campaign_id=${campaignId}`;
    return this.request(url, {
      method: 'DELETE',
    });
  }

  async uploadDncFile(file: File, campaignId?: string) {
    const formData = new FormData();
    formData.append('file', file);
    if (campaignId) formData.append('campaign_id', campaignId);

    const apiUrl = this.getApiUrl();
    const response = await fetch(`${apiUrl}/dnc/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al subir archivo');
    }

    return response.json();
  }

  // DNC Smart Rules
  async getDncRules() {
    return this.request('/dnc/rules');
  }

  async createDncRule(data: { name: string; country_code: string; max_calls: number; period_hours: number; applies_to?: string }) {
    return this.request('/dnc/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateDncRule(id: number, data: { name?: string; country_code?: string; max_calls?: number; period_hours?: number; is_active?: boolean; applies_to?: string }) {
    return this.request(`/dnc/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteDncRule(id: number) {
    return this.request(`/dnc/rules/${id}`, {
      method: 'DELETE',
    });
  }

  async getAudioInfo(filename: string) {
    return this.request(`/audio/${encodeURIComponent(filename)}/info`);
  }
  getAudioStreamUrl(filename: string): string {
    return `${this.getApiUrl()}/audio/${filename}/stream`;
  }


  // CallerID Pools API
  async getCallerIdPools(limit = 50, page = 1, search = '') {
    return this.request(`/callerid-pools?limit=${limit}&page=${page}&search=${search}`);
  }

  async getCallerIdPool(id: number) {
    return this.request(`/callerid-pools/${id}`);
  }

  async createCallerIdPool(name: string, description?: string, country_code?: string) {
    return this.request('/callerid-pools', {
      method: 'POST',
      body: JSON.stringify({ name, description, country_code }),
    });
  }

  async updateCallerIdPool(id: number, data: { name?: string; description?: string; country_code?: string; is_active?: boolean }) {
    return this.request(`/callerid-pools/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCallerIdPool(id: number) {
    return this.request(`/callerid-pools/${id}`, {
      method: 'DELETE',
    });
  }

  async getPoolNumbers(poolId: number, limit = 100, page = 1, search = '') {
    return this.request(`/callerid-pools/${poolId}/numbers?limit=${limit}&page=${page}&search=${search}`);
  }

  async getPoolAreaCodes(poolId: number) {
    return this.request(`/callerid-pools/${poolId}/area-codes`);
  }

  async addPoolNumber(poolId: number, callerid: string) {
    return this.request(`/callerid-pools/${poolId}/numbers`, {
      method: 'POST',
      body: JSON.stringify({ callerid }),
    });
  }

  async importPoolNumbers(poolId: number, numbers: string) {
    return this.request(`/callerid-pools/${poolId}/import`, {
      method: 'POST',
      body: JSON.stringify({ numbers }),
    });
  }

  async uploadPoolNumbersFile(poolId: number, file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const apiUrl = this.getApiUrl();
    const response = await fetch(`${apiUrl}/callerid-pools/${poolId}/import`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al importar');
    }

    return response.json();
  }

  async deletePoolNumber(poolId: number, numberId: number) {
    return this.request(`/callerid-pools/${poolId}/numbers/${numberId}`, {
      method: 'DELETE',
    });
  }

  async togglePoolNumber(poolId: number, numberId: number, isActive: boolean) {
    return this.request(`/callerid-pools/${poolId}/numbers/${numberId}/toggle`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: isActive }),
    });
  }

  async getPoolLogs(poolId: number, limit = 100, offset = 0) {
    return this.request(`/callerid-pools/${poolId}/logs?limit=${limit}&offset=${offset}`);
  }

  // Schedules
  async getSchedules() {
    return this.request('/schedules');
  }

  async getUpcomingSchedules(start?: string, end?: string) {
    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);
    return this.request(`/schedules/upcoming?${params.toString()}`);
  }

  async createSchedule(data: {
    schedule_type: 'list' | 'campaign';
    target_id: string;
    target_name?: string;
    action: 'activate' | 'deactivate';
    scheduled_at: string;
    end_at?: string | null;
    recurring?: 'none' | 'daily' | 'weekly' | 'monthly';
  }) {
    return this.request('/schedules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSchedule(id: number, data: {
    scheduled_at?: string;
    end_at?: string | null;
    action?: 'activate' | 'deactivate';
    recurring?: 'none' | 'daily' | 'weekly' | 'monthly';
  }) {
    return this.request(`/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSchedule(id: number) {
    return this.request(`/schedules/${id}`, {
      method: 'DELETE',
    });
  }

  async getScheduleTargetCampaigns() {
    return this.request('/schedules/targets/campaigns');
  }

  async getScheduleTargetLists() {
    return this.request('/schedules/targets/lists');
  }

  // IVR Flows & Executions
  async getIvrNodeTypes() {
    return this.request('/ivr-flows/node-types');
  }

  async getIvrFlow(campaignId: string) {
    return this.request(`/ivr-flows/${campaignId}`);
  }

  async saveIvrFlow(campaignId: string, flow: any, is_active: boolean = true) {
    return this.request(`/ivr-flows/${campaignId}`, {
      method: 'PUT',
      body: JSON.stringify({ flow, is_active }),
    });
  }

  async getIvrExecutions(campaignId: string, limit = 50) {
    return this.request(`/ivr-flows/${campaignId}/executions?limit=${limit}`);
  }

  async getIvrExecutionDetail(id: number) {
    return this.request(`/ivr-flows/executions/${id}`);
  }

  // Trunks API
  async getTrunks() {
    return this.request('/trunks');
  }

  async getTrunkStatuses() {
    return this.request('/trunks/status');
  }

  async createTrunk(data: any) {
    return this.request('/trunks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTrunk(id: string, data: any) {
    return this.request(`/trunks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTrunk(id: string) {
    return this.request(`/trunks/${id}`, {
      method: 'DELETE',
    });
  }

  async reloadTrunks() {
    return this.request('/trunks/reload', {
      method: 'POST',
    });
  }

  // Users API
  async getUsers() {
    return this.request('/users');
  }

  async createUser(data: any) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: string, data: any) {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: string) {
    return this.request(`/users/${id}`, {
      method: 'DELETE',
    });
  }

  // User API Tokens
  async generateApiToken(userId: string) {
    return this.request(`/users/${userId}/api-token`, {
      method: 'POST',
    });
  }

  async revokeApiToken(userId: string) {
    return this.request(`/users/${userId}/api-token`, {
      method: 'DELETE',
    });
  }

  // User Campaigns Assignments
  async getUserCampaigns(userId: string) {
    return this.request(`/users/${userId}/campaigns`);
  }

  async updateUserCampaigns(userId: string, campaignIds: string[]) {
    return this.request(`/users/${userId}/campaigns`, {
      method: 'PUT',
      body: JSON.stringify({ campaign_ids: campaignIds }),
    });
  }

  // Roles & Permissions API
  async getRoles() {
    return this.request('/roles');
  }

  async createRole(role: string) {
    return this.request('/roles', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  }

  async deleteRole(role_id: number | string) {
    return this.request(`/roles/${role_id}`, {
      method: 'DELETE',
    });
  }

  async getRolePermissions() {
    return this.request('/roles/permissions');
  }

  async updateRolePermissions(role_id: number | string, permissions: string[]) {
    return this.request(`/roles/${role_id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    });
  }

  // Support Tickets API
  async getTickets(filters?: { status?: string; created_by?: string }) {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.created_by) params.append('created_by', filters.created_by);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/tickets${query}`);
  }

  async getTicket(id: number) {
    return this.request(`/tickets/${id}`);
  }

  async createTicket(data: { title: string; description: string; priority: string; cliente?: string; url?: string; pais?: string; telefono?: string; usuario?: string; }) {
    return this.request('/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async addTicketComment(ticketId: number, body: string) {
    return this.request(`/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  async addTicketAttachment(ticketId: number, file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const apiUrl = this.getApiUrl();
    let authHeaders: Record<string, string> = {};
    try {
      const authStr = localStorage.getItem('auth-storage');
      if (authStr) {
        const authData = JSON.parse(authStr);
        const token = authData?.state?.session?.token;
        if (token) authHeaders['Authorization'] = `Bearer ${token}`;
      }
    } catch (e) {
      // Ignore
    }

    const response = await fetch(`${apiUrl}/tickets/${ticketId}/attachments`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      let data;
      try { data = await response.json(); } catch (e) { }
      throw new Error(data?.error || 'Error subiendo archivo');
    }

    return response.json();
  }

  async updateTicketStatus(ticketId: number, status: string) {
    return this.request(`/tickets/${ticketId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // TTS Nodes API
  async getTTSNodes() {
    return this.request('/tts-nodes');
  }

  async getActiveTTSNodes() {
    return this.request('/tts-nodes/active');
  }

  async createTTSNode(data: { name: string; url: string; is_active?: boolean }) {
    return this.request('/tts-nodes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTTSNode(id: number, data: { name?: string; url?: string; is_active?: boolean }) {
    return this.request(`/tts-nodes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTTSNode(id: number) {
    return this.request(`/tts-nodes/${id}`, {
      method: 'DELETE',
    });
  }

  async getSwaggerDocs() {
    return this.request('/docs.json');
  }

  // --- Typifications (Tipificaciones) ---
  async getTypifications(campaignId: string) {
    return this.request(`/typifications/campaigns/${campaignId}/typifications`);
  }

  async createTypification(campaignId: string, data: { name: string; category?: string; form_id?: number | null; sort_order?: number }) {
    return this.request(`/typifications/campaigns/${campaignId}/typifications`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTypification(campaignId: string, typificationId: number, data: { name?: string; category?: string; form_id?: number | null; sort_order?: number; active?: boolean }) {
    return this.request(`/typifications/campaigns/${campaignId}/typifications/${typificationId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTypification(campaignId: string, typificationId: number) {
    return this.request(`/typifications/campaigns/${campaignId}/typifications/${typificationId}`, {
      method: 'DELETE',
    });
  }

  async getTypificationForms(campaignId: string) {
    return this.request(`/typifications/campaigns/${campaignId}/forms`);
  }

  async createTypificationForm(campaignId: string, data: { name: string; description?: string }) {
    return this.request(`/typifications/campaigns/${campaignId}/forms`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTypificationForm(campaignId: string, formId: number, data: { name?: string; description?: string }) {
    return this.request(`/typifications/campaigns/${campaignId}/forms/${formId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTypificationForm(campaignId: string, formId: number) {
    return this.request(`/typifications/campaigns/${campaignId}/forms/${formId}`, {
      method: 'DELETE',
    });
  }

  async getFormFields(campaignId: string, formId: number) {
    return this.request(`/typifications/campaigns/${campaignId}/forms/${formId}/fields`);
  }

  async createFormField(campaignId: string, formId: number, data: { field_name: string; field_label: string; field_type?: string; is_required?: boolean; options?: any; sort_order?: number }) {
    return this.request(`/typifications/campaigns/${campaignId}/forms/${formId}/fields`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateFormField(campaignId: string, formId: number, fieldId: number, data: any) {
    return this.request(`/typifications/campaigns/${campaignId}/forms/${formId}/fields/${fieldId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteFormField(campaignId: string, formId: number, fieldId: number) {
    return this.request(`/typifications/campaigns/${campaignId}/forms/${formId}/fields/${fieldId}`, {
      method: 'DELETE',
    });
  }

  async submitTypification(data: { call_log_id?: number; phone_number?: string; typification_id: number; campaign_id: string; form_data?: Record<string, string>; notes?: string }) {
    return this.request('/typifications/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCallLogTypification(logId: number) {
    return this.request(`/typifications/call-logs/${logId}/typification`);
  }

  // --- Dispositions (Disposiciones) ---
  async getCampaignDispositions(campaignId: string) {
    return this.request(`/dispositions/campaigns/${campaignId}/dispositions`);
  }

  async getDefaultDispositions(campaignId: string) {
    return this.request(`/dispositions/campaigns/${campaignId}/dispositions/defaults`);
  }

  async createDisposition(campaignId: string, data: { code: string; label: string; color?: string; sort_order?: number; conditions?: any; active?: boolean }) {
    return this.request(`/dispositions/campaigns/${campaignId}/dispositions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateDisposition(campaignId: string, id: number, data: { code?: string; label?: string; color?: string; sort_order?: number; conditions?: any; active?: boolean }) {
    return this.request(`/dispositions/campaigns/${campaignId}/dispositions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteDisposition(campaignId: string, id: number) {
    return this.request(`/dispositions/campaigns/${campaignId}/dispositions/${id}`, {
      method: 'DELETE',
    });
  }

  async reorderDispositions(campaignId: string, ids: number[]) {
    return this.request(`/dispositions/campaigns/${campaignId}/dispositions/reorder`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  async resetDispositionsToDefaults(campaignId: string) {
    return this.request(`/dispositions/campaigns/${campaignId}/dispositions/reset-defaults`, {
      method: 'POST',
    });
  }

  // --- Settings ---
  async getSettings() {
    return this.request('/api/settings');
  }

  async updateSettings(settings: Record<string, string>) {
    return this.request('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  // ── Reports module ───────────────────────────────────────────────────
  async getReportColumnCatalog() {
    return this.request('/reports/columns');
  }

  async listReportTemplates() {
    return this.request('/reports/templates');
  }

  async getReportTemplate(id: number) {
    return this.request(`/reports/templates/${id}`);
  }

  async createReportTemplate(payload: {
    name: string;
    description?: string;
    scope: 'multi_campaign' | 'single_campaign';
    definition: any;
    is_shared?: boolean;
  }) {
    return this.request('/reports/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateReportTemplate(id: number, payload: {
    name?: string;
    description?: string;
    scope?: 'multi_campaign' | 'single_campaign';
    definition?: any;
    is_shared?: boolean;
  }) {
    return this.request(`/reports/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteReportTemplate(id: number) {
    return this.request(`/reports/templates/${id}`, {
      method: 'DELETE',
    });
  }

  async runReportAdHoc(payload: {
    columns: string[];
    filters?: Record<string, any>;
    campaigns: string[];
    startDatetime: string;
    endDatetime: string;
    sort?: { by: string; dir: 'asc' | 'desc' };
    limit?: number;
  }) {
    return this.request('/reports/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async runReportTemplate(id: number, payload: {
    startDatetime: string;
    endDatetime: string;
    campaigns?: string[];
    limit?: number;
  }) {
    return this.request(`/reports/templates/${id}/run`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getDispositionSummary(payload: {
    campaigns: string[];
    startDatetime: string;
    endDatetime: string;
  }) {
    return this.request('/reports/system/disposition-summary', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getTemporalDistribution(payload: {
    campaigns: string[];
    startDatetime: string;
    endDatetime: string;
    granularity?: 'hour' | 'hour_of_day' | 'day' | 'day_of_week';
  }) {
    return this.request('/reports/system/temporal-distribution', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getAgentPauseSummary(payload: {
    campaigns: string[];
    startDatetime: string;
    endDatetime: string;
  }) {
    return this.request('/reports/system/agent-pause-summary', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getRouteRules(direction?: 'INBOUND' | 'OUTBOUND') {
    const q = direction ? `?direction=${encodeURIComponent(direction)}` : '';
    return this.request(`/routing/rules${q}`);
  }

  async getEffectiveOutboundTrunk(campaignId: string) {
    return this.request(`/routing/effective-outbound/${encodeURIComponent(campaignId)}`);
  }

  async previewRouteRule(did_number: string, trunk_id?: string | null) {
    return this.request('/routing/rules/preview', {
      method: 'POST',
      body: JSON.stringify({ did_number, trunk_id: trunk_id || null }),
    });
  }

  async checkRouteRuleCollision(payload: {
    direction: 'INBOUND' | 'OUTBOUND';
    match_did?: string | null;
    trunk_id?: string | null;
    match_campaign_id?: string | null;
    exclude_id?: number | null;
  }) {
    return this.request('/routing/rules/check-collision', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createRouteRule(payload: Record<string, unknown>) {
    return this.request('/routing/rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateRouteRule(id: number, payload: Record<string, unknown>) {
    return this.request(`/routing/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteRouteRule(id: number) {
    return this.request(`/routing/rules/${id}`, { method: 'DELETE' });
  }

  async moveRouteRule(id: number, direction: 'up' | 'down') {
    return this.request(`/routing/rules/${id}/move?direction=${direction}`, { method: 'PUT' });
  }

  async getRouteRuleAudit(id: number, limit = 50) {
    return this.request(`/routing/rules/${id}/audit?limit=${limit}`);
  }
}

const api = new ApiService();
export default api;
