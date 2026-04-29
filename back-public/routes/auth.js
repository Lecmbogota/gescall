const express = require('express');
const router = express.Router();
const vicidialApi = require('../services/vicidialApi');
const databaseService = require('../services/databaseService');
const crypto = require('crypto');

// Generate ephemeral RSA keypair for client-side encryption
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

console.log('[Auth] RSA key pair generated');

// GET /api/auth/pubkey - expose public key for encryption
router.get('/pubkey', (req, res) => {
  return res.json({ success: true, publicKey });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { agent_user, password, agent_user_enc, password_enc } = req.body;

  if (!agent_user && !agent_user_enc) {
    return res.status(400).json({ success: false, error: 'agent_user is required' });
  }

  if (!password && !password_enc) {
    return res.status(400).json({ success: false, error: 'password is required' });
  }

  // Decrypt if encrypted payload is provided
  let agentUser = agent_user || null;
  let passwordPlain = password || null;

  try {
    if (agent_user_enc) {
      const decUserBuf = crypto.privateDecrypt(
        { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(agent_user_enc, 'base64')
      );
      agentUser = decUserBuf.toString('utf8');
    }
    if (password_enc) {
      const decPassBuf = crypto.privateDecrypt(
        { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(password_enc, 'base64')
      );
      passwordPlain = decPassBuf.toString('utf8');
    }
  } catch (e) {
    console.error('[Auth] Decryption failed:', e);
    return res.status(400).json({ success: false, error: 'Decryption failed' });
  }

  try {
    console.log('[Auth] ========================================');
    console.log('[Auth] Login attempt started');
    console.log('[Auth] User:', agentUser);
    console.log('[Auth] Timestamp:', new Date().toISOString());
    console.log('[Auth] ========================================');

    // 1) USER DETAILS (info básica) - This validates credentials against Vicidial
    console.log('[Auth] Step 1: Fetching user details from Vicidial...');
    const details = await vicidialApi.request({
      function: 'user_details',
      agent_user: agentUser,
      stage: 'pipe',
      header: 'YES',
      user: agentUser,
      pass: passwordPlain,
    });

    if (!details.success) {
      console.error('[Auth] ✗ Authentication failed for user:', agentUser);
      console.error('[Auth] ✗ Vicidial response:', details.data);
      console.error('[Auth] ========================================');
      return res.status(401).json({
        success: false,
        error: details.data || 'Invalid credentials or user not found',
        errorCode: 'AUTH_FAILED'
      });
    }

    console.log('[Auth] ✓ User details retrieved successfully');

    const parsedDetails = vicidialApi.parseResponse(details.data);
    const user = parsedDetails && parsedDetails.length ? parsedDetails[0] : null;

    if (!user) {
      console.error('[Auth] No user data returned for:', agentUser);
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // 2) CAMPAIGNS & INGROUPS (permisos de acceso)
    console.log('[Auth] Fetching agent campaigns...');
    const campaignsRes = await vicidialApi.request({
      function: 'agent_campaigns',
      agent_user: agentUser,
      stage: 'pipe',
      header: 'YES',
      user: agentUser,
      pass: passwordPlain,
    });

    let campaigns = [];
    let ingroups = [];
    let campaignsDetailed = [];

    if (campaignsRes.success) {
      const parsed = vicidialApi.parseResponse(campaignsRes.data);
      console.log('[Auth] ========================================');
      console.log('[Auth] Raw agent campaigns response:', campaignsRes.data);
      console.log('[Auth] Parsed agent campaigns:', JSON.stringify(parsed, null, 2));
      console.log('[Auth] ========================================');

      if (parsed && parsed.length) {
        const row = parsed[0];
        const campaignStr = row.allowed_campaigns_list || '';
        const ingroupStr = row.allowed_ingroups_list || '';

        console.log('[Auth] Campaign string from Vicidial:', campaignStr);
        console.log('[Auth] Ingroup string from Vicidial:', ingroupStr);

        campaigns = campaignStr ? campaignStr.split('-').filter(Boolean) : [];
        ingroups = ingroupStr ? ingroupStr.split('-').filter(Boolean) : [];

        console.log('[Auth] Parsed campaigns array:', campaigns);
        console.log('[Auth] Parsed ingroups array:', ingroups);

        // Build detailed campaigns array with objects
        campaignsDetailed = campaigns.map(campaignId => ({
          id: campaignId,
          name: campaignId, // You can fetch campaign names from campaigns_list API if needed
          active: true
        }));

        console.log('[Auth] Detailed campaigns:', JSON.stringify(campaignsDetailed, null, 2));
      }
    } else {
      console.warn('[Auth] Failed to fetch agent campaigns:', campaignsRes.data);
    }

    // WORKAROUND: If user is admin (level 9) and has no campaigns, fetch all campaigns from DB
    const userLevel = user?.user_level ? Number(user.user_level) : 0;
    if (userLevel === 9 && campaigns.length === 0) {
      console.log('[Auth] ⚠️ Admin user with no campaigns assigned in Vicidial');
      console.log('[Auth] 🔧 Fetching all campaigns from database as workaround...');

      try {
        const allCampaigns = await databaseService.getAllCampaigns();
        campaigns = allCampaigns.map(c => c.campaign_id);
        campaignsDetailed = allCampaigns.map(c => ({
          id: c.campaign_id,
          name: c.campaign_name || c.campaign_id,
          active: c.active === 'Y'
        }));

        console.log('[Auth] ✓ Loaded all campaigns from database:', campaigns.length);
        console.log('[Auth] ✓ Campaign IDs:', campaigns.join(', '));
      } catch (err) {
        console.error('[Auth] ✗ Failed to fetch campaigns from database:', err);
      }
    }

    // 3) USER GROUP STATUS (más detalles de permisos)
    let userGroupStatus = null;

    if (user?.user_group) {
      const ugRes = await vicidialApi.request({
        function: 'user_group_status',
        user_groups: user.user_group,
        stage: 'pipe',
        header: 'YES',
        user: agentUser,
        pass: passwordPlain,
      });
      if (ugRes.success) {
        const parsedUG = vicidialApi.parseResponse(ugRes.data);
        userGroupStatus = parsedUG && parsedUG.length ? parsedUG : null;
      }
    }

    // 4) INGROUP STATUS
    let inGroupStatus = null;

    if (ingroups.length > 0) {
      const igRes = await vicidialApi.request({
        function: 'in_group_status',
        in_groups: ingroups.join('-'),
        stage: 'pipe',
        header: 'YES',
        user: agentUser,
        pass: passwordPlain,
      });
      if (igRes.success) {
        inGroupStatus = vicidialApi.parseResponse(igRes.data);
      }
    }

    // 5) AGENT STATUS (sesión actual, IP, estado en tiempo real)
    let agentStatus = null;
    let agentStatusError = null;
    const agentStatusRes = await vicidialApi.request({
      function: 'agent_status',
      agent_user: agentUser,
      stage: 'pipe',
      header: 'YES',
      include_ip: 'YES',
      user: agentUser,
      pass: passwordPlain,
    });
    if (agentStatusRes.success) {
      const parsed = vicidialApi.parseResponse(agentStatusRes.data);
      agentStatus = parsed && parsed.length ? parsed[0] : null;
    } else {
      agentStatusError = agentStatusRes.data || 'AGENT_STATUS_UNAVAILABLE';
    }

    // 6) LOGGED IN AGENTS (si el agente está logueado en alguna campaña)
    let loggedInAgent = null;
    const loggedRes = await vicidialApi.request({
      function: 'logged_in_agents',
      show_sub_status: 'YES',
      stage: 'pipe',
      header: 'YES',
      user: agentUser,
      pass: passwordPlain,
    });
    if (loggedRes.success) {
      const parsed = vicidialApi.parseResponse(loggedRes.data);
      loggedInAgent = parsed.find((row) => row.user === agentUser) || null;
    }

    // Armar JSON completo de información del usuario
    const permissions = {
      user_group: user?.user_group || null,
      user_level: user?.user_level ? Number(user.user_level) : null,
      active: user?.active === 'Y',
      campaigns, // Array of campaign IDs
      ingroups,  // Array of ingroup IDs
    };

    // Build structured user object
    const userStructured = {
      id: user?.user || agentUser,
      name: user?.full_name || agentUser,
      group: user?.user_group || null,
      level: user?.user_level ? Number(user.user_level) : 0,
      active: user?.active === 'Y',
      email: user?.email || null,
      phone_login: user?.phone_login || null,
      user_code: user?.user_code || null,
      territory: user?.territory || null,
    };

    const userInfo = {
      timestamp: new Date().toISOString(),
      agent_user: agentUser,

      // Structured user data for easy access
      user: userStructured,

      // Detailed campaigns with objects (as requested)
      campaigns: campaignsDetailed,

      // Complete permissions object
      permissions,

      // Raw Vicidial user data (for backwards compatibility)
      vicidialUser: user,

      // Additional status information
      userGroupStatus,
      inGroupStatus,
      agentStatus,
      agentStatusError,
      loggedInAgent,

      // Helper flag
      isLogged: true,
    };

    console.log('[Auth] ✓ Login successful for user:', agentUser);
    console.log('[Auth] ✓ User level:', user.user_level);
    console.log('[Auth] ✓ Campaigns:', campaigns.join(', '));
    console.log('[Auth] ✓ User Info JSON:', JSON.stringify(userInfo, null, 2));

    return res.json({ success: true, ...userInfo });
  } catch (error) {
    console.error('[Auth] ========================================');
    console.error('[Auth] ✗ CRITICAL ERROR during login');
    console.error('[Auth] ✗ User:', agentUser);
    console.error('[Auth] ✗ Error:', error.message);
    console.error('[Auth] ✗ Stack:', error.stack);
    console.error('[Auth] ========================================');

    // Check if it's a MySQL database error
    if (error.message && (
      error.message.includes('MySQL connect ERROR') ||
      error.message.includes('ECONNREFUSED') && error.message.includes('3306')
    )) {
      return res.status(503).json({
        success: false,
        error: 'MySQL connect ERROR: Connection refused',
        errorCode: 'DATABASE_UNAVAILABLE',
        details: 'No se puede conectar a la base de datos MySQL. Verifique que el servidor esté corriendo y accesible.'
      });
    }

    // Check if it's a Vicidial API error
    if (error.message && error.message.includes('ECONNREFUSED')) {
      return res.status(502).json({
        success: false,
        error: 'Cannot connect to Vicidial server',
        errorCode: 'VICIDIAL_UNAVAILABLE'
      });
    }

    if (error.message && error.message.includes('timeout')) {
      return res.status(504).json({
        success: false,
        error: 'Vicidial server timeout',
        errorCode: 'VICIDIAL_TIMEOUT'
      });
    }

    // Generic internal error
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      errorCode: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/auth/verify
 * Verify if a session is still valid by checking against Vicidial
 */
router.post('/verify', async (req, res) => {
  try {
    const { agent_user, password } = req.body;

    if (!agent_user || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing credentials',
      });
    }

    // Verify credentials against Vicidial
    const details = await vicidialApi.request({
      function: 'user_details',
      agent_user: agent_user,
      stage: 'pipe',
      header: 'YES',
      user: agent_user,
      pass: password,
    });

    if (!details.success) {
      return res.status(401).json({
        success: false,
        error: 'Session invalid',
      });
    }

    const parsedDetails = vicidialApi.parseResponse(details.data);
    if (!parsedDetails || parsedDetails.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      valid: true,
    });

  } catch (error) {
    console.error('[Auth] Verify error:', error);
    
    let statusCode = 500;
    let errorMessage = 'Verification failed';
    
    // Si es un error de conexión a la base de datos
    if (error.message && (
      error.message.includes('MySQL connect ERROR') ||
      error.message.includes('ECONNREFUSED') && error.message.includes('3306')
    )) {
      statusCode = 503;
      errorMessage = 'MySQL connect ERROR: Connection refused';
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      errorCode: error.code || 'VERIFICATION_ERROR',
    });
  }
});

module.exports = router;
