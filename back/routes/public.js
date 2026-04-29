const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const vicidialApi = require('../services/vicidialApi');
const databaseService = require('../services/databaseService');
const database = require('../config/database');
const { publicApiAuth } = require('../middleware/publicApiAuth');

const router = express.Router();

const upload = multer({
  dest: '/tmp/public-leads/',
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isCsv = file.mimetype === 'text/csv'
      || file.mimetype === 'application/vnd.ms-excel'
      || file.originalname.toLowerCase().endsWith('.csv');
    if (!isCsv) {
      return cb(new Error('Solo se permiten archivos CSV'));
    }
    return cb(null, true);
  },
});

router.use(publicApiAuth);

let campaignColumnsCache = null;

async function getCampaignColumns() {
  if (campaignColumnsCache) return campaignColumnsCache;
  const columns = await database.query('SHOW COLUMNS FROM vicidial_campaigns');
  campaignColumnsCache = columns.map((col) => col.Field);
  return campaignColumnsCache;
}

async function ensurePlaybackTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS gescall_campaign_playback (
      campaign_id VARCHAR(20) PRIMARY KEY,
      playback_mode ENUM('tts', 'static_audio') NOT NULL DEFAULT 'tts',
      audio_filename VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;
  await database.query(sql);
}

function parseCsv(text) {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim());

  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ';' : ',';

  const headers = firstLine
    .split(delimiter)
    .map((h) => h.trim().replace(/;+$/, '').trim());

  const data = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = lines[i].split(delimiter);
    if (values.length === 0) continue;
    const row = {};
    headers.forEach((header, index) => {
      const rawValue = values[index] || '';
      row[header] = rawValue.trim().replace(/;+$/, '').trim();
    });
    data.push(row);
  }

  return data;
}

function normalizeLead(lead) {
  const keys = Object.keys(lead);
  const normalized = { ...lead };
  const findKey = (candidates) =>
    keys.find((k) => candidates.includes(k.toLowerCase().trim()));

  const phoneKey = findKey([
    'phone',
    'phone_number',
    'telefono',
    'teléfono',
    'celular',
    'movil',
    'mobile',
    'contacto',
    'number',
  ]);
  if (phoneKey) {
    normalized.phone_number = String(lead[phoneKey] || '').replace(/[^0-9]/g, '');
  } else if (keys.length > 0) {
    normalized.phone_number = String(lead[keys[0]] || '').replace(/[^0-9]/g, '');
  }

  const nameKey = findKey(['first_name', 'firstname', 'name', 'nombre', 'nombres']);
  if (nameKey) normalized.first_name = lead[nameKey];

  const lastNameKey = findKey(['last_name', 'lastname', 'surname', 'apellido', 'apellidos']);
  if (lastNameKey) normalized.last_name = lead[lastNameKey];

  return normalized;
}

function normalizePlaybackMode(mode) {
  if (!mode) return 'tts';
  const value = String(mode).toLowerCase().trim();
  if (value === 'tts') return 'tts';
  if (['audio', 'static', 'static_audio', 'audio_estatico'].includes(value)) {
    return 'static_audio';
  }
  return null;
}

