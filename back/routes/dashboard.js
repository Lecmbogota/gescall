const express = require('express');
const router = express.Router();
const databaseService = require('../services/databaseService');

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics (KPIs)
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await databaseService.getDashboardStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[Dashboard Stats] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/dashboard/agents
 * Get active agents with their current status
 */
router.get('/agents', async (req, res) => {
  try {
    const agents = await databaseService.getActiveAgents();

    res.json({
      success: true,
      data: agents,
    });
  } catch (error) {
    console.error('[Dashboard Agents] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/dashboard/campaigns/status
 * Get campaigns status by IDs (Vicibroker compatible)
 * Body: { campaigns: ['CAMP01', 'CAMP02'], limit: 1000 }
 */
router.post('/campaigns/status', async (req, res) => {
  try {
    const { campaigns, limit } = req.body;

    if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'campaigns array is required and cannot be empty',
      });
    }

    const data = await databaseService.getCampaignsStatus(campaigns, limit);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Dashboard Campaigns Status] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/dashboard/campaigns/progress
 * Get campaign progress by list (Vicibroker compatible)
 * Body: { campaigns: ['CAMP01'], startDatetime: '2025-01-01 00:00:00', endDatetime: '2025-12-31 23:59:59', limit: 10000 }
 */
router.post('/campaigns/progress', async (req, res) => {
  try {
    const { campaigns, startDatetime, endDatetime, limit } = req.body;

    if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'campaigns array is required and cannot be empty',
      });
    }

    if (!startDatetime || !endDatetime) {
      return res.status(400).json({
        success: false,
        error: 'startDatetime and endDatetime are required (format: YYYY-MM-DD HH:MM:SS)',
      });
    }

    const data = await databaseService.getCampaignProgressByList(
      campaigns,
      startDatetime,
      endDatetime,
      limit || 10000
    );

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Dashboard Campaigns Progress] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/dashboard/dial-log
 * Get dial log by campaign and date range (Vicibroker compatible)
 * Body: { campaigns: ['CAMP01'], startDatetime: '2025-01-01 00:00:00', endDatetime: '2025-12-31 23:59:59', limit: 500000 }
 */
router.post('/dial-log', async (req, res) => {
  try {
    const { campaigns, startDatetime, endDatetime, limit } = req.body;

    if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'campaigns array is required and cannot be empty',
      });
    }

    if (!startDatetime || !endDatetime) {
      return res.status(400).json({
        success: false,
        error: 'startDatetime and endDatetime are required (format: YYYY-MM-DD HH:MM:SS)',
      });
    }

    const data = await databaseService.getDialLogByCampaignDateRange(
      campaigns,
      startDatetime,
      endDatetime,
      limit || 500000
    );

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Dashboard Dial Log] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/dashboard/status-summary
 * Get status summary by list (Vicibroker compatible)
 * Body: { campaigns: ['CAMP01'], startDatetime: '2025-01-01 00:00:00', endDatetime: '2025-12-31 23:59:59', limit: 10000 }
 */
router.post('/status-summary', async (req, res) => {
  try {
    const { campaigns, startDatetime, endDatetime, limit } = req.body;

    if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'campaigns array is required and cannot be empty',
      });
    }

    if (!startDatetime || !endDatetime) {
      return res.status(400).json({
        success: false,
        error: 'startDatetime and endDatetime are required (format: YYYY-MM-DD HH:MM:SS)',
      });
    }

    const data = await databaseService.getStatusSummaryByList(
      campaigns,
      startDatetime,
      endDatetime,
      limit || 10000
    );

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Dashboard Status Summary] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
