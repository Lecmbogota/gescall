const express = require('express');
const router = express.Router();
const pgDatabase = require('../config/pgDatabase');
const USE_NATIVE_DB = process.env.USE_NATIVE_DB === 'true';

// GET /api/settings
// Retrieve all global settings
router.get('/', async (req, res) => {
    /*  
        #swagger.tags = ['Dashboard']
        #swagger.description = 'Obtener configuración global de la plataforma (ej. zona horaria).'
        #swagger.security = [{ "apiKeyAuth": [] }, { "bearerAuth": [] }]
    */
    try {
        if (!USE_NATIVE_DB) {
            return res.json({ success: true, data: { timezone: 'America/Bogota' } });
        }

        const result = await pgDatabase.query('SELECT setting_key, setting_value FROM gescall_settings');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });

        // Ensure default fallback if missing
        if (!settings.timezone) settings.timezone = 'America/Bogota';

        res.json({ success: true, data: settings });
    } catch (error) {
        console.error('[Settings] Error fetching settings:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

// POST /api/settings
// Update specific settings
router.post('/', async (req, res) => {
    /*  
        #swagger.tags = ['Dashboard']
        #swagger.description = 'Actualizar configuración global de la plataforma.'
        #swagger.parameters['body'] = {
            in: 'body',
            description: 'Objeto con claves y valores a actualizar',
            required: true,
            schema: {
                timezone: 'America/Mexico_City'
            }
        }
        #swagger.security = [{ "apiKeyAuth": [] }, { "bearerAuth": [] }]
    */
    try {
        // Enforce admin privileges for updating global settings
        if (!req.user || !req.user.is_system) {
            return res.status(403).json({ success: false, error: 'Forbidden. Admin use only.' });
        }

        const updates = req.body;

        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No se enviaron configuraciones para actualizar' });
        }

        if (USE_NATIVE_DB) {
            // Update individual settings atomically
            for (const [key, value] of Object.entries(updates)) {
                if (typeof value === 'string') {
                    await pgDatabase.query(
                        `INSERT INTO gescall_settings (setting_key, setting_value, updated_at) 
                         VALUES ($1, $2, CURRENT_TIMESTAMP) 
                         ON CONFLICT (setting_key) 
                         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
                        [key, value]
                    );
                }
            }
        }

        res.json({ success: true, message: 'Configuración actualizada exitosamente' });
    } catch (error) {
        console.error('[Settings] Error updating settings:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

module.exports = router;
