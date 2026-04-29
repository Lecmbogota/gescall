/**
 * GesCall JWT Authentication Middleware
 * Protects all API routes except /api/auth and /api/health
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pg = require('../config/pgDatabase'); // Import PostgreSQL database

// Generate a secret on first run, or use env variable
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

// Store the generated secret for this process
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = JWT_SECRET;
    console.log('[Auth] JWT secret auto-generated (set JWT_SECRET in .env for persistence across restarts)');
}

/**
 * Generate a JWT token for a user
 */
function generateToken(user) {
    return jwt.sign(
        {
            username: user.username,
            role: user.role_name || user.role,
            role_id: user.role_id,
            user_id: user.user_id,
            is_system: user.is_system || false
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

/**
 * Middleware to verify JWT token or DB API Key
 * Skips: /api/auth/*, /api/health, /api/docs*, /api/public*, /api/v1*
 */
async function requireAuth(req, res, next) {
    // Skip auth for these paths (relative to mount point)
    // When mounted as app.use('/api', requireAuth), req.path = '/auth/login'
    // When mounted as app.use(requireAuth), req.path = '/api/auth/login'
    const path = req.path || req.url || '';
    const originalUrl = req.originalUrl || '';

    const skipPatterns = ['/auth', '/health', '/public', '/v1', '/tickets/webhook'];

    if (skipPatterns.some(skip => path.startsWith(skip) || originalUrl.startsWith(skip) || originalUrl.startsWith(`/api${skip}`))) {
        return next();
    }

    // Also skip for root path
    if (path === '/' || path === '') {
        return next();
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // Fallback: check X-API-Key for backward compatibility with publicApiAuth
        const apiKey = req.headers['x-api-key'] || req.headers['x-api-token'];
        if (apiKey) {
            // Priority 1: Check if API Key matches a user in the Database
            try {
                const query = `
                    SELECT u.user_id, u.username, u.role_id, r.role_name, r.is_system 
                    FROM gescall_users u
                    LEFT JOIN gescall_roles r ON u.role_id = r.role_id
                    WHERE u.api_token = $1 AND u.active = true
                `;
                const result = await pg.query(query, [apiKey]);
                if (result.rows.length > 0) {
                    const dbUser = result.rows[0];
                    req.user = {
                        role: dbUser.role_name,
                        role_id: dbUser.role_id,
                        username: dbUser.username,
                        user_id: dbUser.user_id,
                        is_system: dbUser.is_system
                    };
                    return next();
                }
            } catch (err) {
                console.error('[Auth] Error querying API Token from DB:', err.message);
                // Continue to check PUBLIC_API_KEYS below if DB fails or doesn't match
            }

            // Priority 2: Delegate to publicApiAuth style validation (.env key)
            const keys = (process.env.PUBLIC_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
            if (keys.includes(apiKey)) {
                req.user = { role: 'SUPER-ADMIN', username: 'api_system', is_system: true };
                return next();
            }
        }

        return res.status(401).json({
            success: false,
            error: 'Autenticación requerida. Envíe un token Bearer en el encabezado Authorization o una X-API-Key con un token válido.'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { username, role, user_id, iat, exp }
        return next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'Token expired. Please login again.' });
        }
        return res.status(401).json({ success: false, error: 'Invalid token.' });
    }
}

module.exports = { generateToken, requireAuth, JWT_SECRET };
