const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');

// Get all DIDs for a specific campaign
router.get('/campaign/:campaignId', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const result = await pg.query(
            `SELECT d.*, t.trunk_name 
             FROM gescall_inbound_dids d 
             LEFT JOIN gescall_trunks t ON d.trunk_id = t.trunk_id 
             WHERE d.campaign_id = $1 
             ORDER BY d.created_at DESC`,
            [campaignId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('[DIDs API] Error fetching DIDs:', error);
        res.status(500).json({ success: false, error: 'Database error fetching DIDs' });
    }
});

// Add a new DID to a campaign
router.post('/campaign/:campaignId', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { did_number, description, trunk_id } = req.body;

        if (!did_number) {
            return res.status(400).json({ success: false, error: 'DID number is required' });
        }

        const result = await pg.query(
            'INSERT INTO gescall_inbound_dids (did_number, campaign_id, description, active, trunk_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [did_number, campaignId, description || '', true, trunk_id || null]
        );

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('[DIDs API] Error adding DID:', error);
        if (error.code === '23505') { // unique violation
            return res.status(409).json({ success: false, error: 'Este número DID ya está registrado' });
        }
        res.status(500).json({ success: false, error: 'Database error adding DID' });
    }
});

// Delete a DID
router.delete('/:didId', async (req, res) => {
    try {
        const { didId } = req.params;
        
        const result = await pg.query('DELETE FROM gescall_inbound_dids WHERE did_id = $1 RETURNING did_id', [didId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'DID not found' });
        }

        res.json({ success: true, message: 'DID deleted successfully' });
    } catch (error) {
        console.error('[DIDs API] Error deleting DID:', error);
        res.status(500).json({ success: false, error: 'Database error deleting DID' });
    }
});

// Toggle DID status
router.put('/:didId/toggle', async (req, res) => {
    try {
        const { didId } = req.params;
        const { active } = req.body;
        
        const result = await pg.query(
            'UPDATE gescall_inbound_dids SET active = $1 WHERE did_id = $2 RETURNING *', 
            [active, didId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'DID not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('[DIDs API] Error toggling DID:', error);
        res.status(500).json({ success: false, error: 'Database error toggling DID' });
    }
});

module.exports = router;
