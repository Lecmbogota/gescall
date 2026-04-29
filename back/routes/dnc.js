const express = require('express');
const router = express.Router();
const multer = require('multer');
const databaseService = require('../services/databaseService');

/**
 * GET /api/dnc
 * List blacklisted numbers
 * Query params: limit, page, search
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        const result = await databaseService.getDncList(limit, offset, search);

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
        console.error('[DNC List] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/dnc
 * Add number to blacklist
 * Body: { phoneNumber }
 */
router.post('/', async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }

        await databaseService.addDncNumber(phoneNumber);

        res.json({
            success: true,
            message: 'Number added to blacklist'
        });
    } catch (error) {
        console.error('[DNC Add] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/dnc/all
 * Clear all numbers from blacklist
 * IMPORTANT: This route must be before /:phoneNumber or Express will match 'all' as a phone number
 */
router.delete('/all', async (req, res) => {
    try {
        const result = await databaseService.clearAllDncNumbers();

        console.log('[DNC Clear All] Deleted:', result.deleted, 'numbers');

        res.json({
            success: true,
            message: `Se eliminaron ${result.deleted} números de la lista negra`,
            deleted: result.deleted
        });
    } catch (error) {
        console.error('[DNC Clear All] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/dnc/:phoneNumber
 * Remove number from blacklist
 */
router.delete('/:phoneNumber', async (req, res) => {
    try {
        const { phoneNumber } = req.params;

        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }

        await databaseService.removeDncNumber(phoneNumber);

        res.json({
            success: true,
            message: 'Number removed from blacklist'
        });
    } catch (error) {
        console.error('[DNC Delete] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Configure multer for CSV upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.originalname.toLowerCase().endsWith('.csv') ||
            file.originalname.toLowerCase().endsWith('.txt')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos CSV o TXT'));
        }
    }
});

// Bulk upload DNC numbers
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No se subió ningún archivo'
            });
        }

        const fileContent = req.file.buffer.toString('utf-8');
        const lines = fileContent.split(/\r?\n/);
        const numbersToInsert = [];

        // Simple parser: Extract first valid number from each line
        for (const line of lines) {
            // Remove whitespace
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Parse CSV: split by comma, take first column
            const columns = trimmed.split(',');
            let rawNumber = columns[0].trim(); // Assume first column is phone number

            // Clean number: remove keys, spaces, etc.
            const phoneNumber = rawNumber.replace(/[^0-9]/g, '');

            // Validate length (simple check, e.g., 6-15 digits)
            if (phoneNumber.length >= 6 && phoneNumber.length <= 15) {
                numbersToInsert.push(phoneNumber);
            }
        }

        console.log(`[DNC Upload] Found ${numbersToInsert.length} potential numbers from ${lines.length} lines`);

        if (numbersToInsert.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No se encontraron números válidos en el archivo'
            });
        }

        // Bulk insert
        const result = await databaseService.bulkAddDncNumbers(numbersToInsert);

        res.json({
            success: true,
            message: 'Procesamiento completado',
            data: {
                total_found: numbersToInsert.length,
                inserted: result.count,
                skipped: numbersToInsert.length - result.count
            }
        });

    } catch (error) {
        console.error('[DNC Upload] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error procesando archivo'
        });
    }
});

module.exports = router;
