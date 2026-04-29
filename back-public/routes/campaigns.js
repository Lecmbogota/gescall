const express = require('express');
const router = express.Router();
const vicidialApi = require('../services/vicidialApi');
const databaseService = require('../services/databaseService');

/**
 * GET /api/campaigns
 * Get all campaigns or a specific campaign (using direct DB)
 */
router.get('/', async (req, res) => {
  try {
    const { campaign_id, allowed_campaigns } = req.query;

    let data;
    if (campaign_id) {
      data = await databaseService.getCampaignById(campaign_id);
      data = data ? [data] : [];
    } else if (allowed_campaigns) {
      // Parse allowed_campaigns if it's a string (e.g. "CAMP1,CAMP2")
      const allowedIds = typeof allowed_campaigns === 'string'
        ? allowed_campaigns.split(',').filter(Boolean)
        : (Array.isArray(allowed_campaigns) ? allowed_campaigns : []);

      if (allowedIds.length > 0) {
        data = await databaseService.getCampaignsByIds(allowedIds);
      } else {
        data = [];
      }
    } else {
      // Default: return all campaigns (backward compatibility)
      // TODO: Consider changing this to return empty array for security
      data = await databaseService.getAllCampaigns();
    }

    console.log('[Campaigns] ========================================');
    console.log('[Campaigns] Campaigns requested');
    console.log('[Campaigns] Total campaigns returned:', data.length);
    if (data.length > 0) {
      console.log('[Campaigns] Campaign IDs:', data.map(c => c.campaign_id).join(', '));
      console.log('[Campaigns] First campaign structure:', JSON.stringify(data[0], null, 2));
    }
    console.log('[Campaigns] ========================================');

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaigns] Error:', error);
    
    // Determinar el código de estado HTTP apropiado
    let statusCode = 500;
    let errorMessage = error.message || 'Error desconocido';
    
    // Si es un error de conexión a la base de datos
    if (error.message && (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('MySQL connect ERROR') ||
      error.message.includes('Connection refused')
    )) {
      statusCode = 503; // Service Unavailable
      errorMessage = 'No se puede conectar a la base de datos. Por favor, verifique la configuración del servidor MySQL.';
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      errorCode: error.code || 'DATABASE_ERROR',
    });
  }
});

/**
 * GET /api/campaigns/:campaign_id/hopper
 * Get hopper list for a campaign (still uses Vicidial API)
 */
