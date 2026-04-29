const express = require('express');
const router = express.Router();
const multer = require('multer');
const databaseService = require('../services/databaseService');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' ||
            file.mimetype === 'text/plain' ||
            file.originalname.toLowerCase().endsWith('.csv') ||
            file.originalname.toLowerCase().endsWith('.txt')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos CSV o TXT'));
        }
    }
});

// Validation regex by country
const COUNTRY_REGEX = {
    CO: /^3[0-9]{9}$/,      // Colombia: 10 digits starting with 3
    MX: /^[2-9][0-9]{9}$/,   // Mexico: 10 digits starting with 2-9
    US: /^[2-9][0-9]{9}$/    // US: 10 digits (NPA-NXX-XXXX)
};

/**
 * Validate CallerID format
 */
function validateCallerIdFormat(callerid, countryCode = 'CO') {
    const clean = callerid.replace(/[^0-9]/g, '');
    const regex = COUNTRY_REGEX[countryCode] || COUNTRY_REGEX.CO;
    return regex.test(clean) ? clean : null;
}

// ==================== POOLS CRUD ====================

/**
 * GET /api/callerid-pools
 * List all pools with stats
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        const result = await databaseService.getCallerIdPools(limit, offset, search);

        res.json({
            success: true,
            data: result.data,
            pagination: {
                total: result.total,
                page,
                limit,
                pages: Math.ceil(result.total / limit)
            }
        });
    } catch (error) {
        console.error('[CallerID Pools List] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/callerid-pools/:id
 * Get single pool with stats
 */