router.post('/campaigns', async (req, res) => {
  try {
    const {
      campaign_id,
      campaign_name,
      template_campaign_id,
      active = 'N',
      playback_mode,
      audio_filename,
    } = req.body || {};

    if (!campaign_id || !campaign_name || !template_campaign_id) {
      return res.status(400).json({
        success: false,
        error: 'campaign_id, campaign_name y template_campaign_id son requeridos',
      });
    }

    const exists = await database.query(
      'SELECT campaign_id FROM vicidial_campaigns WHERE campaign_id = ? LIMIT 1',
      [campaign_id]
    );
    if (exists.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'El campaign_id ya existe',
      });
    }

    const columns = await getCampaignColumns();
    const selectParts = [];
    const params = [];

    columns.forEach((column) => {
      if (column === 'campaign_id') {
        selectParts.push('? AS campaign_id');
        params.push(campaign_id);
        return;
      }
      if (column === 'campaign_name') {
        selectParts.push('? AS campaign_name');
        params.push(campaign_name);
        return;
      }
      if (column === 'active') {
        selectParts.push('? AS active');
        params.push(active);
        return;
      }
      selectParts.push(`t.${column}`);
    });

    params.push(template_campaign_id);
    const sql = `
      INSERT INTO vicidial_campaigns (${columns.join(',')})
      SELECT ${selectParts.join(',')}
      FROM vicidial_campaigns t
      WHERE t.campaign_id = ?
    `;
    const result = await database.query(sql, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'template_campaign_id no encontrado',
      });
    }

    if (playback_mode) {
      const normalizedMode = normalizePlaybackMode(playback_mode);
      if (!normalizedMode) {
        return res.status(400).json({
          success: false,
          error: 'playback_mode inválido. Use tts o static_audio',
        });
      }
      if (normalizedMode === 'static_audio' && !audio_filename) {
        return res.status(400).json({
          success: false,
          error: 'audio_filename es requerido para static_audio',
        });
      }
      await ensurePlaybackTable();
      await database.query(
        `
        INSERT INTO gescall_campaign_playback (campaign_id, playback_mode, audio_filename)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE playback_mode = VALUES(playback_mode),
          audio_filename = VALUES(audio_filename)
        `,
        [campaign_id, normalizedMode, audio_filename || null]
      );
    }

    return res.json({ success: true, campaign_id });
  } catch (error) {
    console.error('[Public Campaigns] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/campaigns/:campaign_id/activate', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const result = await databaseService.startCampaign(campaign_id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/campaigns/:campaign_id/deactivate', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const result = await databaseService.stopCampaign(campaign_id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/campaigns/:campaign_id/playback', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { playback_mode, audio_filename } = req.body || {};
    const normalizedMode = normalizePlaybackMode(playback_mode);
    if (!normalizedMode) {
      return res.status(400).json({
        success: false,
        error: 'playback_mode inválido. Use tts o static_audio',
      });
    }
    if (normalizedMode === 'static_audio' && !audio_filename) {
      return res.status(400).json({
        success: false,
        error: 'audio_filename es requerido para static_audio',
      });
    }

    await ensurePlaybackTable();
    await database.query(
      `
      INSERT INTO gescall_campaign_playback (campaign_id, playback_mode, audio_filename)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE playback_mode = VALUES(playback_mode),
        audio_filename = VALUES(audio_filename)
      `,
      [campaign_id, normalizedMode, audio_filename || null]
    );

    return res.json({ success: true, campaign_id });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/campaigns/:campaign_id/playback', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    await ensurePlaybackTable();
    const rows = await database.query(
      'SELECT campaign_id, playback_mode, audio_filename, updated_at FROM gescall_campaign_playback WHERE campaign_id = ?',
      [campaign_id]
    );
    return res.json({ success: true, data: rows[0] || null });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/lists', async (req, res) => {
  try {
    const {
      list_id,
      list_name,
      campaign_id,
      active = 'Y',
      list_description,
      ...rest
    } = req.body || {};

    if (!list_name || !campaign_id) {
      return res.status(400).json({
        success: false,
        error: 'list_name y campaign_id son requeridos',
      });
    }

    let resolvedListId = list_id;
    if (!resolvedListId) {
      const nextIdResult = await database.query('SELECT MAX(list_id) as max_id FROM vicidial_lists');
      const maxId = nextIdResult[0]?.max_id ? parseInt(nextIdResult[0].max_id, 10) : 1000000;
      resolvedListId = String(Math.max(maxId + 1, 1000000));
    }

    const result = await vicidialApi.addList({
      list_id: resolvedListId,
      list_name,
      campaign_id,
      active,
      list_description,
      ...rest,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.data || result.error || 'Error creando lista',
      });
    }

    return res.json({
      success: true,
      list_id: resolvedListId,
      data: result.data,
    });
  } catch (error) {
    console.error('[Public Lists] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/lists/:list_id/leads', upload.single('file'), async (req, res) => {
  try {
    const { list_id } = req.params;
    let leads = [];

    if (req.file) {
      const filePath = req.file.path;
      const content = fs.readFileSync(filePath, 'utf-8');
      fs.unlinkSync(filePath);
      leads = parseCsv(content);
    } else if (Array.isArray(req.body?.leads)) {
      leads = req.body.leads;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Debe enviar leads en JSON o un archivo CSV',
      });
    }

    const normalizedLeads = leads
      .map(normalizeLead)
      .filter((lead) => lead.phone_number && String(lead.phone_number).length >= 7);

    if (normalizedLeads.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se encontraron números válidos en los leads',
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    const BATCH_SIZE = 25;
    for (let i = 0; i < normalizedLeads.length; i += BATCH_SIZE) {
      const batch = normalizedLeads.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (lead) => {
          try {
            const result = await vicidialApi.addLead({
              ...lead,
              list_id,
              phone_code: lead.phone_code || '57',
            });
            if (!result.success) {
              throw new Error(result.data || 'Error desconocido');
            }
            return { ok: true };
          } catch (err) {
            return { ok: false, error: err.message || 'Error desconocido', phone: lead.phone_number };
          }
        })
      );

      results.forEach((result) => {
        if (result.ok) {
          successCount += 1;
        } else {
          errorCount += 1;
          errors.push({ phone_number: result.phone, error: result.error });
        }
      });
    }

    return res.json({
      success: true,
      total: normalizedLeads.length,
      successful: successCount,
      errors: errorCount,
      error_details: errors.slice(0, 100),
    });
  } catch (error) {
    console.error('[Public Leads] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reports/dial-log', async (req, res) => {
  try {
    const { campaigns, startDatetime, endDatetime, limit } = req.body || {};
    if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
      return res.status(400).json({ success: false, error: 'campaigns es requerido' });
    }
    if (!startDatetime || !endDatetime) {
      return res.status(400).json({
        success: false,
        error: 'startDatetime y endDatetime son requeridos',
      });
    }
    const data = await databaseService.getDialLogByCampaignDateRange(
      campaigns,
      startDatetime,
      endDatetime,
      limit
    );
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reports/call-log', async (req, res) => {
  try {
    const { campaigns, startDatetime, endDatetime, limit } = req.body || {};
    if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
      return res.status(400).json({ success: false, error: 'campaigns es requerido' });
    }
    if (!startDatetime || !endDatetime) {
      return res.status(400).json({
        success: false,
        error: 'startDatetime y endDatetime son requeridos',
      });
    }
    const data = await databaseService.getGescallCallLog(
      campaigns,
      startDatetime,
      endDatetime,
      limit
    );
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reports/call-summary', async (req, res) => {
  try {
    const { campaigns, startDatetime, endDatetime } = req.body || {};
    if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
      return res.status(400).json({ success: false, error: 'campaigns es requerido' });
    }
    if (!startDatetime || !endDatetime) {
      return res.status(400).json({
        success: false,
        error: 'startDatetime y endDatetime son requeridos',
      });
    }
    const data = await databaseService.getGescallCallLogSummary(
      campaigns,
      startDatetime,
      endDatetime
    );
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/calls', async (req, res) => {
  try {
    const {
      agent_user,
      phone_number,
      phone_code = '57',
      campaign_id,
    } = req.body || {};

    if (!agent_user || !phone_number) {
      return res.status(400).json({
        success: false,
        error: 'agent_user y phone_number son requeridos',
      });
    }

    const result = await vicidialApi.externalDial({
      agent_user,
      phone_number: String(phone_number).replace(/[^0-9]/g, ''),
      phone_code,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.data || result.error || 'Error al realizar la llamada',
      });
    }

    return res.json({
      success: true,
      data: result.data,
      message: 'Llamada enviada al agente',
    });
  } catch (error) {
    console.error('[Public Calls] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
