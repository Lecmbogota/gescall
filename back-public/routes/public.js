const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

// Endpoint de login que NO requiere autenticación
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'username y password son requeridos',
      });
    }

    // Obtener credenciales configuradas para API (soporta múltiples usuarios)
    function getConfiguredUsers() {
      // Formato: usuario1:contraseña1,usuario2:contraseña2
      const raw = process.env.API_LOGIN_CREDENTIALS || '';

      if (raw) {
        return raw
          .split(',')
          .map((pair) => pair.trim())
          .filter(Boolean)
          .map((pair) => {
            const [user, pass] = pair.split(':').map((s) => s.trim());
            return { username: user, password: pass };
          })
          .filter((cred) => cred.username && cred.password);
      }

      // Formato 2: API_LOGIN_USER=usuario1,usuario2 y API_LOGIN_PASS=contraseña1,contraseña2
      const usersRaw = process.env.API_LOGIN_USER || '';
      const passRaw = process.env.API_LOGIN_PASS || '';

      if (usersRaw && passRaw) {
        const users = usersRaw.split(',').map((u) => u.trim()).filter(Boolean);
        const passwords = passRaw.split(',').map((p) => p.trim()).filter(Boolean);

        // Mapear usuarios y contraseñas por índice
        const credentials = [];
        const maxLength = Math.max(users.length, passwords.length);

        for (let i = 0; i < maxLength; i++) {
          if (users[i] && passwords[i]) {
            credentials.push({
              username: users[i],
              password: passwords[i],
            });
          }
        }

        if (credentials.length > 0) {
          return credentials;
        }
      }

      // Fallback a formato antiguo (usuario único) o DOCS_PORTAL
      const apiUsername = process.env.API_LOGIN_USER || process.env.DOCS_PORTAL_USER || 'api_user';
      const apiPassword = process.env.API_LOGIN_PASS || process.env.DOCS_PORTAL_PASS || 'api_pass';

      return [{ username: apiUsername, password: apiPassword }];
    }

    const validCredentials = getConfiguredUsers();

    // Verificar credenciales
    const isValid = validCredentials.some(
      (cred) => cred.username === username && cred.password === password
    );

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas',
      });
    }

    // Asegurar que la tabla de API keys existe
    await ensureApiKeysTable();

    // Generar nuevo API key único
    let newApiKey = generateApiKey();

    // Verificar que no exista (muy poco probable pero por seguridad)
    let existingKey = await database.query(
      'SELECT api_key FROM gescall_api_keys WHERE api_key = ? LIMIT 1',
      [newApiKey]
    );

    while (existingKey.length > 0) {
      newApiKey = generateApiKey();
      existingKey = await database.query(
        'SELECT api_key FROM gescall_api_keys WHERE api_key = ? LIMIT 1',
        [newApiKey]
      );
    }

    // Calcular fecha de expiración (90 días desde ahora)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    // Guardar API key en la base de datos
    await database.query(
      `
      INSERT INTO gescall_api_keys (api_key, username, expires_at, is_active)
      VALUES (?, ?, ?, 1)
      `,
      [newApiKey, username, expiresAt]
    );

    // Retornar el nuevo API key
    return res.json({
      success: true,
      api_key: newApiKey,
      expires_at: expiresAt.toISOString(),
      message: 'Login exitoso',
    });
  } catch (error) {
    console.error('[Public Auth] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
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

async function ensureApiKeysTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS gescall_api_keys (
      api_key VARCHAR(255) PRIMARY KEY,
      username VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      last_used_at TIMESTAMP NULL,
      is_active TINYINT(1) DEFAULT 1,
      INDEX idx_username (username),
      INDEX idx_expires_at (expires_at),
      INDEX idx_is_active (is_active)
    )
  `;
  await database.query(sql);
}

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
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
      campaign_name,
      playback_mode,
      user_group_list,
    } = req.body || {};

    // Validar campos requeridos
    if (!campaign_name) {
      return res.status(400).json({
        success: false,
        error: 'campaign_name es requerido',
      });
    }

    if (!playback_mode) {
      return res.status(400).json({
        success: false,
        error: 'playback_mode es requerido (tts o static_audio)',
      });
    }

    const normalizedMode = normalizePlaybackMode(playback_mode);
    if (!normalizedMode) {
      return res.status(400).json({
        success: false,
        error: 'playback_mode inválido. Use tts o static_audio',
      });
    }

    // Usar PRUEBAS como template por defecto
    const template_campaign_id = 'PRUEBAS';

    // Verificar que el template existe
    const templateExists = await database.query(
      'SELECT campaign_id, campaign_name FROM vicidial_campaigns WHERE campaign_id = ? LIMIT 1',
      [template_campaign_id]
    );

    if (templateExists.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Template campaign "${template_campaign_id}" no encontrado`,
      });
    }

    // Generar ID de campaña incremental
    const maxIdResult = await database.query(
      "SELECT campaign_id FROM vicidial_campaigns WHERE campaign_id LIKE 'API%' ORDER BY campaign_id DESC LIMIT 1"
    );

    let nextNumber = 1;
    if (maxIdResult.length > 0) {
      const lastId = maxIdResult[0].campaign_id;
      const match = lastId.match(/API(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    const campaign_id = `API${nextNumber.toString().padStart(4, '0')}`;

    // Usar APIGROUP por defecto si no se proporciona user_group_list
    const finalUserGroup = user_group_list || 'APIGROUP';

    // Verificar que no exista (por si acaso)
    const exists = await database.query(
      'SELECT campaign_id FROM vicidial_campaigns WHERE campaign_id = ? LIMIT 1',
      [campaign_id]
    );
    if (exists.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'El campaign_id generado ya existe, intenta de nuevo',
      });
    }

    // Clonar campaña desde template
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
        params.push('N'); // Por defecto inactiva
        return;
      }
      if (column === 'user_group') {
        // Asignar grupo por defecto APIGROUP o el especificado
        selectParts.push('? AS user_group');
        params.push(finalUserGroup);
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
      return res.status(500).json({
        success: false,
        error: 'Error al crear la campaña',
      });
    }

    // Guardar playback mode (sin audio_filename, se asigna con otra API)
    await ensurePlaybackTable();
    await database.query(
      `
      INSERT INTO gescall_campaign_playback (campaign_id, playback_mode, audio_filename)
      VALUES (?, ?, NULL)
      `,
      [campaign_id, normalizedMode]
    );

    // Verificar o crear el grupo (APIGROUP por defecto o el especificado)
    const userGroupExists = await database.query(
      'SELECT user_group, allowed_campaigns FROM vicidial_user_groups WHERE user_group = ? LIMIT 1',
      [finalUserGroup]
    );

    if (userGroupExists.length === 0) {
      // Crear user group si no existe
      await database.query(
        `
        INSERT INTO vicidial_user_groups (user_group, group_name, allowed_campaigns)
        VALUES (?, ?, ?)
        `,
        [finalUserGroup, `Public API Group ${finalUserGroup}`, campaign_id]
      );
    } else {
      // Agregar campaña al grupo existente
      const currentCampaigns = userGroupExists[0].allowed_campaigns || '';
      const campaignsList = currentCampaigns ? currentCampaigns.split('-').filter(Boolean) : [];

      if (!campaignsList.includes(campaign_id)) {
        campaignsList.push(campaign_id);
        await database.query(
          'UPDATE vicidial_user_groups SET allowed_campaigns = ? WHERE user_group = ?',
          [campaignsList.join('-'), finalUserGroup]
        );
      }
    }

    // Siempre crear usuario automáticamente para la campaña
    user_id = `API${campaign_id}`; // APIAPI0001, APIAPI0002, etc.
    user_pass = Math.random().toString(36).slice(-12); // Password aleatorio

    // Crear usuario usando Vicidial API
    const userResult = await vicidialApi.addUser({
      agent_user: user_id,
      agent_pass: user_pass,
      agent_user_level: '1',
      agent_full_name: `API User ${campaign_id}`,
      agent_user_group: finalUserGroup,
    });

    if (!userResult.success) {
      console.error('[Public Campaigns] Error creando usuario:', userResult.data);
      // Continuamos aunque falle la creación del usuario (puede existir)
    }

    // Crear remote agent para el usuario y asignarlo a la campaña
    const serverIp = process.env.DB_HOST || '209.38.233.46';
    let remoteAgentId = null;

    try {
      const remoteAgentResult = await database.query(
        `
        INSERT INTO vicidial_remote_agents 
        (user_start, number_of_lines, server_ip, conf_exten, status, campaign_id)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [user_id, 1, serverIp, '8300', 'ACTIVE', campaign_id]
      );

      remoteAgentId = remoteAgentResult.insertId;

      // Crear entrada en vicidial_live_agents para que el usuario aparezca como disponible
      try {
        // Verificar si ya existe una entrada para este usuario
        const existingLiveAgent = await database.query(
          'SELECT live_agent_id FROM vicidial_live_agents WHERE user = ? LIMIT 1',
          [user_id]
        );

        if (existingLiveAgent.length > 0) {
          // Actualizar entrada existente
          await database.query(
            `
            UPDATE vicidial_live_agents 
            SET status = ?, campaign_id = ?, server_ip = ?, conf_exten = ?, last_update_time = CURRENT_TIMESTAMP
            WHERE user = ?
            `,
            ['READY', campaign_id, serverIp, '8300', user_id]
          );
        } else {
          // Crear nueva entrada
          await database.query(
            `
            INSERT INTO vicidial_live_agents 
            (user, server_ip, conf_exten, status, campaign_id, lead_id, random_id, user_level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [user_id, serverIp, '8300', 'READY', campaign_id, 0, Math.floor(Math.random() * 99999999), 1]
          );
        }
      } catch (liveAgentErr) {
        console.error('[Public Campaigns] Error creando live agent entry:', liveAgentErr.message);
        // Continuamos aunque falle
      }
    } catch (err) {
      console.error('[Public Campaigns] Error creando remote agent:', err.message);
      // Continuamos aunque falle la creación del remote agent
    }

    return res.json({
      success: true,
      campaign_id,
      playback_mode: normalizedMode,
    });
  } catch (error) {
    console.error('[Public Campaigns] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/campaigns/:campaign_id/status', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { status } = req.body || {}; // User requested passing 0 or 1

    if (status === undefined || (status !== 0 && status !== 1 && status !== '0' && status !== '1')) {
      return res.status(400).json({ success: false, error: 'Status es requerido (1=activo, 0=inactivo)' });
    }

    let result;
    if (String(status) === '1') {
      result = await databaseService.startCampaign(campaign_id);
    } else {
      result = await databaseService.stopCampaign(campaign_id);
    }

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

router.post('/lists/import', upload.single('file'), async (req, res) => {
  try {
    const {
      list_id,
      list_name,
      campaign_id,
      active = 'Y',
      list_description,
    } = req.body || {};

    // 1. Validations
    if (!list_name || !campaign_id) {
      return res.status(400).json({
        success: false,
        error: 'list_name y campaign_id son requeridos',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Debe subir un archivo CSV con los leads',
      });
    }

    // 2. Create the List
    let resolvedListId = list_id;

    // Validate that list_id is numeric if provided. If "string" or invalid, ignore it.
    if (resolvedListId && !/^\d+$/.test(resolvedListId)) {
      console.warn(`[Unified Import] Invalid list_id provided: "${resolvedListId}". Generating new ID.`);
      resolvedListId = null;
    }

    if (!resolvedListId) {
      const nextIdResult = await database.query('SELECT MAX(list_id) as max_id FROM vicidial_lists');
      const maxId = nextIdResult[0]?.max_id ? parseInt(nextIdResult[0].max_id, 10) : 1000000;
      resolvedListId = String(Math.max(maxId + 1, 1000000));
    }

    const listResult = await vicidialApi.addList({
      list_id: resolvedListId,
      list_name,
      campaign_id,
      active,
      list_description,
    });

    if (!listResult.success) {
      // Clean up file if list creation fails
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: listResult.data || listResult.error || 'Error creando lista',
      });
    }

    // 3. Process the CSV File
    const filePath = req.file.path;
    const content = fs.readFileSync(filePath, 'utf-8');
    fs.unlinkSync(filePath); // Delete temp file immediately after reading
    const leads = parseCsv(content);

    // 4. Normalize and Filter Leads
    const normalizedLeads = leads
      .map(normalizeLead)
      .filter((lead) => lead.phone_number && String(lead.phone_number).length >= 7);

    if (normalizedLeads.length === 0) {
      return res.status(400).json({
        success: false, // List was created but no leads added? User might prefer partial success, but "Failed to fetch" implies complete failure.
        // Actually, since list IS created, we should probably return success: true but with 0 leads.
        // However, strictly speaking, the "Import" failed. 
        // Let's return success: true to acknowledge List creation, but warn about leads.
        message: 'Lista creada exitosamente, pero no se encontraron leads válidos en el archivo.',
        list_id: resolvedListId,
        total_leads: 0,
        successful_leads: 0,
        failed_leads: 0,
      });
    }

    // 5. Add Leads to the new List
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
              list_id: resolvedListId,
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

    // 6. Return Summary
    return res.json({
      success: true,
      message: 'Lista creada y leads importados',
      list_id: resolvedListId,
      list_data: listResult.data,
      import_stats: {
        total: normalizedLeads.length,
        successful: successCount,
        failed: errorCount,
        error_details: errors.slice(0, 100),
      }
    });

  } catch (error) {
    console.error('[Unified Import] Error:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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

// Exportar funciones de inicialización

router.post('/calls', async (req, res) => {
  try {
    const {
      agent_user = process.env.DEFAULT_API_AGENT,
      phone_number,
      phone_code = '57',
      campaign_id = process.env.DEFAULT_API_CAMPAIGN,
      caller_id,
      audio_name,
    } = req.body || {};

    if (!agent_user || !phone_number) {
      return res.status(400).json({
        success: false,
        error: 'agent_user y phone_number son requeridos (o configurar defaults)',
      });
    }

    let result;

    // For APIAPI0009, use the Custom Dialer directly
    if (agent_user === 'APIAPI0009') {
      let cleanPhone = String(phone_number).replace(/[^0-9]/g, '');
      // Validate and fix prefix
      if (cleanPhone.length === 10) {
        cleanPhone = '57' + cleanPhone;
      }
      // If it's already 12 digits starting with 57, leave it.
      // If it's something else, pass it through (risk of failure but better than forcing double 57)

      console.log(`[Public Calls] Using Custom Dialer for ${agent_user} -> ${cleanPhone}`);
      result = await vicidialApi.customDial({
        phone_number: cleanPhone,
        caller_id,
        audio_name
      });
    } else {
      // Standard external_dial for other agents
      result = await vicidialApi.externalDial({
        agent_user,
        phone_number: String(phone_number).replace(/[^0-9]/g, ''),
        phone_code,
      });

      // Check for "not paused" error (Legacy logic for standard agents)
      if (!result.success && result.data && result.data.includes('is not paused')) {
        console.log(`[Public Calls] Agent ${agent_user} not paused. Attempting auto-pause...`);

        const pauseResult = await vicidialApi.externalPause({ agent_user });

        if (pauseResult.success) {
          console.log(`[Public Calls] Agent ${agent_user} API pause request successful. Verifying status...`);

          // Wait a moment
          await new Promise(r => setTimeout(r, 1000));

          // Verify if agent is actually PAUSED
          try {
            console.log(`[Public Calls] Forcing agent ${agent_user} to PAUSED and clearing lead_id...`);
            await database.query(
              "UPDATE vicidial_live_agents SET status = 'PAUSED', lead_id = 0, uniqueid = 0, channel = '', callerid = '' WHERE user = ?",
              [agent_user]
            );
            // Wait for DB update to propagate
            await new Promise(r => setTimeout(r, 500));
          } catch (dbErr) {
            console.error('[Public Calls] DB Error asserting pause:', dbErr);
          }

          console.log(`[Public Calls] Retrying dial for ${agent_user}...`);

          // Retry dial
          result = await vicidialApi.externalDial({
            agent_user,
            phone_number: String(phone_number).replace(/[^0-9]/g, ''),
            phone_code,
          });
        } else {
          console.error(`[Public Calls] Failed to auto-pause agent ${agent_user}:`, pauseResult.data);
        }
      }
    }

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
module.exports.ensureApiKeysTable = ensureApiKeysTable;