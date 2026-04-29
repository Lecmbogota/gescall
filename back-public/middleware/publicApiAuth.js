const database = require('../config/database');

function extractApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey) return String(headerKey).trim();

  const authHeader = req.headers.authorization || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return '';
}

async function validateApiKey(apiKey) {
  try {
    if (!apiKey) return null;

    // Verificar en la base de datos
    const result = await database.query(
      `
      SELECT api_key, username, expires_at, is_active 
      FROM gescall_api_keys 
      WHERE api_key = ? AND is_active = 1
      LIMIT 1
      `,
      [apiKey]
    );

    if (result.length === 0) {
      // Fallback: verificar en variables de entorno (para compatibilidad)
      const raw = process.env.PUBLIC_API_KEYS || process.env.PUBLIC_API_KEY || '';
      const keys = raw
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean);

      if (keys.includes(apiKey)) {
        return { username: 'admin', is_fallback: true }; // Default admin for env keys
      }
      return null;
    }

    const keyData = result[0];

    // Verificar expiración
    const now = new Date();
    const expiresAt = new Date(keyData.expires_at);

    if (now > expiresAt) {
      // Marcar como inactivo si expiró
      await database.query(
        'UPDATE gescall_api_keys SET is_active = 0 WHERE api_key = ?',
        [apiKey]
      );
      return null;
    }

    // Actualizar last_used_at
    await database.query(
      'UPDATE gescall_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE api_key = ?',
      [apiKey]
    );

    return { username: keyData.username, api_key: keyData.api_key };
  } catch (error) {
    console.error('[PublicApiAuth] Error validando API key:', error.message);
    // Fallback on error
    const raw = process.env.PUBLIC_API_KEYS || process.env.PUBLIC_API_KEY || '';
    const keys = raw.split(',').map((k) => k.trim()).filter(Boolean);
    if (keys.includes(apiKey)) return { username: 'admin', is_fallback: true };
    return null;
  }
}

async function publicApiAuth(req, res, next) {
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - API key requerida',
    });
  }

  const userData = await validateApiKey(apiKey);

  if (!userData) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - API key inválida o expirada',
    });
  }

  // Fetch user_group from vicidial_users if username is present
  if (userData.username) {
    try {
      const userResult = await database.query(
        'SELECT user_group, user_level FROM vicidial_users WHERE user = ? LIMIT 1',
        [userData.username]
      );
      if (userResult.length > 0) {
        userData.user_group = userResult[0].user_group;
        userData.user_level = userResult[0].user_level;
      }
    } catch (dbError) {
      console.error('[PublicApiAuth] Error fetching user group:', dbError);
    }
  }

  req.user = userData;
  return next();
}

module.exports = {
  publicApiAuth,
};
