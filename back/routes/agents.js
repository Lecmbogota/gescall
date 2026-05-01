const express = require('express');
const router = express.Router();

/**
 * GET /api/agents/logged-in
 * Get all logged in agents (Native Mode)
 */
router.get('/logged-in', async (req, res) => {
    try {
        // In native Postgres/Asterisk mode, agent sessions are not tracked in Vicidial tables.
        // For now, return an empty array until a native agent portal is fully built.
        res.json({
            success: true,
            data: [],
            count: 0
        });
    } catch (error) {
        console.error('[pg_agents logged-in] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/agents/:agent_user/status
 * Get status of a specific agent
 */
router.get('/:agent_user/status', async (req, res) => {
    try {
        // Mocked response for native mode.
        res.json({
            success: true,
            data: {
                user: req.params.agent_user,
                status: 'OFFLINE'
            }
        });
    } catch (error) {
        console.error('[pg_agents status] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
