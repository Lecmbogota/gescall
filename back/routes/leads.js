const express = require('express');
const router = express.Router();
const vicidialApi = require('../services/vicidialApi');

/**
 * GET /api/leads/search
 * Search for leads by phone number
 */
router.get('/search', async (req, res) => {
  try {
    const { phone_number, records } = req.query;

    if (!phone_number) {
      return res.status(400).json({
        success: false,
        error: 'phone_number is required',
      });
    }

    const result = await vicidialApi.searchLeads({
      phone_number,
      records: records || 1000,
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
 * GET /api/leads/:lead_id
 * Get all information about a specific lead
 */
router.get('/:lead_id', async (req, res) => {
  try {
    const { lead_id } = req.params;
    const { custom_fields } = req.query;

    const result = await vicidialApi.getLeadAllInfo({
      lead_id,
      custom_fields: custom_fields || 'N',
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

/**
 * POST /api/leads
 * Create a new lead
 */
router.post('/', async (req, res) => {
  try {
    const {
      phone_number,
      phone_code,
      list_id,
      first_name,
      last_name,
      vendor_lead_code,
      source_id,
      address1,
      city,
      state,
      postal_code,
      email,
      dnc_check,
      duplicate_check,
      custom_fields,
      ...otherOptions
    } = req.body;

    // Validación básica
    if (!phone_number || !list_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: phone_number, list_id',
      });
    }

    const result = await vicidialApi.addLead({
      phone_number,
      phone_code: phone_code || '1',
      list_id,
      first_name,
      last_name,
      vendor_lead_code,
      source_id,
      address1,
      city,
      state,
      postal_code,
      email,
      dnc_check,
      duplicate_check,
      custom_fields,
      ...otherOptions,
    });

    if (result.success) {
      // Extract lead_id from response if available
      const leadIdMatch = result.data.match(/(\d+)\|-?\d+$/);
      const leadId = leadIdMatch ? leadIdMatch[1] : null;

      res.json({
        success: true,
        message: 'Lead created successfully',
        lead_id: leadId,
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
 * PUT /api/leads/:lead_id
 * Update an existing lead
 */
router.put('/:lead_id', async (req, res) => {
  try {
    const { lead_id } = req.params;
    const { ...options } = req.body;

    const result = await vicidialApi.updateLead({
      lead_id,
      ...options,
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Lead updated successfully',
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
 * DELETE /api/leads/:lead_id
 * Delete a lead
 */
router.delete('/:lead_id', async (req, res) => {
  try {
    const { lead_id } = req.params;

    const result = await vicidialApi.updateLead({
      lead_id,
      delete_lead: 'Y',
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Lead deleted successfully',
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

module.exports = router;