router.get('/:campaign_id/hopper', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const result = await vicidialApi.getHopperList({
      campaign_id,
    });

    if (result.success) {
      const parsed = vicidialApi.parseResponse(result.data);
      res.json({
        success: true,
        data: parsed,
        raw: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.data,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/campaigns/:campaign_id/lists
 * Get all lists for a campaign (using direct DB)
 */
router.get('/:campaign_id/lists', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const data = await databaseService.getListsByCampaign(campaign_id);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaign Lists] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/campaigns/:campaign_id/progress
 * Get campaign progress (Vicibroker compatible)
 * Body: { limit: 1000 } (optional)
 */
router.post('/:campaign_id/progress', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { limit } = req.body;

    const data = await databaseService.getProgressForSingleCampaign(
      campaign_id,
      limit
    );

    console.log(`[Campaign Progress] Campaign: ${campaign_id}, Data:`, data);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaign Progress] Error:', error);
    res.json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/campaigns/bulk/status
 * Get status for multiple campaigns (replacement for Vicibroker campaigns_status)
 * Body: { campaigns: ['CAMP01', 'CAMP02'] }
 */
router.post('/bulk/status', async (req, res) => {
  try {
    const { campaigns } = req.body;

    // campaigns can be empty (but we should pass it as is to let the service decide)
    // Sending null would trigger "fetch all", which we want to avoid if user sends explicit empty list
    const data = await databaseService.getCampaignsStatus(campaigns);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaigns Bulk Status] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/campaigns/bulk/lists-count
 * Get lists count for multiple campaigns (using direct DB)
 * Body: { campaigns: ['CAMP01', 'CAMP02'] }
 */
router.post('/bulk/lists-count', async (req, res) => {
  try {
    const { campaigns } = req.body;

    if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'campaigns array is required and cannot be empty',
      });
    }

    const data = await databaseService.getListsCountByCampaign(campaigns);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaigns Bulk Lists Count] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/campaigns/:campaign_id/stats
 * Get campaign statistics and progress overview
 */
router.get('/:campaign_id/stats', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const data = await databaseService.getCampaignStats(campaign_id);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaign Stats] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/campaigns/:campaign_id/progress-status
 * Get campaign progress by status (detailed breakdown)
 */
router.get('/:campaign_id/progress-status', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const data = await databaseService.getCampaignProgressByStatus(campaign_id);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaign Progress by Status] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/campaigns/:campaign_id/lists-progress
 * Get campaign progress by list with detailed stats
 */
router.get('/:campaign_id/lists-progress', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const data = await databaseService.getCampaignListsProgress(campaign_id);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaign Lists Progress] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/campaigns/:campaign_id/call-activity
 * Get campaign call activity (today)
 */
router.get('/:campaign_id/call-activity', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const data = await databaseService.getCampaignCallActivity(campaign_id);

    res.json({
      success: true,
      data: data || {
        total_calls: 0,
        sales: 0,
        transfers: 0,
        drops: 0,
        no_answer: 0,
        busy: 0,
        total_talk_time: 0,
        avg_talk_time: 0,
        active_agents: 0
      },
    });
  } catch (error) {
    console.error('[Campaign Call Activity] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/campaigns/:campaign_id/hourly-activity
 * Get campaign hourly activity (today)
 */
router.get('/:campaign_id/hourly-activity', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const data = await databaseService.getCampaignHourlyActivity(campaign_id);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaign Hourly Activity] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/campaigns/:campaign_id/agents-performance
 * Get campaign agents performance (today)
 */
router.get('/:campaign_id/agents-performance', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const data = await databaseService.getCampaignAgentsPerformance(campaign_id);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaign Agents Performance] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/campaigns/:campaign_id/dial-log
 * Get campaign dial log by date range
 * Body: { startDatetime: '2025-10-25 00:00:00', endDatetime: '2025-10-25 23:59:59', limit: 500000 }
 */
router.post('/:campaign_id/dial-log', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { startDatetime, endDatetime, limit } = req.body;

    if (!startDatetime || !endDatetime) {
      return res.status(400).json({
        success: false,
        error: 'startDatetime and endDatetime are required (format: YYYY-MM-DD HH:MM:SS)',
      });
    }

    const data = await databaseService.getDialLogByCampaignDateRange(
      [campaign_id],
      startDatetime,
      endDatetime,
      limit || 500000
    );

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaign Dial Log] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/campaigns/:campaign_id/call-log
 * Get campaign call log from gescall_call_log (custom CDR with correct pool CallerID)
 * Body: { startDatetime: '2025-10-25 00:00:00', endDatetime: '2025-10-25 23:59:59', limit: 500000 }
 */
router.post('/:campaign_id/call-log', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { startDatetime, endDatetime, limit } = req.body;

    if (!startDatetime || !endDatetime) {
      return res.status(400).json({
        success: false,
        error: 'startDatetime and endDatetime are required (format: YYYY-MM-DD HH:MM:SS)',
      });
    }

    const data = await databaseService.getGescallCallLog(
      [campaign_id],
      startDatetime,
      endDatetime,
      limit || 500000
    );

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaign Call Log] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/campaigns/:campaign_id/call-log/summary
 * Get campaign call log summary from gescall_call_log
 */
router.post('/:campaign_id/call-log/summary', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { startDatetime, endDatetime } = req.body;

    if (!startDatetime || !endDatetime) {
      return res.status(400).json({
        success: false,
        error: 'startDatetime and endDatetime are required',
      });
    }

    const data = await databaseService.getGescallCallLogSummary(
      [campaign_id],
      startDatetime,
      endDatetime
    );

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaign Call Log Summary] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/campaigns/summary
 * Get campaigns summary with metrics
 * Body: { campaigns: ['CAMP01', 'CAMP02'] } (optional - if not provided, returns all campaigns)
 */
router.post('/summary', async (req, res) => {
  try {
    const { campaigns } = req.body;

    const data = await databaseService.getCampaignsSummary(campaigns);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Campaigns Summary] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== CAMPAIGN CONTROL ====================

/**
 * POST /api/campaigns/:campaign_id/start
 * Start a campaign (set active = 'Y')
 */
router.post('/:campaign_id/start', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    console.log(`[Campaign Start] Starting campaign: ${campaign_id}`);

    await databaseService.startCampaign(campaign_id);

    res.json({
      success: true,
      message: `Campaña ${campaign_id} iniciada`,
      status: 'active'
    });
  } catch (error) {
    console.error('[Campaign Start] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/campaigns/:campaign_id/stop
 * Stop a campaign (set active = 'N')
 */
router.post('/:campaign_id/stop', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    console.log(`[Campaign Stop] Stopping campaign: ${campaign_id}`);

    await databaseService.stopCampaign(campaign_id);

    res.json({
      success: true,
      message: `Campaña ${campaign_id} detenida`,
      status: 'inactive'
    });
  } catch (error) {
    console.error('[Campaign Stop] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CALLERID SETTINGS ====================

/**
 * GET /api/campaigns/:campaign_id/callerid-settings
 * Get CallerID rotation settings for a campaign
 */
router.get('/:campaign_id/callerid-settings', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const settings = await databaseService.getCampaignCallerIdSettings(campaign_id);

    // Return default settings if none exist
    const defaultSettings = {
      campaign_id,
      rotation_mode: 'OFF',
      pool_id: null,
      pool_name: null,
      match_mode: 'LEAD',
      fixed_area_code: null,
      fallback_callerid: null,
      selection_strategy: 'ROUND_ROBIN'
    };

    res.json({
      success: true,
      data: settings || defaultSettings
    });
  } catch (error) {
    console.error('[Campaign CallerID Settings Get] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/campaigns/:campaign_id/callerid-settings
 * Update CallerID rotation settings for a campaign
 */
router.put('/:campaign_id/callerid-settings', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { rotation_mode, pool_id, match_mode, fixed_area_code, fallback_callerid, selection_strategy } = req.body;

    await databaseService.upsertCampaignCallerIdSettings(campaign_id, {
      rotation_mode,
      pool_id,
      match_mode,
      fixed_area_code,
      fallback_callerid,
      selection_strategy
    });

    res.json({ success: true, message: 'Configuración guardada' });
  } catch (error) {
    console.error('[Campaign CallerID Settings Update] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/campaigns/:campaign_id/select-callerid
 * Select a CallerID for an outbound call (used by AGI)
 * Body: { phone_number, lead_id }
 */
router.post('/:campaign_id/select-callerid', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { phone_number, lead_id } = req.body;

    if (!phone_number) {
      return res.status(400).json({ success: false, error: 'phone_number is required' });
    }

    // Select CallerID
    const result = await databaseService.selectCallerIdForCall(campaign_id, phone_number);

    // Get campaign settings for logging
    const settings = await databaseService.getCampaignCallerIdSettings(campaign_id);

    // Log usage
    if (result.callerid) {
      await databaseService.logCallerIdUsage({
        campaign_id,
        lead_id,
        phone_number,
        callerid_used: result.callerid,
        area_code_target: result.area_code_target,
        pool_id: settings?.pool_id || null,
        selection_result: result.selection_result,
        strategy: settings?.selection_strategy || null
      });
    }

    res.json({
      success: true,
      callerid: result.callerid,
      selection_result: result.selection_result,
      area_code_target: result.area_code_target
    });
  } catch (error) {
    console.error('[CallerID Select] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
