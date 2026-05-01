const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/jwtAuth');

// Generate ephemeral RSA keypair for client-side encryption
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

console.log('[Auth-PG] RSA key pair generated');

router.get('/pubkey', (req, res) => {
    return res.json({ success: true, publicKey });
});

router.post('/login', async (req, res) => {
    const { agent_user, password, agent_user_enc, password_enc } = req.body;

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
        return res.status(400).json({ success: false, error: 'Decryption failed' });
    }

    try {
        console.log(`[Auth-PG] Login attempt: ${agentUser}`);

        // Check against PostgreSQL native table joining with roles to get is_system flag
        // For migration purposes, if the password matches the plain text or standard hash, we allow it.
        const userQuery = await pg.query(`
            SELECT u.*, r.is_system, r.role_name 
            FROM gescall_users u 
            LEFT JOIN gescall_roles r ON u.role_id = r.role_id
            WHERE u.username = $1 AND u.active = true
        `, [agentUser]);

        if (userQuery.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        const user = userQuery.rows[0];

        // Verify password: support bcrypt hashes AND plain-text migration
        let passwordValid = false;
        if (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$')) {
            // bcrypt hash
            passwordValid = await bcrypt.compare(passwordPlain, user.password_hash);
        } else {
            // Plain text (legacy) — auto-upgrade to bcrypt on success
            passwordValid = (user.password_hash === passwordPlain);
            if (passwordValid) {
                const hashed = await bcrypt.hash(passwordPlain, 10);
                await pg.query('UPDATE gescall_users SET password_hash = $1 WHERE user_id = $2', [hashed, user.user_id]);
                console.log(`[Auth-PG] Auto-upgraded password to bcrypt for ${agentUser}`);
            }
        }

        if (!passwordValid) {
            return res.status(401).json({ success: false, error: 'Invalid password' });
        }

        // Get assigned campaigns
        let campaigns = [];
        let campaignsDetailed = [];

        if (user.is_system) {
            // System roles (SUPER-ADMIN, ADMINISTRADOR) see all active campaigns
            const campQuery = await pg.query('SELECT campaign_id, campaign_name, active FROM gescall_campaigns');
            campaigns = campQuery.rows.map(c => c.campaign_id);
            campaignsDetailed = campQuery.rows.map(c => ({
                id: c.campaign_id,
                name: c.campaign_name,
                active: c.active
            }));
        } else {
            // Agents/Managers only see assigned campaigns
            const campQuery = await pg.query(`
                SELECT c.campaign_id, c.campaign_name, c.active 
                FROM gescall_campaigns c
                JOIN gescall_user_campaigns uc ON c.campaign_id = uc.campaign_id
                WHERE uc.user_id = $1
            `, [user.user_id]);
            campaigns = campQuery.rows.map(c => c.campaign_id);
            campaignsDetailed = campQuery.rows.map(c => ({
                id: c.campaign_id,
                name: c.campaign_name,
                active: c.active
            }));
        }

        // Fetch Role Permissions
        const permQuery = await pg.query('SELECT permission FROM gescall_role_permissions WHERE role_id = $1', [user.role_id]);
        const permissionsList = permQuery.rows.map(r => r.permission);

        const userInfo = {
            timestamp: new Date().toISOString(),
            agent_user: agentUser,
            user: {
                id: user.username,
                name: user.username,
                group: user.role_name,
                role_id: user.role_id,
                level: user.is_system ? 9 : 1,
                active: user.active,
                is_system: user.is_system,
                sip_extension: user.sip_extension,
                sip_password: user.sip_password
            },
            campaigns: campaignsDetailed,
            permissions: {
                user_group: user.role_name,
                role_id: user.role_id,
                user_level: user.is_system ? 9 : 1,
                active: user.active,
                campaigns,
                ingroups: [],
                granted: permissionsList
            },
            isLogged: true
        };

        // Generate JWT token
        const token = generateToken(user);

        console.log(`[Auth-PG] Login successful for ${agentUser}`);
        return res.json({ success: true, token, ...userInfo });
    } catch (err) {
        console.error('[Auth-PG] Error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.post('/verify', async (req, res) => {
    const { agent_user } = req.body;

    // If a token is provided in Authorization header, verify it
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        try {
            const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
            return res.json({ success: true, valid: true, user: decoded });
        } catch (err) {
            return res.json({ success: false, valid: false, error: 'Token expired or invalid' });
        }
    }

    // Legacy: verify by username
    if (!agent_user) return res.status(400).json({ success: false });
    try {
        const userQuery = await pg.query('SELECT * FROM gescall_users WHERE username = $1 AND active = true', [agent_user]);
        if (userQuery.rows.length === 0) return res.json({ success: false, valid: false });
        res.json({ success: true, valid: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

module.exports = router;
