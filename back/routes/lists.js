const express = require('express');
const router = express.Router();
const vicidialApi = require('../services/vicidialApi');
const databaseService = require('../services/databaseService');

/**
 * GET /api/lists/next-id
 * Get the next available list ID
 */
router.get('/next-id', async (req, res) => {
  try {
    const nextId = await databaseService.getNextListId();
    res.json({
      success: true,
      next_id: nextId,
    });
  } catch (error) {
    console.error('[Lists Next ID] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/lists/:list_id/leads
 * Get leads for a specific list with pagination
 */
router.get('/:list_id/leads', async (req, res) => {
  try {
    const { list_id } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const [leads, total] = await Promise.all([
      databaseService.getLeadsByListId(list_id, parseInt(limit), parseInt(offset)),
      databaseService.getLeadsCountByListId(list_id)
    ]);

    res.json({
      success: true,
      data: leads,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('[Lists Leads] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/lists/:list_id
 * Get information about a specific list
 */
router.get('/:list_id', async (req, res) => {
  try {
    const { list_id } = req.params;
    const { leads_counts, dialable_count } = req.query;

    const result = await vicidialApi.getListInfo({
      list_id,
      leads_counts: leads_counts || 'Y',
      dialable_count: dialable_count || 'Y',
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
        error: result.error || result.data,
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
 * POST /api/lists
 * Create a new list
 */
router.post('/', async (req, res) => {
  try {
    const {
      list_id,
      list_name,
      campaign_id,
      active,
      list_description,
      outbound_cid,
      script,
      web_form_address,
      ...otherOptions
    } = req.body;

    // Validación básica
    if (!list_id || !list_name || !campaign_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: list_id, list_name, campaign_id',
      });
    }

    // Build options object, filtering out undefined/null values
    const rawOptions = {
      list_id,
      list_name,
      campaign_id,
      active: active || 'Y',
      list_description,
      outbound_cid,
      script,
      web_form_address,
      ...otherOptions,
    };

    // Remove all undefined, null, or empty string values
    const options = Object.fromEntries(
      Object.entries(rawOptions).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    );

    const result = await vicidialApi.addList(options);

    if (result.success) {
      res.json({
        success: true,
        message: 'List created successfully',
        data: result.data,
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
 * PUT /api/lists/:list_id
 * Update an existing list
 */
router.put('/:list_id', async (req, res) => {
  try {
    const { list_id } = req.params;
    const { reset_list, delete_list, delete_leads, ...options } = req.body;

    const result = await vicidialApi.updateList({
      list_id,
      reset_list,
      delete_list,
      delete_leads,
      ...options,
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'List updated successfully',
        data: result.data,
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
 * DELETE /api/lists/:list_id
 * Delete a list
 */
router.delete('/:list_id', async (req, res) => {
  try {
    const { list_id } = req.params;
    const { delete_leads } = req.query;

    const result = await vicidialApi.updateList({
      list_id,
      delete_list: 'Y',
      delete_leads: delete_leads === 'true' ? 'Y' : 'N',
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'List deleted successfully',
        data: result.data,
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

// Update list status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    if (!['Y', 'N'].includes(active)) {
      return res.status(400).json({ error: 'Invalid active status. Must be Y or N' });
    }

    const result = await vicidialApi.updateListStatus(id, active);

    // Also update in local DB if necessary, but VicidialAPI is the source of truth for dialing
    // If using local mirror:
    await databaseService.executeQuery('UPDATE vicidial_lists SET active = ? WHERE list_id = ?', [active, id]);

    res.json(result);
  } catch (error) {
    console.error('Error updating list status:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