router.get('/:id', async (req, res) => {
    try {
        const pool = await databaseService.getCallerIdPoolById(req.params.id);
        if (!pool) {
            return res.status(404).json({ success: false, error: 'Pool no encontrado' });
        }
        res.json({ success: true, data: pool });
    } catch (error) {
        console.error('[CallerID Pool Get] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/callerid-pools
 * Create a new pool
 */
router.post('/', async (req, res) => {
    try {
        const { name, description, country_code } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }

        const result = await databaseService.createCallerIdPool(name.trim(), description || '', country_code || 'CO');
        res.json({ success: true, data: { id: result.id }, message: 'Pool creado exitosamente' });
    } catch (error) {
        console.error('[CallerID Pool Create] Error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: 'Ya existe un pool con ese nombre' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/callerid-pools/:id
 * Update a pool
 */
router.put('/:id', async (req, res) => {
    try {
        const { name, description, country_code, is_active } = req.body;

        const result = await databaseService.updateCallerIdPool(req.params.id, {
            name, description, country_code, is_active
        });

        res.json({ success: true, message: 'Pool actualizado' });
    } catch (error) {
        console.error('[CallerID Pool Update] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/callerid-pools/:id
 * Delete a pool
 */
router.delete('/:id', async (req, res) => {
    try {
        await databaseService.deleteCallerIdPool(req.params.id);
        res.json({ success: true, message: 'Pool eliminado' });
    } catch (error) {
        console.error('[CallerID Pool Delete] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== POOL NUMBERS ====================

/**
 * GET /api/callerid-pools/:id/numbers
 * Get numbers in a pool
 */
router.get('/:id/numbers', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        const result = await databaseService.getPoolNumbers(req.params.id, limit, offset, search);

        res.json({
            success: true,
            data: result.data,
            pagination: {
                total: result.total,
                page,
                limit,
                pages: Math.ceil(result.total / limit)
            }
        });
    } catch (error) {
        console.error('[Pool Numbers List] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/callerid-pools/:id/area-codes
 * Get area codes in a pool
 */
router.get('/:id/area-codes', async (req, res) => {
    try {
        const data = await databaseService.getPoolAreaCodes(req.params.id);
        res.json({ success: true, data });
    } catch (error) {
        console.error('[Pool Area Codes] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/callerid-pools/:id/numbers
 * Add a single number to pool
 */
router.post('/:id/numbers', async (req, res) => {
    try {
        const { callerid } = req.body;
        const pool = await databaseService.getCallerIdPoolById(req.params.id);

        if (!pool) {
            return res.status(404).json({ success: false, error: 'Pool no encontrado' });
        }

        const validNumber = validateCallerIdFormat(callerid, pool.country_code);
        if (!validNumber) {
            return res.status(400).json({ success: false, error: `Formato de CallerID inválido para ${pool.country_code}` });
        }

        const result = await databaseService.addPoolNumber(req.params.id, validNumber);
        res.json({ success: true, data: { id: result.id }, message: 'Número agregado' });
    } catch (error) {
        console.error('[Pool Number Add] Error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: 'Este número ya existe en el pool' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/callerid-pools/:id/import
 * Bulk import numbers from text/CSV
 */
router.post('/:id/import', upload.single('file'), async (req, res) => {
    try {
        const pool = await databaseService.getCallerIdPoolById(req.params.id);
        if (!pool) {
            return res.status(404).json({ success: false, error: 'Pool no encontrado' });
        }

        let rawContent = '';

        // Accept file upload OR text body
        if (req.file) {
            rawContent = req.file.buffer.toString('utf-8');
        } else if (req.body.numbers) {
            rawContent = req.body.numbers;
        } else {
            return res.status(400).json({ success: false, error: 'No se proporcionaron números' });
        }

        // Parse numbers
        const lines = rawContent.split(/[\r\n,;]+/);
        const validNumbers = [];
        const invalidNumbers = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Extract digits only
            const clean = trimmed.replace(/[^0-9]/g, '');
            const validNumber = validateCallerIdFormat(clean, pool.country_code);

            if (validNumber) {
                validNumbers.push(validNumber);
            } else if (clean.length > 0) {
                invalidNumbers.push(trimmed);
            }
        }

        // Deduplicate
        const uniqueNumbers = [...new Set(validNumbers)];

        if (uniqueNumbers.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No se encontraron números válidos',
                invalid_count: invalidNumbers.length
            });
        }

        // Bulk insert
        const result = await databaseService.bulkAddPoolNumbers(req.params.id, uniqueNumbers);

        res.json({
            success: true,
            message: 'Importación completada',
            data: {
                total_found: uniqueNumbers.length,
                inserted: result.count,
                skipped: uniqueNumbers.length - result.count,
                invalid: invalidNumbers.length
            }
        });
    } catch (error) {
        console.error('[Pool Import] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/callerid-pools/:poolId/numbers/:numberId
 * Delete a number from pool
 */
router.delete('/:poolId/numbers/:numberId', async (req, res) => {
    try {
        await databaseService.deletePoolNumber(req.params.numberId);
        res.json({ success: true, message: 'Número eliminado' });
    } catch (error) {
        console.error('[Pool Number Delete] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/callerid-pools/:poolId/numbers/:numberId/toggle
 * Toggle number active status
 */
router.put('/:poolId/numbers/:numberId/toggle', async (req, res) => {
    try {
        const { is_active } = req.body;
        await databaseService.togglePoolNumber(req.params.numberId, is_active);
        res.json({ success: true, message: is_active ? 'Número activado' : 'Número desactivado' });
    } catch (error) {
        console.error('[Pool Number Toggle] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== USAGE LOGS ====================

/**
 * GET /api/callerid-pools/:id/logs
 * Get usage logs for a pool
 */
router.get('/:id/logs', async (req, res) => {
    try {
        const logs = await databaseService.getCallerIdUsageLogs({
            pool_id: req.params.id,
            limit: parseInt(req.query.limit) || 100,
            offset: parseInt(req.query.offset) || 0,
            start_date: req.query.start_date,
            end_date: req.query.end_date
        });

        res.json({ success: true, data: logs });
    } catch (error) {
        console.error('[Pool Logs] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
