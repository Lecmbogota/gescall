const express = require('express');
const router = express.Router();
const vicidialApi = require('../services/vicidialApi');

/**
 * GET /api/agents/logged-in
 * Get all logged in agents
 */
router.get('/logged-in', async (req, res) => {
  try {
    const { campaigns, user_groups } = req.query;

    const result = await vicidialApi.getLoggedInAgents({
      campaigns: campaigns || '',
      user_groups: user_groups || '',
    });

    if (result.success) {
      const parsed = vicidialApi.parseResponse(result.data);
      res.json({
        success: true,
        data: parsed,
        count: parsed.length,
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
 * GET /api/agents/:agent_user/status
 * Get status of a specific agent
 */
router.get('/:agent_user/status', async (req, res) => {
  try {
    const { agent_user } = req.params;

    const result = await vicidialApi.getAgentStatus({
      agent_user,
    });

    if (result.success) {
      const parsed = vicidialApi.parseResponse(result.data);
      res.json({
        success: true,
        data: parsed[0] || {},
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

module.exports = router;
