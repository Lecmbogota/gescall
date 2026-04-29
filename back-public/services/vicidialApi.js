const axios = require('axios');
const http = require('http');
const https = require('https');
const config = require('../config/vicidial');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

class VicidialAPI {
  constructor() {
    this.baseUrl = config.apiUrl;
    this.user = config.apiUser;
    this.pass = config.apiPass;
    this.source = config.source;
  }

  /**
   * Make a request to Vicidial API
   */
  async request(params) {
    try {
      const defaultParams = {
        user: this.user,
        pass: this.pass,
        source: this.source,
      };

      const queryParams = new URLSearchParams({ ...defaultParams, ...params });

      // Determine correct API endpoint based on function
      let requestUrl = this.baseUrl;
      const agentApiFunctions = ['external_dial', 'ra_call', 'preview_dial_action', 'external_pause']; // Add others as needed

      if (agentApiFunctions.includes(params.function)) {
        // Switch to api.php (Agent API). Standard path is /agc/api.php vs /vicidial/non_agent_api.php
        if (requestUrl.includes('non_agent_api.php')) {
          requestUrl = requestUrl.replace('vicidial/non_agent_api.php', 'agc/api.php');
          // Fallback if 'vicidial' part isn't there or different
          if (requestUrl.includes('non_agent_api.php')) {
            requestUrl = requestUrl.replace('non_agent_api.php', 'api.php');
          }
        }
      }

      const url = `${requestUrl}?${queryParams.toString()}`;
      console.log(`[Vicidial API DEBUG] Full URL: ${url}`);

      console.log(`[Vicidial API] Request: ${params.function}`);

      const response = await axios.get(url, {
        timeout: 30000,
        httpAgent,
        httpsAgent,
      });

      return {
        success: !response.data.includes('ERROR:'),
        data: response.data,
        raw: response.data,
      };
    } catch (error) {
      console.error('[Vicidial API] Error:', error.message);
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }

  /**
   * Update list status
   */
  async updateListStatus(list_id, active) {
    return await this.request({
      function: 'update_list',
      list_id,
      active,
    });
  }

  /**
   * Add a new list
   */
  async addList({ list_id, list_name, campaign_id, active = 'Y', ...options }) {
    return await this.request({
      function: 'add_list',
      list_id,
      list_name,
      campaign_id,
      active,
      ...options,
    });
  }

  /**
   * Update a list
   */
  async updateList({ list_id, ...options }) {
    return await this.request({
      function: 'update_list',
      list_id,
      ...options,
    });
  }

  /**
   * Get list information
   */
  async getListInfo({ list_id, leads_counts = 'Y', dialable_count = 'Y', header = 'YES', stage = 'pipe' }) {
    return await this.request({
      function: 'list_info',
      list_id,
      leads_counts,
      dialable_count,
      header,
      stage,
    });
  }

  /**
   * Get all campaigns
   */
  async getCampaigns({ campaign_id = '', stage = 'pipe', header = 'YES' }) {
    return await this.request({
      function: 'campaigns_list',
      campaign_id,
      stage,
      header,
    });
  }

  /**
   * Add a new lead
   */
  async addLead({
    phone_number,
    phone_code = '1',
    list_id,
    first_name = '',
    last_name = '',
    ...options
  }) {
    return await this.request({
      function: 'add_lead',
      phone_number,
      phone_code,
      list_id,
      first_name,
      last_name,
      ...options,
    });
  }

  /**
   * Update a lead
   */
  async updateLead({ lead_id, ...options }) {
    return await this.request({
      function: 'update_lead',
      lead_id,
      ...options,
    });
  }

  /**
   * Search for leads
   */
  async searchLeads({ phone_number, records = 1000, header = 'YES' }) {
    return await this.request({
      function: 'lead_search',
      phone_number,
      records,
      header,
    });
  }

  /**
   * Get all lead information
   */
  async getLeadAllInfo({ lead_id, custom_fields = 'N', stage = 'pipe', header = 'YES' }) {
    return await this.request({
      function: 'lead_all_info',
      lead_id,
      custom_fields,
      stage,
      header,
    });
  }

  /**
   * Get logged in agents
   */
  async getLoggedInAgents({ campaigns = '', user_groups = '', show_sub_status = 'YES', stage = 'pipe', header = 'YES' }) {
    return await this.request({
      function: 'logged_in_agents',
      campaigns,
      user_groups,
      show_sub_status,
      stage,
      header,
    });
  }

  /**
   * Get agent status
   */
  async getAgentStatus({ agent_user, stage = 'pipe', header = 'YES', include_ip = 'YES' }) {
    return await this.request({
      function: 'agent_status',
      agent_user,
      stage,
      header,
      include_ip,
    });
  }

  /**
   * Get hopper list
   */
  async getHopperList({ campaign_id, stage = 'pipe', header = 'YES' }) {
    return await this.request({
      function: 'hopper_list',
      campaign_id,
      stage,
      header,
    });
  }

  /**
   * Get user group status
   */
  async getUserGroupStatus({ user_groups, stage = 'pipe', header = 'YES' }) {
    return await this.request({
      function: 'user_group_status',
      user_groups,
      stage,
      header,
    });
  }

  /**
   * Get in-group status
   */
  async getInGroupStatus({ in_groups, stage = 'pipe', header = 'YES' }) {
    return await this.request({
      function: 'in_group_status',
      in_groups,
      stage,
      header,
    });
  }

  /**
   * Get call status stats
   */
  async getCallStatusStats({ campaigns, query_date = '', ingroups = '', statuses = '' }) {
    return await this.request({
      function: 'call_status_stats',
      campaigns,
      query_date,
      ingroups,
      statuses,
    });
  }

  /**
   * Get user details
   */
  async getUserDetails({ user, stage = 'pipe', header = 'YES' }) {
    return await this.request({
      function: 'user_details',
      user,
      stage,
      header,
    });
  }

  /**
   * Get agent campaigns
   */
  async getAgentCampaigns({ user, stage = 'pipe', header = 'YES' }) {
    return await this.request({
      function: 'agent_campaigns',
      user,
      stage,
      header,
    });
  }

  /**
   * Add a new user
   */
  async addUser({
    agent_user,
    agent_pass,
    agent_user_level,
    agent_full_name,
    agent_user_group,
    phone_login = '',
    phone_pass = '',
    hotkeys_active = '1',
    voicemail_id = '',
    email = '',
    ...options
  }) {
    return await this.request({
      function: 'add_user',
      agent_user,
      agent_pass,
      agent_user_level,
      agent_full_name,
      agent_user_group,
      phone_login,
      phone_pass,
      hotkeys_active,
      voicemail_id,
      email,
      ...options,
    });
  }

  /**
   * External dial (force agent to dial)
   */
  async externalDial({
    agent_user,
    phone_number,
    phone_code = '1',
    search = 'YES',
    preview = 'NO',
    focus = 'YES',
    vendor_id = '',
    dial_prefix = '',
    group_alias = '',
    vtiger_callback = 'NO',
    lead_id = '',
    alt_user = '',
    alt_dial = 'NO',
    options = {},
  }) {
    // external_dial function arguments according to Vicidial API docs
    return await this.request({
      function: 'external_dial',
      value: agent_user,
      agent_user, // Add explicit agent_user param as some versions require it
      phone_code,
      search,
      preview,
      focus,
      vendor_id,
      phone_number,
      dial_prefix,
      group_alias,
      vtiger_callback,
      lead_id,
      alt_user,
      alt_dial,
      ...options,
    });
  }

  /**
   * External pause (pause agent)
   */
  async externalPause({ agent_user, value = 'PAUSE', ...options }) {
    return await this.request({
      function: 'external_pause',
      value,
      agent_user,
      ...options,
    });
  }

  /**
   * Custom Dialer via gescall_dialer.php (Bypasses Agent Screen requirement)
   */
  async customDial({ phone_number, caller_id, speech, pass = 'TEcnologia2020' }) {
    try {
      // Force correct path /agc/gescall_dialer.php on the same host
      let urlStr = this.baseUrl;
      if (!urlStr.startsWith('http')) {
        urlStr = `http://${urlStr}`;
      }
      const urlObj = new URL(urlStr);
      let targetUrl = `${urlObj.protocol}//${urlObj.host}/agc/gescall_dialer.php?pass=${pass}&phone_number=${phone_number}`;

      if (caller_id) {
        targetUrl += `&caller_id=${encodeURIComponent(caller_id)}`;
      }
      if (speech) {
        targetUrl += `&speech=${encodeURIComponent(speech)}`;
      }

      console.log(`[Vicidial API] Custom Dial Request: ${targetUrl}`);

      const response = await axios.get(targetUrl, {
        timeout: 10000,
        httpAgent,
        httpsAgent,
      });

      return {
        success: response.data.success,
        data: response.data,
        message: response.data.message
      };
    } catch (error) {
      console.error('[Vicidial API] Custom Dial Error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Parse pipe-delimited response with headers
   */
  parseResponse(rawData, delimiter = '|') {
    const lines = rawData.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(delimiter);
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }

    return data;
  }
}

module.exports = new VicidialAPI();
