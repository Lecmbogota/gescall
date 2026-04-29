const pg = require('../config/pgDatabase');

function extractApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey) return String(headerKey).trim();

  const authHeader = req.headers.authorization || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return '';
}

function getConfiguredKeys() {
  const raw = process.env.PUBLIC_API_KEYS || process.env.PUBLIC_API_KEY || '';
  return raw
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
}

async function publicApiAuth(req, res, next) {
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized (No API Key Provided)',
    });
  }

  // 1. Check static ENV keys first for super-admin / legacy fallback
  const keys = getConfiguredKeys();
  if (keys.includes(apiKey)) {
    req.user = { role: 'ADMIN', username: 'api_system' }; // Mock object
    return next();
  }

  // 2. Check Database for dynamically generated tokens
  try {
    const userResult = await pg.query(
      `SELECT u.user_id, u.username, r.role_name AS role
       FROM gescall_users u
       LEFT JOIN gescall_roles r ON u.role_id = r.role_id
       WHERE u.api_token = $1 AND u.active = true`,
      [apiKey]
    );

    if (userResult.rows.length > 0) {
      req.user = userResult.rows[0]; // { user_id, username, role }
      return next();
    }
  } catch (err) {
    console.error('[publicApiAuth] DB Error validating token:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error validating token' });
  }

  // 3. Reject if no match
  return res.status(401).json({
    success: false,
    error: 'Unauthorized (Invalid API Key)',
  });
}

module.exports = {
  publicApiAuth,
};
