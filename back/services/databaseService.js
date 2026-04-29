const database = require('../config/database');
const pgDatabase = require('./../config/pgDatabase');

class DatabaseService {
  /**
   * Get dial log by campaign and date range (Vicibroker query)
   * @param {string[]} campaigns - Array of campaign IDs
   * @param {string} startDatetime - Start datetime (YYYY-MM-DD HH:MM:SS)
   * @param {string} endDatetime - End datetime (YYYY-MM-DD HH:MM:SS)
   * @param {number} limit - Max rows to return
   * @returns {Promise<Array>}
   */
  async getDialLogByCampaignDateRange(campaigns, startDatetime, endDatetime) {
    if (!campaigns || campaigns.length === 0) {
      return [];
    }

    const placeholders = campaigns.map(() => '?').join(',');
    const sql = `
      SELECT
          vdl.call_date,
          vl.phone_number,
          vl.status,
          vl.list_id,
          vls.list_name,
          vls.list_description,
          vls.campaign_id,
          vdl.caller_code,
          vdl.outbound_cid,
          vl.called_count as attempts,
          CASE 
            WHEN vdl.context LIKE 'DTMF:%' THEN SUBSTRING(vdl.context, 6)
            ELSE NULL
          END as dtmf_response
      FROM vicidial_dial_log vdl
      LEFT JOIN vicidial_list vl ON vdl.lead_id = vl.lead_id
      LEFT JOIN vicidial_lists vls ON vl.list_id = vls.list_id
      WHERE vdl.call_date BETWEEN ? AND ?
        AND vls.campaign_id IN (${placeholders})
      ORDER BY vdl.call_date ASC
    `;

    const params = [startDatetime, endDatetime, ...campaigns];
    return await database.query(sql, params);
  }

  /**
   * Get status summary by list (Vicibroker query)
   * @param {string[]} campaigns - Array of campaign IDs
   * @param {string} startDatetime - Start datetime (YYYY-MM-DD HH:MM:SS)
   * @param {string} endDatetime - End datetime (YYYY-MM-DD HH:MM:SS)
   * @param {number} limit - Max rows to return
   * @returns {Promise<Array>}
   */
  async getStatusSummaryByList(campaigns, startDatetime, endDatetime) {
    if (!campaigns || campaigns.length === 0) {
      return [];
    }

    const placeholders = campaigns.map(() => '?').join(',');
    const sql = `
      SELECT
          vls.campaign_id,
          vl.list_id,
          vls.list_name,
          vl.status,
          COUNT(*) as total
      FROM vicidial_dial_log vdl
      INNER JOIN vicidial_list vl ON vdl.lead_id = vl.lead_id
      INNER JOIN vicidial_lists vls ON vl.list_id = vls.list_id
      WHERE vdl.call_date BETWEEN ? AND ?
        AND vls.campaign_id IN (${placeholders})
      GROUP BY vls.campaign_id, vl.list_id, vls.list_name, vl.status
      ORDER BY vls.campaign_id, vl.list_id, vl.status
    `;

    const params = [startDatetime, endDatetime, ...campaigns];
    return await database.query(sql, params);
  }

  /**
   * Get campaign progress by list (Vicibroker query)
   * @param {string[]} campaigns - Array of campaign IDs
   * @param {string} startDatetime - Start datetime (YYYY-MM-DD HH:MM:SS)
   * @param {string} endDatetime - End datetime (YYYY-MM-DD HH:MM:SS)
   * @param {number} limit - Max rows to return
   * @returns {Promise<Array>}
   */
  async getCampaignProgressByList(campaigns, startDatetime, endDatetime) {
    if (!campaigns || campaigns.length === 0) {
      return [];
    }

    const placeholders = campaigns.map(() => '?').join(',');
    const sql = `
      SELECT
          vls.campaign_id,
          vl.list_id,
          vls.list_name,
          SUM(CASE WHEN vl.status = 'AA' THEN 1 ELSE 0 END) as AA,
          SUM(CASE WHEN vl.status = 'NA' THEN 1 ELSE 0 END) as NA,
          SUM(CASE WHEN vl.status = 'NEW' THEN 1 ELSE 0 END) as NEW,
          SUM(CASE WHEN vl.status = 'PDROP' THEN 1 ELSE 0 END) as PDROP,
          SUM(CASE WHEN vl.status = 'PM' THEN 1 ELSE 0 END) as PM,
          SUM(CASE WHEN vl.status = 'PU' THEN 1 ELSE 0 END) as PU,
          SUM(CASE WHEN vl.status = 'SVYEXT' THEN 1 ELSE 0 END) as SVYEXT,
          COUNT(*) as TOTAL
      FROM vicidial_dial_log vdl
      INNER JOIN vicidial_list vl ON vdl.lead_id = vl.lead_id
      INNER JOIN vicidial_lists vls ON vl.list_id = vls.list_id
      WHERE vdl.call_date BETWEEN ? AND ?
        AND vls.campaign_id IN (${placeholders})
      GROUP BY vls.campaign_id, vl.list_id, vls.list_name
      ORDER BY vls.campaign_id, vl.list_id
    `;

    const params = [startDatetime, endDatetime, ...campaigns];
    return await database.query(sql, params);
  }

  /**
   * Get campaigns status (Vicibroker query)
   * @param {string[]} campaigns - Array of campaign IDs
   * @param {number} limit - Max rows to return
   * @returns {Promise<Array>}
   */
  async getCampaignsStatus(campaigns) {
    if (!campaigns || campaigns.length === 0) {
      return [];
    }

    const placeholders = campaigns.map(() => '?').join(',');
    const sql = `
      SELECT
          campaign_id,
          campaign_name,
          CASE
              WHEN active = 'Y' THEN 'Activa'
              WHEN active = 'N' THEN 'Inactiva'
              ELSE 'Pausada'
          END as estado
      FROM vicidial_campaigns
      WHERE campaign_id IN (${placeholders})
      ORDER BY campaign_name
    `;

    const params = [...campaigns];
    return await database.query(sql, params);
  }

  /**
   * Get lists count by campaign (Vicibroker query)
   * @param {string[]} campaigns - Array of campaign IDs
   * @param {number} limit - Max rows to return
   * @returns {Promise<Array>}
   */
  async getListsCountByCampaign(campaigns) {
    if (!campaigns || campaigns.length === 0) {
      return [];
    }

    const placeholders = campaigns.map(() => '?').join(',');
    const sql = `
      SELECT
          campaign_id,
          COUNT(*) as cantidad_listas
      FROM vicidial_lists
      WHERE campaign_id IN (${placeholders})
      GROUP BY campaign_id
    `;

    const params = [...campaigns];
    return await database.query(sql, params);
  }

