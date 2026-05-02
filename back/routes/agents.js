const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');
const redis = require('../config/redisClient');
const { exec } = require('child_process');

// Check Asterisk PJSIP endpoint registration status
function getExtensionStatus(extension) {
    return new Promise((resolve) => {
        if (!extension) return resolve('N/A');
        exec(`asterisk -rx "pjsip show endpoint ${extension}" 2>/dev/null`, (err, stdout) => {
            if (err || !stdout) return resolve('Offline');
            // The state line looks like: " Endpoint:  100    Not in use    0 of inf"
            // Possible states: Not in use, Unavailable, In use, Busy, etc.
            if (stdout.includes('not found') || stdout.includes('object not found') || stdout.includes('Unable to find')) {
                resolve('Offline');
            } else if (stdout.match(new RegExp(`Endpoint:\\s+${extension}\\s+Unavailable`))) {
                resolve('Offline');
            } else if (stdout.match(new RegExp(`Endpoint:\\s+${extension}\\s+(Not in use|In use|Busy|Reachable)`))) {
                resolve('Online');
            } else if (stdout.includes('Endpoint:')) {
                // Endpoint exists but in an unknown state — assume online
                resolve('Online');
            } else {
                resolve('Offline');
            }
        });
    });
}

/**
 * GET /api/agents/logged-in
 * Get all agents with real-time status from Redis + Asterisk SIP
 */
router.get('/logged-in', async (req, res) => {
    try {
        // 1. Get all users with SIP extensions
        const { rows: users } = await pg.query(
            `SELECT u.user_id, u.username, u.role_id, r.role_name as role,
                    u.active, u.sip_extension, u.sip_password, u.created_at
             FROM gescall_users u
             LEFT JOIN gescall_roles r ON u.role_id = r.role_id
             WHERE u.active = true
             ORDER BY u.username ASC`
        );

        // 2. Get campaign assignments for all users (single query)
        const { rows: assignments } = await pg.query(
            `SELECT uc.user_id, c.campaign_id, c.campaign_name
             FROM gescall_user_campaigns uc
             JOIN gescall_campaigns c ON uc.campaign_id = c.campaign_id
             ORDER BY uc.user_id`
        );

        // Build campaign map: user_id -> [{ id, name }]
        const campaignMap = {};
        for (const a of assignments) {
            if (!campaignMap[a.user_id]) campaignMap[a.user_id] = [];
            campaignMap[a.user_id].push({ id: a.campaign_id, name: a.campaign_name });
        }

        // 3. Fetch Redis agent states in parallel with SIP extension statuses
        const agents = await Promise.all(users.map(async (user) => {
            // Redis agent workspace state
            let agentState = 'OFFLINE';
            let lastChange = null;
            try {
                const stateMap = await redis.hGetAll(`gescall:agent:${user.username}`);
                if (stateMap && stateMap.state) {
                    agentState = stateMap.state;
                    lastChange = stateMap.last_change ? parseInt(stateMap.last_change) : null;
                }
            } catch (redisErr) {
                // Single key failure shouldn't break the whole list
            }

            // SIP extension registration status (Asterisk PJSIP)
            let extensionStatus = 'N/A';
            if (user.sip_extension) {
                extensionStatus = await getExtensionStatus(user.sip_extension);
            }

            return {
                user_id: user.user_id,
                username: user.username,
                full_name: user.username,
                role: user.role,
                active: user.active,
                sip_extension: user.sip_extension || null,
                sip_password: user.sip_password || null,
                agent_state: agentState,
                last_change: lastChange,
                extension_status: extensionStatus,
                campaigns: campaignMap[user.user_id] || [],
                campaign_ids: (campaignMap[user.user_id] || []).map(c => c.id),
                created_at: user.created_at
            };
        }));

        res.json({
            success: true,
            data: agents,
            count: agents.length
        });
    } catch (error) {
        console.error('[agents logged-in] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/agents/:agent_user/status
 * Get status of a specific agent (Redis + SIP)
 */
router.get('/:agent_user/status', async (req, res) => {
    try {
        const agentUser = req.params.agent_user;

        // Get user info from DB
        const { rows: users } = await pg.query(
            `SELECT user_id, username, sip_extension
             FROM gescall_users
             WHERE username = $1 OR user_id::text = $1
             LIMIT 1`,
            [agentUser]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        const user = users[0];

        // Redis workspace state
        let agentState = 'OFFLINE';
        let lastChange = null;
        try {
            const stateMap = await redis.hGetAll(`gescall:agent:${user.username}`);
            if (stateMap && stateMap.state) {
                agentState = stateMap.state;
                lastChange = stateMap.last_change ? parseInt(stateMap.last_change) : null;
            }
        } catch (redisErr) {}

        // SIP extension status
        let extensionStatus = 'N/A';
        if (user.sip_extension) {
            extensionStatus = await getExtensionStatus(user.sip_extension);
        }

        // Get assigned campaigns
        const { rows: campaigns } = await pg.query(
            `SELECT c.campaign_id, c.campaign_name
             FROM gescall_user_campaigns uc
             JOIN gescall_campaigns c ON uc.campaign_id = c.campaign_id
             WHERE uc.user_id = $1`,
            [user.user_id]
        );

        res.json({
            success: true,
            data: {
                user: user.username,
                user_id: user.user_id,
                sip_extension: user.sip_extension,
                agent_state: agentState,
                last_change: lastChange,
                extension_status: extensionStatus,
                campaigns: campaigns.map(c => ({ id: c.campaign_id, name: c.campaign_name })),
                status: agentState // legacy field
            }
        });
    } catch (error) {
        console.error('[agents status] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