  /**
   * Get progress for a single campaign (Vicibroker query)
   * @param {string} campaign - Campaign ID (scalar, not array)
   * @param {number} limit - Max rows to return
   * @returns {Promise<Object>}
   */
  async getProgressForSingleCampaign(campaign) {
    const sql = `
      SELECT
          vls.campaign_id,
          COUNT(*) as total,
          CAST(SUM(CASE WHEN vl.called_count > 0 THEN 1 ELSE 0 END) AS UNSIGNED) as avance,
          ROUND((SUM(CASE WHEN vl.called_count > 0 THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as porcentaje
      FROM vicidial_list vl
      INNER JOIN vicidial_lists vls ON vl.list_id = vls.list_id
      WHERE vls.campaign_id = ? AND vls.active = 'Y'
      GROUP BY vls.campaign_id
    `;

    const results = await database.query(sql, [campaign]);
    return results[0] || null;
  }

  /**
   * Get dashboard statistics
   * @returns {Promise<Object>}
   */
  async getDashboardStats() {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM vicidial_live_agents WHERE status != 'LOGOUT') as active_agents,
        (SELECT COUNT(*) FROM vicidial_auto_calls WHERE status = 'LIVE') as active_calls,
        (SELECT COUNT(DISTINCT vc.campaign_id) FROM vicidial_campaigns vc LEFT JOIN gescall_campaign_status gcs ON vc.campaign_id = gcs.campaign_id WHERE vc.active = 'Y' AND COALESCE(gcs.is_deleted, 0) = 0) as active_campaigns,
        (SELECT COUNT(*)
         FROM vicidial_list vl
         INNER JOIN vicidial_lists vls ON vl.list_id = vls.list_id
         WHERE vls.active = 'Y' AND (vl.called_count = 0 OR vl.called_count IS NULL)
        ) as pending_leads,
        (SELECT COUNT(*) FROM vicidial_log WHERE call_date >= CURDATE()) as calls_today,
        (SELECT COUNT(*) FROM vicidial_log WHERE status = 'SALE' AND call_date >= CURDATE()) as sales_today,
        (SELECT AVG(length_in_sec) FROM vicidial_log WHERE call_date >= CURDATE() AND length_in_sec > 0) as avg_talk_time_today,
        (SELECT COUNT(*)
         FROM vicidial_list vl
         INNER JOIN vicidial_lists vls ON vl.list_id = vls.list_id
         WHERE vls.active = 'Y'
        ) as total_leads_active_lists
    `;

    const results = await database.query(sql);
    const stats = results[0] || {};

    // Calculate conversion rate
    stats.conversion_rate = stats.calls_today > 0
      ? ((stats.sales_today / stats.calls_today) * 100).toFixed(2)
      : 0;

    // Calculate calls per agent
    stats.calls_per_agent = stats.active_agents > 0
      ? Math.round(stats.calls_today / stats.active_agents)
      : 0;

    return stats;
  }

  /**
   * Get active agents with their current status
   * @returns {Promise<Array>}
   */
  async getActiveAgents() {
    const sql = `
      SELECT
        vla.user,
        vla.conf_exten,
        vla.status,
        vla.server_ip,
        vla.campaign_id,
        vla.extension,
        vla.callerid,
        vla.uniqueid,
        vla.channel,
        vla.call_server_ip,
        vla.last_call_time,
        vla.last_state_change,
        vla.lead_id,
        vla.comments,
        vla.calls_today,
        vla.pause_code,
        vu.full_name,
        vu.user_level,
        vu.user_group
      FROM vicidial_live_agents vla
      LEFT JOIN vicidial_users vu ON vla.user = vu.user
      WHERE vla.status != 'LOGOUT'
      ORDER BY vla.last_state_change DESC
    `;

    return await database.query(sql);
  }

  /**
   * Get all campaigns with detailed info
   * @returns {Promise<Array>}
   */
  async getAllCampaigns() {
    const sql = `
      SELECT
        vc.campaign_id,
        vc.campaign_name,
        vc.campaign_description,
        vc.active,
        vc.dial_method,
        vc.auto_dial_level,
        vc.dial_timeout,
        vc.dial_prefix,
        vc.campaign_cid,
        vc.park_ext,
        vc.park_file_name,
        vc.web_form_address,
        vc.allow_closers,
        vc.hopper_level,
        vc.auto_alt_dial,
        vc.use_internal_dnc,
        vc.use_campaign_dnc,
        vc.lead_order,
        vc.lead_filter_id,
        ccs.rotation_mode as callerid_rotation_mode
      FROM vicidial_campaigns vc
      LEFT JOIN gescall_campaign_callerid_settings ccs ON vc.campaign_id = ccs.campaign_id
      LEFT JOIN gescall_campaign_status gcs ON vc.campaign_id = gcs.campaign_id
      WHERE COALESCE(gcs.is_deleted, 0) = 0
      ORDER BY vc.campaign_id
    `;

    return await database.query(sql);
  }

  /**
   * Get campaign by ID
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Object|null>}
   */
  async getCampaignById(campaignId) {
    const sql = `
      SELECT
        vc.campaign_id,
        vc.campaign_name,
        vc.campaign_description,
        vc.active,
        vc.dial_method,
        vc.auto_dial_level,
        vc.dial_timeout,
        vc.dial_prefix,
        vc.campaign_cid,
        vc.park_ext,
        vc.park_file_name,
        vc.web_form_address,
        vc.allow_closers,
        vc.hopper_level,
        vc.auto_alt_dial,
        vc.use_internal_dnc,
        vc.use_campaign_dnc,
        vc.lead_order,
        vc.lead_filter_id,
        vc.dial_status_a,
        vc.dial_status_b,
        vc.dial_status_c,
        vc.dial_status_d,
        vc.dial_status_e,
        ccs.rotation_mode as callerid_rotation_mode
      FROM vicidial_campaigns vc
      LEFT JOIN gescall_campaign_callerid_settings ccs ON vc.campaign_id = ccs.campaign_id
      LEFT JOIN gescall_campaign_status gcs ON vc.campaign_id = gcs.campaign_id
      WHERE vc.campaign_id = ? AND COALESCE(gcs.is_deleted, 0) = 0
    `;

    const results = await database.query(sql, [campaignId]);
    return results[0] || null;
  }

  /**
   * Get multiple campaigns by IDs
   * @param {string[]} campaignIds - Array of campaign IDs
   * @returns {Promise<Array>}
   */
  async getCampaignsByIds(campaignIds) {
    if (!campaignIds || campaignIds.length === 0) {
      return [];
    }

    const placeholders = campaignIds.map(() => '?').join(',');
    const sql = `
      SELECT
        vc.campaign_id,
        vc.campaign_name,
        vc.campaign_description,
        vc.active,
        vc.dial_method,
        vc.auto_dial_level,
        vc.dial_timeout,
        vc.dial_prefix,
        vc.campaign_cid,
        vc.park_ext,
        vc.park_file_name,
        vc.web_form_address,
        vc.allow_closers,
        vc.hopper_level,
        vc.auto_alt_dial,
        vc.use_internal_dnc,
        vc.use_campaign_dnc,
        vc.lead_order,
        vc.lead_filter_id,
        ccs.rotation_mode as callerid_rotation_mode,
        COALESCE((SELECT 1 FROM vicidial_dnc LIMIT 1), 0) as global_dnc_exists,
        COALESCE((SELECT 1 FROM vicidial_campaign_dnc WHERE campaign_id = vc.campaign_id LIMIT 1), 0) as campaign_dnc_exists
      FROM vicidial_campaigns vc
      LEFT JOIN gescall_campaign_callerid_settings ccs ON vc.campaign_id = ccs.campaign_id
      LEFT JOIN gescall_campaign_status gcs ON vc.campaign_id = gcs.campaign_id
      WHERE vc.campaign_id IN (${placeholders}) AND COALESCE(gcs.is_deleted, 0) = 0
      ORDER BY vc.campaign_id
    `;

    return await database.query(sql, campaignIds);
  }

  /**
   * Update campaign status (active field)
   * @param {string} campaignId
   * @param {string} status - 'Y' for active, 'N' for inactive
   * @returns {Promise<Object>}
   */
  async updateCampaignStatus(campaignId, status) {
    const sql = `UPDATE vicidial_campaigns SET active = ? WHERE campaign_id = ?`;
    const result = await database.query(sql, [status, campaignId]);
    return { success: true, affectedRows: result.affectedRows };
  }

  /**
   * Start a campaign (set active = 'Y')
   * @param {string} campaignId
   * @returns {Promise<Object>}
   */
  async startCampaign(campaignId) {
    return this.updateCampaignStatus(campaignId, 'Y');
  }

  /**
   * Stop a campaign (set active = 'N')
   * @param {string} campaignId
   * @returns {Promise<Object>}
   */
  async stopCampaign(campaignId) {
    return this.updateCampaignStatus(campaignId, 'N');
  }

  /**
   * Update campaign dial level
   * @param {string} campaignId
   * @param {number|string} dialLevel
   * @returns {Promise<Object>}
   */
  async updateCampaignDialLevel(campaignId, dialLevel) {
    const sql = `UPDATE vicidial_campaigns SET auto_dial_level = ? WHERE campaign_id = ?`;
    const result = await database.query(sql, [dialLevel, campaignId]);
    return { success: true, affectedRows: result.affectedRows };
  }

  /**
   * Get all lists
   * @returns {Promise<Array>}
   */
  async getAllLists() {
    const sql = `
      SELECT
        list_id,
        list_name,
        campaign_id,
        active,
        list_description,
        list_changedate,
        list_lastcalldate,
        reset_time,
        expiration_date,
        web_form_address,
        web_form_address_two
      FROM vicidial_lists
      ORDER BY list_id DESC
    `;

    return await database.query(sql);
  }

  /**
   * Get the next available list ID (max + 1), with minimum of 1000000
   * @returns {Promise<number>}
   */
  async getNextListId() {
    const sql = `
      SELECT COALESCE(MAX(list_id), 999999) + 1 as next_id
      FROM vicidial_lists
    `;

    const results = await database.query(sql);
    const nextId = results[0]?.next_id || 1000000;
    // Ensure minimum of 1000000 for Vicidial compatibility
    return Math.max(nextId, 1000000);
  }

  /**
   * Get lists by campaign
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Array>}
   */
  async getListsByCampaign(campaignId) {
    const sql = `
      SELECT
        vls.list_id,
        vls.list_name,
        vls.campaign_id,
        vls.active,
        vls.list_description,
        vls.list_changedate,
        vls.list_lastcalldate,
        vls.reset_time,
        vls.expiration_date,
        COUNT(DISTINCT vl.lead_id) as total_leads,
        SUM(CASE WHEN vl.called_count = 0 OR vl.called_count IS NULL THEN 1 ELSE 0 END) as leads_new,
        SUM(CASE WHEN vl.called_count > 0 THEN 1 ELSE 0 END) as leads_contacted,
        SUM(CASE WHEN vl.status = 'DNC' THEN 1 ELSE 0 END) as leads_dnc
      FROM vicidial_lists vls
      LEFT JOIN vicidial_list vl ON vls.list_id = vl.list_id
      WHERE vls.campaign_id = ?
      GROUP BY vls.list_id, vls.list_name, vls.campaign_id, vls.active,
               vls.list_description, vls.list_changedate, vls.list_lastcalldate,
               vls.reset_time, vls.expiration_date
      ORDER BY vls.list_id DESC
    `;

    return await database.query(sql, [campaignId]);
  }

  /**
   * Get campaign statistics and progress overview
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Object>}
   */
  async getCampaignStats(campaignId) {
    const sql = `
      SELECT
        vc.campaign_id,
        vc.campaign_name,
        vc.active,
        COUNT(DISTINCT vl.lead_id) as total_leads,
        SUM(CASE WHEN vl.status = 'NEW' THEN 1 ELSE 0 END) as leads_new,
        SUM(CASE WHEN vl.status IN ('PU', 'PM', 'SVYEXT', 'SALE', 'DNC', 'NI', 'DC', 'ADC', 'SVYHU', 'SVYVM') THEN 1 ELSE 0 END) as leads_processed,
        SUM(CASE WHEN vl.status = 'AA' THEN 1 ELSE 0 END) as leads_answered,
        SUM(CASE WHEN vl.status = 'NA' THEN 1 ELSE 0 END) as leads_no_answer,
        SUM(CASE WHEN vl.status = 'PDROP' THEN 1 ELSE 0 END) as leads_drop,
        COUNT(DISTINCT vls.list_id) as total_lists
      FROM vicidial_campaigns vc
      LEFT JOIN vicidial_lists vls ON vc.campaign_id = vls.campaign_id AND vls.active = 'Y'
      LEFT JOIN vicidial_list vl ON vls.list_id = vl.list_id
      WHERE vc.campaign_id = ?
      GROUP BY vc.campaign_id, vc.campaign_name, vc.active
    `;

    const results = await database.query(sql, [campaignId]);
    return results[0] || null;
  }

  /**
   * Get campaign progress by status (detailed breakdown)
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Array>}
   */
  async getCampaignProgressByStatus(campaignId) {
    const sql = `
      SELECT
        vl.status,
        vss.status_name,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER()), 2) as percentage
      FROM vicidial_list vl
      INNER JOIN vicidial_lists vls ON vl.list_id = vls.list_id
      LEFT JOIN vicidial_statuses vss ON vl.status = vss.status
      WHERE vls.campaign_id = ?
      GROUP BY vl.status, vss.status_name
      ORDER BY count DESC
    `;

    return await database.query(sql, [campaignId]);
  }

  /**
   * Get campaign progress by list with detailed stats
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Array>}
   */
  async getCampaignListsProgress(campaignId) {
    const sql = `
      SELECT
        vls.list_id,
        vls.list_name,
        vls.active,
        COUNT(vl.lead_id) as total_leads,
        SUM(CASE WHEN vl.status = 'NEW' THEN 1 ELSE 0 END) as leads_new,
        SUM(CASE WHEN vl.status IN ('PU', 'PM', 'SVYEXT', 'SALE', 'DNC', 'NI', 'DC', 'ADC', 'SVYHU', 'SVYVM') THEN 1 ELSE 0 END) as leads_processed,
        SUM(CASE WHEN vl.status = 'AA' THEN 1 ELSE 0 END) as leads_answered,
        SUM(CASE WHEN vl.status = 'NA' THEN 1 ELSE 0 END) as leads_no_answer,
        SUM(CASE WHEN vl.status = 'PDROP' THEN 1 ELSE 0 END) as leads_drop,
        SUM(CASE WHEN vl.called_count > 0 THEN 1 ELSE 0 END) as leads_called,
        ROUND((SUM(CASE WHEN vl.status IN ('PU', 'PM', 'SVYEXT', 'SALE', 'DNC', 'NI', 'DC', 'ADC', 'SVYHU', 'SVYVM') THEN 1 ELSE 0 END) * 100.0 / COUNT(vl.lead_id)), 2) as progress_percentage
      FROM vicidial_lists vls
      LEFT JOIN vicidial_list vl ON vls.list_id = vl.list_id
      WHERE vls.campaign_id = ?
      GROUP BY vls.list_id, vls.list_name, vls.active
      ORDER BY vls.list_id
    `;

    return await database.query(sql, [campaignId]);
  }

  /**
   * Get campaign call activity (today)
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Object>}
   */
  async getCampaignCallActivity(campaignId) {
    const sql = `
      SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'SALE' THEN 1 ELSE 0 END) as sales,
        SUM(CASE WHEN status IN ('A', 'XFER') THEN 1 ELSE 0 END) as transfers,
        SUM(CASE WHEN status = 'DROP' THEN 1 ELSE 0 END) as drops,
        SUM(CASE WHEN status = 'NA' THEN 1 ELSE 0 END) as no_answer,
        SUM(CASE WHEN status = 'B' THEN 1 ELSE 0 END) as busy,
        SUM(length_in_sec) as total_talk_time,
        AVG(CASE WHEN length_in_sec > 0 THEN length_in_sec ELSE NULL END) as avg_talk_time,
        COUNT(DISTINCT user) as active_agents
      FROM vicidial_log
      WHERE campaign_id = ?
        AND call_date >= CURDATE()
    `;

    const results = await database.query(sql, [campaignId]);
    return results[0] || null;
  }

  /**
   * Get campaign hourly activity (today)
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Array>}
   */
  async getCampaignHourlyActivity(campaignId) {
    const sql = `
      SELECT
        HOUR(call_date) as hour,
        COUNT(*) as calls,
        SUM(CASE WHEN status = 'SALE' THEN 1 ELSE 0 END) as sales,
        SUM(CASE WHEN length_in_sec > 0 THEN length_in_sec ELSE 0 END) as talk_time
      FROM vicidial_log
      WHERE campaign_id = ?
        AND call_date >= CURDATE()
      GROUP BY HOUR(call_date)
      ORDER BY hour
    `;

    return await database.query(sql, [campaignId]);
  }

  /**
   * Get campaign agents performance
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Array>}
   */
  async getCampaignAgentsPerformance(campaignId) {
    const sql = `
      SELECT
        vlog.user,
        vu.full_name,
        COUNT(*) as total_calls,
        SUM(CASE WHEN vlog.status = 'SALE' THEN 1 ELSE 0 END) as sales,
        SUM(CASE WHEN vlog.status IN ('A', 'XFER') THEN 1 ELSE 0 END) as transfers,
        SUM(vlog.length_in_sec) as total_talk_time,
        AVG(CASE WHEN vlog.length_in_sec > 0 THEN vlog.length_in_sec ELSE NULL END) as avg_talk_time,
        ROUND((SUM(CASE WHEN vlog.status = 'SALE' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as conversion_rate
      FROM vicidial_log vlog
      LEFT JOIN vicidial_users vu ON vlog.user = vu.user
      WHERE vlog.campaign_id = ?
        AND vlog.call_date >= CURDATE()
      GROUP BY vlog.user, vu.full_name
      HAVING total_calls > 0
      ORDER BY sales DESC, total_calls DESC
    `;

    return await database.query(sql, [campaignId]);
  }

  /**
   * Execute custom query (use with caution)
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>}
   */
  async executeQuery(sql, params = []) {
    return await database.query(sql, params);
  }

  /**
   * Get campaigns summary with metrics
   * Returns comprehensive campaign metrics including leads, contacted, success rates, and active agents
   * @param {string[]} campaigns - Optional array of campaign IDs to filter
   * @returns {Promise<Array>}
   */
  async getCampaignsSummary(campaigns = null) {


    const params = campaigns && campaigns.length > 0 ? campaigns : [];

    // Security Fix: If campaigns argument is provided (as array) but empty, 
    // it means "filter by these IDs" (which are none), so return nothing.
    // We only return "All" if campaigns is null/undefined (legacy behavior)
    if (campaigns && Array.isArray(campaigns) && campaigns.length === 0) {
      return [];
    }

    const sql = `
      SELECT
        vc.campaign_id,
        vc.campaign_name,
        vc.active,
        COALESCE(leads.total_leads, 0) AS total_leads,
        COALESCE(dispo.contactados, 0) AS contactados,
        COALESCE(dispo.exitosos, 0) AS exitosos,
        (COALESCE(leads.total_leads, 0) - COALESCE(dispo.contactados, 0)) AS pendientes,
        ROUND((COALESCE(dispo.contactados, 0) / NULLIF(leads.total_leads, 0)) * 100, 2) AS progreso_pct,
        ROUND((COALESCE(dispo.exitosos, 0) / NULLIF(dispo.contactados, 0)) * 100, 2) AS tasa_exito_pct,
        (SELECT COUNT(*)
         FROM vicidial_live_agents vla
         WHERE vla.campaign_id = vc.campaign_id) AS agentes_activos
      FROM vicidial_campaigns vc
      -- Subquery: total de leads por campaña
      LEFT JOIN (
        SELECT
          vlst.campaign_id,
          COUNT(*) AS total_leads
        FROM vicidial_list l
        JOIN vicidial_lists vlst ON l.list_id = vlst.list_id
        WHERE l.status NOT IN ('DC', 'DNC', 'XFER') AND vlst.active = 'Y'
        GROUP BY vlst.campaign_id
      ) leads ON leads.campaign_id = vc.campaign_id
      -- Subquery: contactados y exitosos (solo de hoy)
      LEFT JOIN (
        SELECT
          vlst.campaign_id,
          SUM(CASE WHEN vl.status IS NOT NULL AND vl.status <> '' THEN 1 ELSE 0 END) AS contactados,
          SUM(CASE WHEN vl.status IN ('SALE', 'PU', 'PM') THEN 1 ELSE 0 END) AS exitosos
        FROM vicidial_log vl
        JOIN vicidial_lists vlst ON vl.list_id = vlst.list_id
        WHERE vl.call_date >= CURDATE() AND vlst.active = 'Y'
        GROUP BY vlst.campaign_id
      ) dispo ON dispo.campaign_id = vc.campaign_id
      ${campaigns && campaigns.length > 0 ? `WHERE vc.campaign_id IN (${campaigns.map(() => '?').join(',')})` : ''}
      ORDER BY vc.campaign_name
    `;

    return await database.query(sql, params);
  }

  /**
   * Get leads by list ID with pagination
   * @param {string} listId - List ID
   * @param {number} limit - Max rows to return
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>}
   */
  async getLeadsByListId(listId, limit = 100, offset = 0) {
    const sql = `
      SELECT
        vl.lead_id,
        vl.phone_number,
        vl.vendor_lead_code,
        vl.status,
        vl.first_name,
        vl.last_name,
        vl.called_count,
        vl.last_local_call_time,
        vl.entry_date,
        vl.modify_date
      FROM vicidial_list vl
      WHERE vl.list_id = ?
      ORDER BY vl.lead_id DESC
      LIMIT ? OFFSET ?
    `;

    return await database.query(sql, [listId, limit, offset]);
  }

  /**
   * Get total leads count for a list
   * @param {string} listId - List ID
   * @returns {Promise<number>}
   */
  async getLeadsCountByListId(listId) {
    const sql = `
      SELECT COUNT(*) as total
      FROM vicidial_list
      WHERE list_id = ?
    `;

    const results = await database.query(sql, [listId]);
    return results[0]?.total || 0;
  }

  /**
   * Get campaigns status (replacement for Vicibroker campaigns_status)
   * @param {string[]} campaigns - Array of campaign IDs
   * @returns {Promise<Array>}
   */
  async getCampaignsStatus(campaigns) {
    // Security Fix: If campaigns argument is provided (as array) but empty, 
    // it means "filter by these IDs" (which are none), so return nothing.
    if (campaigns && Array.isArray(campaigns) && campaigns.length === 0) {
      return [];
    }

    let sql = `
      SELECT 
        c.campaign_id,
        c.campaign_name,
        c.active,
        c.dial_method,
        c.dial_status_a as dial_status,
        c.lead_order,
        c.hopper_level,
        c.auto_dial_level,
        CASE 
          WHEN c.active = 'Y' THEN 'Activa'
          WHEN c.active = 'N' THEN 'Inactiva'
          ELSE 'Pausada'
        END as estado
      FROM vicidial_campaigns c
      LEFT JOIN gescall_campaign_status gcs ON c.campaign_id = gcs.campaign_id
    `;

    let params = [];
    if (campaigns && campaigns.length > 0) {
      const placeholders = campaigns.map(() => '?').join(',');
      sql += ` WHERE c.campaign_id IN (${placeholders}) AND COALESCE(gcs.is_deleted, 0) = 0`;
      params = campaigns;
    } else {
      sql += ` WHERE COALESCE(gcs.is_deleted, 0) = 0`;
    }

    sql += ' ORDER BY c.campaign_name';

    return await database.query(sql, params);
  }

  /**
   * Soft delete a campaign
   * @param {string} campaignId
   * @returns {Promise<Object>}
   */
  async softDeleteCampaign(campaignId) {
    // Primero, detenemos la campaña para asegurarnos de que no sigue llamando
    await this.stopCampaign(campaignId);

    // Luego actualizamos la tabla de estado para ocultarla (is_deleted = TRUE)
    const sql = `
      INSERT INTO gescall_campaign_status (campaign_id, is_deleted, deleted_at) 
      VALUES (?, TRUE, NOW())
      ON DUPLICATE KEY UPDATE is_deleted = TRUE, deleted_at = NOW()
    `;
    const result = await database.query(sql, [campaignId]);
    return { success: true, affectedRows: result.affectedRows };
  }

  /**
   * Get lists count by campaign (replacement for Vicibroker lists_count_by_campaign)
   * @param {string[]} campaigns - Array of campaign IDs
   * @returns {Promise<Array>}
   */
  async getListsCountByCampaign(campaigns) {
    // Security Fix: If campaigns argument is provided (as array) but empty, 
    // it means "filter by these IDs" (which are none), so return nothing.
    if (campaigns && Array.isArray(campaigns) && campaigns.length === 0) {
      return [];
    }

    let sql = `
      SELECT 
        vls.campaign_id,
        COUNT(DISTINCT vls.list_id) as cantidad_listas,
        SUM(CASE WHEN vl.lead_id IS NOT NULL THEN 1 ELSE 0 END) as total_leads
      FROM vicidial_lists vls
      LEFT JOIN vicidial_list vl ON vls.list_id = vl.list_id
    `;

    let params = [];
    if (campaigns && campaigns.length > 0) {
      const placeholders = campaigns.map(() => '?').join(',');
      sql += ` WHERE vls.campaign_id IN (${placeholders})`;
      params = campaigns;
    }

    sql += ' GROUP BY vls.campaign_id';

    return await database.query(sql, params);
  }

  /**
   * Get DNC (Duplicate Number Check / Blacklist) list with pagination and search
   * @param {number} limit - Max rows to return
   * @param {number} offset - Offset for pagination
   * @param {string} search - Search term (phone number)
   * @returns {Promise<Array>}
   */
  async getDncList(limit = 100, offset = 0, search = '') {
    let sql = 'SELECT phone_number FROM vicidial_dnc';
    let countSql = 'SELECT COUNT(*) as total FROM vicidial_dnc';
    let params = [];
    let countParams = [];

    if (search) {
      sql += ' WHERE phone_number LIKE ?';
      countSql += ' WHERE phone_number LIKE ?';
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    sql += ' ORDER BY phone_number DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await database.query(sql, params);
    const countResult = await database.query(countSql, countParams);

    return {
      data: rows || [],
      total: countResult[0]?.total || 0
    };
  }

  /**
   * Add number to DNC list
   * @param {string} phoneNumber - Phone number to add
   * @param {string} campaignId - Optional: Campaign ID (default to global/empty for standard DNC)
   * @returns {Promise<Object>}
   */
  async addDncNumber(phoneNumber, campaignId = '') {
    // 1. Add to vicidial_dnc (global DNC list)
    const sql = `
      INSERT IGNORE INTO vicidial_dnc (phone_number)
      VALUES (?)
    `;
    await database.query(sql, [phoneNumber]);

    // 2. Remove any leads with this phone number from the hopper (via lead_id)
    // vicidial_hopper only has lead_id, so we need to find leads by phone first
    const removeHopperSql = `
      DELETE FROM vicidial_hopper 
      WHERE lead_id IN (
        SELECT lead_id FROM vicidial_list WHERE phone_number = ?
      )
    `;
    const hopperResult = await database.query(removeHopperSql, [phoneNumber]);
    console.log(`[DNC] Removed ${hopperResult.affectedRows || 0} entries from hopper for ${phoneNumber}`);

    // 3. Update all leads with this phone to DNCC status (Do Not Call - Blacklisted)
    const updateLeadsSql = `
      UPDATE vicidial_list 
      SET status = 'DNCC', 
          called_since_last_reset = 'Y'
      WHERE phone_number = ?
    `;
    const leadsResult = await database.query(updateLeadsSql, [phoneNumber]);
    console.log(`[DNC] Updated ${leadsResult.affectedRows || 0} leads to DNCC status for ${phoneNumber}`);

    return {
      success: true,
      removedFromHopper: hopperResult.affectedRows || 0,
      leadsUpdated: leadsResult.affectedRows || 0
    };
  }

  /**
   * Remove number from DNC list
   * @param {string} phoneNumber - Phone number to remove
   * @returns {Promise<Object>}
   */
  async removeDncNumber(phoneNumber) {
    // 1. Remove from vicidial_dnc
    const sql = 'DELETE FROM vicidial_dnc WHERE phone_number = ?';
    await database.query(sql, [phoneNumber]);

    // 2. Restore leads with this phone to NEW status so they can be called again
    const restoreLeadsSql = `
      UPDATE vicidial_list 
      SET status = 'NEW', 
          called_since_last_reset = 'N'
      WHERE phone_number = ? AND status = 'DNCC'
    `;
    const leadsResult = await database.query(restoreLeadsSql, [phoneNumber]);
    console.log(`[DNC] Restored ${leadsResult.affectedRows || 0} leads to NEW status for ${phoneNumber}`);

    return {
      success: true,
      leadsRestored: leadsResult.affectedRows || 0
    };
  }

  /**
   * Clear all numbers from DNC list
   * @returns {Promise<Object>}
   */
  async clearAllDncNumbers() {
    const countSql = 'SELECT COUNT(*) as total FROM vicidial_dnc';
    const countResult = await database.query(countSql, []);
    const total = countResult[0]?.total || 0;

    const sql = 'DELETE FROM vicidial_dnc';
    await database.query(sql, []);

    return { success: true, deleted: total };
  }

  /**
   * Bulk add numbers to DNC list
   * @param {Array<string>} numbers - Array of phone numbers
   * @returns {Promise<Object>}
   */
  async bulkAddDncNumbers(numbers) {
    if (!numbers || numbers.length === 0) return { success: true, count: 0 };

    // MariaDB/mysql2 execute() doesn't support VALUES ? for bulk insert
    // Build explicit placeholders: INSERT IGNORE INTO ... VALUES (?), (?), (?)
    const placeholders = numbers.map(() => '(?)').join(', ');
    const sql = `INSERT IGNORE INTO vicidial_dnc (phone_number) VALUES ${placeholders}`;

    const result = await database.query(sql, numbers);
    return {
      success: true,
      count: result.affectedRows,
      total: numbers.length
    };
  }



  // ==================== CALLERID POOLS METHODS ====================

  /**
   * Get all CallerID pools with stats
   */
  async getCallerIdPools(limit = 50, offset = 0, search = '') {
    let sql = `
      SELECT p.*, 
        COUNT(DISTINCT n.id) as total_numbers,
        SUM(CASE WHEN n.is_active = 1 THEN 1 ELSE 0 END) as active_numbers
      FROM gescall_callerid_pools p
      LEFT JOIN gescall_callerid_pool_numbers n ON p.id = n.pool_id
    `;
    let countSql = 'SELECT COUNT(*) as total FROM gescall_callerid_pools';
    const params = [];
    const countParams = [];

    if (search) {
      sql += ' WHERE p.name LIKE ? OR p.description LIKE ?';
      countSql += ' WHERE name LIKE ? OR description LIKE ?';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam);
      countParams.push(searchParam, searchParam);
    }

    sql += ' GROUP BY p.id ORDER BY p.name ASC';
    const safeLimit = parseInt(limit) || 50;
    const safeOffset = parseInt(offset) || 0;
    sql += ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const rows = await database.query(sql, params);
    const countResult = await database.query(countSql, countParams);

    return { data: rows, total: countResult[0]?.total || 0 };
  }

  /**
   * Get a single CallerID pool by ID
   */
  async getCallerIdPoolById(id) {
    const sql = `
      SELECT p.*, 
        COUNT(DISTINCT n.id) as total_numbers,
        SUM(CASE WHEN n.is_active = 1 THEN 1 ELSE 0 END) as active_numbers
      FROM gescall_callerid_pools p
      LEFT JOIN gescall_callerid_pool_numbers n ON p.id = n.pool_id
      WHERE p.id = ?
      GROUP BY p.id
    `;
    const rows = await database.query(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Create a new CallerID pool
   */
  async createCallerIdPool(name, description, countryCode = 'CO') {
    const sql = 'INSERT INTO gescall_callerid_pools (name, description, country_code) VALUES (?, ?, ?)';
    const result = await database.query(sql, [name, description, countryCode]);
    return { success: true, id: result.insertId };
  }

  /**
   * Update a CallerID pool
   */
  async updateCallerIdPool(id, data) {
    const fields = [];
    const params = [];

    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.country_code !== undefined) { fields.push('country_code = ?'); params.push(data.country_code); }
    if (data.is_active !== undefined) { fields.push('is_active = ?'); params.push(data.is_active ? 1 : 0); }

    if (fields.length === 0) return { success: false, message: 'No fields to update' };

    params.push(id);
    const sql = `UPDATE gescall_callerid_pools SET ${fields.join(', ')} WHERE id = ?`;
    await database.query(sql, params);
    return { success: true };
  }

  /**
   * Delete a CallerID pool
   */
  async deleteCallerIdPool(id) {
    const sql = 'DELETE FROM gescall_callerid_pools WHERE id = ?';
    await database.query(sql, [id]);
    return { success: true };
  }

  // ==================== CALLERID POOL NUMBERS METHODS ====================

  /**
   * Get numbers in a pool
   */
  async getPoolNumbers(poolId, limit = 100, offset = 0, search = '') {
    let sql = 'SELECT * FROM gescall_callerid_pool_numbers WHERE pool_id = ?';
    let countSql = 'SELECT COUNT(*) as total FROM gescall_callerid_pool_numbers WHERE pool_id = ?';
    const params = [poolId];
    const countParams = [poolId];

    if (search) {
      sql += ' AND (callerid LIKE ? OR area_code LIKE ?)';
      countSql += ' AND (callerid LIKE ? OR area_code LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam);
      countParams.push(searchParam, searchParam);
    }

    const safeLimit = parseInt(limit) || 100;
    const safeOffset = parseInt(offset) || 0;
    sql += ` ORDER BY area_code, callerid LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const rows = await database.query(sql, params);
    const countResult = await database.query(countSql, countParams);

    return { data: rows, total: countResult[0]?.total || 0 };
  }

  /**
   * Add a number to a pool
   */
  async addPoolNumber(poolId, callerid) {
    const areaCode = callerid.substring(0, 3);
    const sql = 'INSERT INTO gescall_callerid_pool_numbers (pool_id, callerid, area_code) VALUES (?, ?, ?)';
    const result = await database.query(sql, [poolId, callerid, areaCode]);
    return { success: true, id: result.insertId };
  }

  /**
   * Bulk add numbers to a pool
   */
  async bulkAddPoolNumbers(poolId, numbers) {
    if (!numbers || numbers.length === 0) return { success: true, count: 0 };

    // Build INSERT IGNORE with explicit placeholders
    const values = numbers.map(num => {
      const areaCode = num.substring(0, 3);
      return [poolId, num, areaCode];
    });

    const placeholders = values.map(() => '(?, ?, ?)').join(', ');
    const flatParams = values.flat();
    const sql = `INSERT IGNORE INTO gescall_callerid_pool_numbers (pool_id, callerid, area_code) VALUES ${placeholders}`;

    const result = await database.query(sql, flatParams);
    return { success: true, count: result.affectedRows, total: numbers.length };
  }

  /**
   * Delete a number from a pool
   */
  async deletePoolNumber(numberId) {
    const sql = 'DELETE FROM gescall_callerid_pool_numbers WHERE id = ?';
    await database.query(sql, [numberId]);
    return { success: true };
  }

  /**
   * Toggle number active status
   */
  async togglePoolNumber(numberId, isActive) {
    const sql = 'UPDATE gescall_callerid_pool_numbers SET is_active = ? WHERE id = ?';
    await database.query(sql, [isActive ? 1 : 0, numberId]);
    return { success: true };
  }

  // ==================== CAMPAIGN CALLERID SETTINGS ====================

  /**
   * Get campaign CallerID settings
   */
  async getCampaignCallerIdSettings(campaignId) {
    const sql = `
      SELECT s.*, p.name as pool_name
      FROM gescall_campaign_callerid_settings s
      LEFT JOIN gescall_callerid_pools p ON s.pool_id = p.id
      WHERE s.campaign_id = ?
    `;
    const rows = await database.query(sql, [campaignId]);
    return rows[0] || null;
  }

  /**
   * Upsert campaign CallerID settings
   */
  async upsertCampaignCallerIdSettings(campaignId, data) {
    const sql = `
      INSERT INTO gescall_campaign_callerid_settings 
        (campaign_id, rotation_mode, pool_id, match_mode, fixed_area_code, fallback_callerid, selection_strategy, match_area_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        rotation_mode = VALUES(rotation_mode),
        pool_id = VALUES(pool_id),
        match_mode = VALUES(match_mode),
        fixed_area_code = VALUES(fixed_area_code),
        fallback_callerid = VALUES(fallback_callerid),
        selection_strategy = VALUES(selection_strategy),
        match_area_code = VALUES(match_area_code)
    `;
    await database.query(sql, [
      campaignId,
      data.rotation_mode || 'OFF',
      data.pool_id || null,
      data.match_mode || 'LEAD',
      data.fixed_area_code || null,
      data.fallback_callerid || null,
      data.selection_strategy || 'ROUND_ROBIN',
      data.match_area_code !== undefined ? (data.match_area_code ? 1 : 0) : 1
    ]);
    return { success: true };
  }

  // ==================== CALLERID SELECTION LOGIC ====================

  /**
   * Select the best CallerID for a call
   * @param {string} campaignId
   * @param {string} leadPhoneNumber
   * @returns {Promise<Object>} { callerid, selection_result, area_code_target }
   */
  async selectCallerIdForCall(campaignId, leadPhoneNumber) {
    // Get campaign settings
    const settings = await this.getCampaignCallerIdSettings(campaignId);

    if (!settings || settings.rotation_mode === 'OFF') {
      return { callerid: null, selection_result: 'DEFAULT', area_code_target: null };
    }

    // Check if area code matching is enabled
    const matchAreaCode = settings.match_area_code !== undefined ? !!settings.match_area_code : true;

    // Determine target area code
    let areaCodeTarget;
    if (settings.match_mode === 'FIXED') {
      areaCodeTarget = settings.fixed_area_code;
    } else {
      // Extract from lead phone (first 3 digits, skip country prefix 52)
      const cleanPhone = leadPhoneNumber.replace(/[^0-9]/g, '');
      if (cleanPhone.startsWith('52') && cleanPhone.length > 10) {
        areaCodeTarget = cleanPhone.substring(2, 5);
      } else {
        areaCodeTarget = cleanPhone.substring(0, 3);
      }
    }

    // Select CallerID based on strategy
    let callerid = null;
    const poolId = settings.pool_id;

    // Build area code filter conditionally
    const areaCodeFilter = matchAreaCode ? 'AND area_code = ?' : '';
    const baseParams = matchAreaCode ? [poolId, areaCodeTarget] : [poolId];

    if (settings.selection_strategy === 'RANDOM') {
      const sql = `
        SELECT * FROM gescall_callerid_pool_numbers 
        WHERE pool_id = ? ${areaCodeFilter} AND is_active = 1
        ORDER BY RAND() LIMIT 1
      `;
      const rows = await database.query(sql, baseParams);
      if (rows.length > 0) callerid = rows[0].callerid;

    } else if (settings.selection_strategy === 'LRU') {
      const sql = `
        SELECT * FROM gescall_callerid_pool_numbers 
        WHERE pool_id = ? ${areaCodeFilter} AND is_active = 1
        ORDER BY last_used_at ASC, id ASC LIMIT 1
      `;
      const rows = await database.query(sql, baseParams);
      if (rows.length > 0) callerid = rows[0].callerid;

    } else {
      // Round-robin (default)
      const sql = `
        SELECT * FROM gescall_callerid_pool_numbers 
        WHERE pool_id = ? ${areaCodeFilter} AND is_active = 1
        ORDER BY rr_order ASC, id ASC LIMIT 1
      `;
      const rows = await database.query(sql, baseParams);
      if (rows.length > 0) {
        callerid = rows[0].callerid;
        // Update round-robin order
        const rrAreaFilter = matchAreaCode ? 'AND area_code = ?' : '';
        const rrParams = matchAreaCode ? [poolId, areaCodeTarget] : [poolId];
        const maxOrderSql = `SELECT MAX(rr_order) as max_order FROM gescall_callerid_pool_numbers WHERE pool_id = ? ${rrAreaFilter}`;
        const maxResult = await database.query(maxOrderSql, rrParams);
        const newOrder = (maxResult[0]?.max_order || 0) + 1;
        await database.query('UPDATE gescall_callerid_pool_numbers SET rr_order = ?, last_used_at = NOW(), use_count = use_count + 1 WHERE id = ?', [newOrder, rows[0].id]);
      }
    }

    // If no match, use fallback
    if (!callerid && settings.fallback_callerid) {
      return { callerid: settings.fallback_callerid, selection_result: 'FALLBACK', area_code_target: areaCodeTarget };
    }

    if (!callerid) {
      return { callerid: null, selection_result: 'DEFAULT', area_code_target: areaCodeTarget };
    }

    // Update usage stats if not round-robin (already updated above)
    if (settings.selection_strategy !== 'ROUND_ROBIN') {
      await database.query('UPDATE gescall_callerid_pool_numbers SET last_used_at = NOW(), use_count = use_count + 1 WHERE pool_id = ? AND callerid = ?', [poolId, callerid]);
    }

    return { callerid, selection_result: 'MATCHED', area_code_target: areaCodeTarget };
  }

  /**
   * Log CallerID usage
   */
  async logCallerIdUsage(data) {
    const sql = `
      INSERT INTO gescall_callerid_usage_log 
        (campaign_id, lead_id, phone_number, callerid_used, area_code_target, pool_id, selection_result, strategy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await database.query(sql, [
      data.campaign_id,
      data.lead_id || null,
      data.phone_number || null,
      data.callerid_used,
      data.area_code_target,
      data.pool_id || null,
      data.selection_result,
      data.strategy || null
    ]);
    return { success: true };
  }

  /**
   * Get CallerID usage logs
   */
  async getCallerIdUsageLogs(filters = {}) {
    let sql = 'SELECT * FROM gescall_callerid_usage_log WHERE 1=1';
    const params = [];

    if (filters.campaign_id) {
      sql += ' AND campaign_id = ?';
      params.push(filters.campaign_id);
    }
    if (filters.pool_id) {
      sql += ' AND pool_id = ?';
      params.push(filters.pool_id);
    }
    if (filters.callerid) {
      sql += ' AND callerid_used LIKE ?';
      params.push(`%${filters.callerid}%`);
    }
    if (filters.start_date) {
      sql += ' AND created_at >= ?';
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      sql += ' AND created_at <= ?';
      params.push(filters.end_date);
    }

    const safeLimit = parseInt(filters.limit) || 100;
    const safeOffset = parseInt(filters.offset) || 0;
    sql += ` ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    return await database.query(sql, params);
  }

  /**
   * Get area codes available in a pool
   */
  async getPoolAreaCodes(poolId) {
    const sql = `
      SELECT area_code, COUNT(*) as count, SUM(use_count) as total_uses
      FROM gescall_callerid_pool_numbers
      WHERE pool_id = ? AND is_active = 1
      GROUP BY area_code
      ORDER BY area_code
    `;
    return await database.query(sql, [poolId]);
  }

  /**
   * Get call log from gescall_call_log table (custom CDR)
   * This provides clean call reporting with correct pool CallerID
   * @param {string[]} campaigns - Array of campaign IDs
   * @param {string} startDatetime - Start datetime (YYYY-MM-DD HH:MM:SS)
   * @param {string} endDatetime - End datetime (YYYY-MM-DD HH:MM:SS)
   * @param {number} limit - Max rows to return
   * @returns {Promise<Array>}
   */
  async getGescallCallLog(campaigns, startDatetime, endDatetime, limit = 500000) {
    if (!campaigns || campaigns.length === 0) {
      return [];
    }

    const placeholders = campaigns.map((_, i) => `$${i + 3}`).join(',');
    const sql = `
      SELECT
          gcl.call_date,
          gcl.phone_number,
          gl.vendor_lead_code,
          gcl.pool_callerid as caller_id,
          gcl.original_callerid,
          gcl.call_status,
          gcl.dtmf_pressed,
          gcl.lead_id,
          gcl.campaign_id,
          gcl.list_id,
          gls.list_name,
          '' as list_description,
          gl.status as lead_status
      FROM gescall_call_log gcl
      LEFT JOIN gescall_leads gl ON gcl.lead_id = gl.lead_id
      INNER JOIN gescall_lists gls ON gcl.list_id = gls.list_id AND gls.active = 'Y'
      WHERE gcl.call_date BETWEEN $1 AND $2
        AND gcl.campaign_id IN (${placeholders})
      ORDER BY gcl.call_date DESC
      LIMIT $${campaigns.length + 3}
    `;

    const params = [startDatetime, endDatetime, ...campaigns, limit];

    try {
      const result = await pgDatabase.query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('[DatabaseService] getGescallCallLog pg error:', error);
      throw error;
    }
  }

  /**
   * Get call log summary by list from gescall_call_log
   * @param {string[]} campaigns - Array of campaign IDs
   * @param {string} startDatetime - Start datetime
   * @param {string} endDatetime - End datetime
   * @returns {Promise<Array>}
   */
  async getGescallCallLogSummary(campaigns, startDatetime, endDatetime) {
    if (!campaigns || campaigns.length === 0) {
      return [];
    }

    const placeholders = campaigns.map((_, i) => `$${i + 3}`).join(',');
    const sql = `
      SELECT
          gcl.campaign_id,
          gcl.list_id,
          gls.list_name,
          COUNT(*) as total_calls,
          SUM(CASE WHEN gcl.call_status = 'ANSWER' THEN 1 ELSE 0 END) as answered,
          SUM(CASE WHEN gcl.call_status = 'HANGUP' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN gcl.call_status = 'CANCEL' THEN 1 ELSE 0 END) as cancelled,
          SUM(CASE WHEN gcl.dtmf_pressed = '2' THEN 1 ELSE 0 END) as transfers,
          SUM(CASE WHEN gcl.dtmf_pressed = 'NONE' OR gcl.dtmf_pressed IS NULL THEN 1 ELSE 0 END) as no_response
      FROM gescall_call_log gcl
      INNER JOIN gescall_lists gls ON gcl.list_id = gls.list_id AND gls.active = 'Y'
      WHERE gcl.call_date BETWEEN $1 AND $2
        AND gcl.campaign_id IN (${placeholders})
      GROUP BY gcl.campaign_id, gcl.list_id, gls.list_name
      ORDER BY gcl.campaign_id, gcl.list_id
    `;

    const params = [startDatetime, endDatetime, ...campaigns];

    try {
      const result = await pgDatabase.query(sql, params);

      return result.rows.map(row => ({
        ...row,
        total_calls: parseInt(row.total_calls || 0, 10),
        answered: parseInt(row.answered || 0, 10),
        completed: parseInt(row.completed || 0, 10),
        cancelled: parseInt(row.cancelled || 0, 10),
        transfers: parseInt(row.transfers || 0, 10),
        no_response: parseInt(row.no_response || 0, 10)
      }));
    } catch (error) {
      console.error('[DatabaseService] getGescallCallLogSummary pg error:', error);
      throw error;
    }
  }
}

// Singleton instance
const databaseService = new DatabaseService();

module.exports = databaseService;
