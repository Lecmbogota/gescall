const express = require('express');
const router = express.Router();
const multer = require('multer');
const pg = require('../config/pgDatabase');

/**
 * GET /api/dnc
 * List blacklisted numbers, optionally filtered by campaign_id
 * Query params: page, limit, search, campaign_id
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const campaignId = req.query.campaign_id || null;
        const offset = (page - 1) * limit;

        let conditions = [];
        let params = [];
        let pIndex = 1;

        if (campaignId) {
            conditions.push('campaign_id = $' + pIndex++);
            params.push(campaignId);
        }

        if (search) {
            const cleanSearch = search.replace(/[^0-9]/g, '');
            if (cleanSearch) {
                conditions.push('phone_number LIKE $' + pIndex++);
                params.push('%' + cleanSearch + '%');
            }
        }

        const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

        const countQuery = 'SELECT COUNT(*) as total FROM gescall_dnc' + whereClause;
        const dataQuery = 'SELECT * FROM gescall_dnc' + whereClause +
            ' ORDER BY added_at DESC LIMIT $' + pIndex++ + ' OFFSET $' + pIndex++;
        params.push(limit, offset);

        const [countResult, result] = await Promise.all([
            pg.query(countQuery, params.slice(0, params.length - 2)),
            pg.query(dataQuery, params)
        ]);

        const total = parseInt(countResult.rows[0].total) || 0;

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('[pg_dnc List] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/dnc
 * Add number to blacklist (optionally per campaign)
 * Body: { phoneNumber, campaign_id? }
 */
router.post('/', async (req, res) => {
    try {
        const { phoneNumber, campaign_id } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ success: false, error: 'Phone number is required' });
        }

        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

        if (campaign_id) {
            await pg.query(
                'INSERT INTO gescall_dnc (phone_number, campaign_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [cleanPhone, campaign_id]
            );
        } else {
            await pg.query(
                'INSERT INTO gescall_dnc (phone_number) VALUES ($1) ON CONFLICT DO NOTHING',
                [cleanPhone]
            );
        }

        res.json({ success: true, message: 'Number added to blacklist' });
    } catch (error) {
        console.error('[pg_dnc Add] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/dnc/all
 * Clear all numbers from blacklist (optionally per campaign)
 * Query: campaign_id?
 */
router.delete('/all', async (req, res) => {
    try {
        let result;
        if (req.query.campaign_id) {
            result = await pg.query('DELETE FROM gescall_dnc WHERE campaign_id = $1', [req.query.campaign_id]);
        } else {
            result = await pg.query('DELETE FROM gescall_dnc');
        }
        const deleted = result.rowCount;

        res.json({
            success: true,
            message: 'Se eliminaron ' + deleted + ' números de la lista negra',
            deleted
        });
    } catch (error) {
        console.error('[pg_dnc Clear All] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/dnc/:phoneNumber
 * Remove number from blacklist
 * Query: campaign_id?
 */
router.delete('/:phoneNumber', async (req, res) => {
    try {
        const { phoneNumber } = req.params;

        if (!phoneNumber) {
            return res.status(400).json({ success: false, error: 'Phone number is required' });
        }

        if (req.query.campaign_id) {
            await pg.query('DELETE FROM gescall_dnc WHERE phone_number = $1 AND campaign_id = $2', [phoneNumber, req.query.campaign_id]);
        } else {
            await pg.query('DELETE FROM gescall_dnc WHERE phone_number = $1 AND campaign_id IS NULL', [phoneNumber]);
        }

        res.json({ success: true, message: 'Number removed from blacklist' });
    } catch (error) {
        console.error('[pg_dnc Delete] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
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

/**
 * POST /api/dnc/upload
 * Import numbers from CSV (optionally per campaign)
 * Query: campaign_id?
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se subió ningún archivo' });
        }

        const campaignId = req.body.campaign_id || null;
        const fileContent = req.file.buffer.toString('utf-8');
        const lines = fileContent.split(/\r?\n/);
        const numbersToInsert = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const columns = trimmed.split(',');
            const rawNumber = columns[0].trim();
            const phoneNumber = rawNumber.replace(/[^0-9]/g, '');

            if (phoneNumber.length >= 6 && phoneNumber.length <= 15) {
                numbersToInsert.push(phoneNumber);
            }
        }

        if (numbersToInsert.length === 0) {
            return res.status(400).json({ success: false, error: 'No se encontraron números válidos' });
        }

        let insertedCount = 0;
        const batchSize = 500;
        for (let i = 0; i < numbersToInsert.length; i += batchSize) {
            const batch = numbersToInsert.slice(i, i + batchSize);

            if (campaignId) {
                // Per-campaign blacklist
                const values = batch.map((_, index) => '($' + (index * 2 + 1) + ', $' + (index * 2 + 2) + ')').join(', ');
                const flatParams = [];
                batch.forEach(num => { flatParams.push(num, campaignId); });

                const result = await pg.query(
                    'INSERT INTO gescall_dnc (phone_number, campaign_id) VALUES ' + values + ' ON CONFLICT DO NOTHING',
                    flatParams
                );
                insertedCount += result.rowCount;
            } else {
                // Global blacklist
                const values = batch.map((_, index) => '($' + (index + 1) + ')').join(', ');
                const result = await pg.query(
                    'INSERT INTO gescall_dnc (phone_number) VALUES ' + values + ' ON CONFLICT DO NOTHING',
                    batch
                );
                insertedCount += result.rowCount;
            }
        }

        res.json({
            success: true,
            message: 'Procesamiento completado',
            data: {
                total_found: numbersToInsert.length,
                inserted: insertedCount,
                skipped: numbersToInsert.length - insertedCount
            }
        });

    } catch (error) {
        console.error('[pg_dnc Upload] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// DNC Rules (Smart Blacklist) CRUD
// ============================================

/**
 * GET /api/dnc/rules
 * List all smart blacklist rules
 */
router.get('/rules', async (req, res) => {
    try {
        const { rows } = await pg.query('SELECT * FROM gescall_dnc_rules ORDER BY country_code, created_at');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[pg_dnc Rules List] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/dnc/rules
 * Create a new smart blacklist rule
 */
router.post('/rules', async (req, res) => {
    try {
        const { name, country_code, max_calls, period_hours, applies_to } = req.body;

        if (!name || !country_code || !max_calls || !period_hours) {
            return res.status(400).json({ success: false, error: 'name, country_code, max_calls, period_hours son requeridos' });
        }

        const { rows } = await pg.query(
            'INSERT INTO gescall_dnc_rules (name, country_code, max_calls, period_hours, applies_to) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [name, country_code, parseInt(max_calls), parseInt(period_hours), applies_to || 'ALL']
        );

        res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('[pg_dnc Rules Create] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/dnc/rules/:id
 * Update a smart blacklist rule
 */
router.put('/rules/:id', async (req, res) => {
    try {
        const { name, country_code, max_calls, period_hours, is_active, applies_to } = req.body;
        const updates = [];
        const params = [];
        let pIndex = 1;

        if (name !== undefined) { updates.push('name = $' + pIndex++); params.push(name); }
        if (country_code !== undefined) { updates.push('country_code = $' + pIndex++); params.push(country_code); }
        if (max_calls !== undefined) { updates.push('max_calls = $' + pIndex++); params.push(parseInt(max_calls)); }
        if (period_hours !== undefined) { updates.push('period_hours = $' + pIndex++); params.push(parseInt(period_hours)); }
        if (is_active !== undefined) { updates.push('is_active = $' + pIndex++); params.push(is_active); }
        if (applies_to !== undefined) { updates.push('applies_to = $' + pIndex++); params.push(applies_to); }

        if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

        params.push(req.params.id);
        const { rows } = await pg.query(
            'UPDATE gescall_dnc_rules SET ' + updates.join(', ') + ' WHERE id = $' + pIndex + ' RETURNING *',
            params
        );

        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Rule not found' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('[pg_dnc Rules Update] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/dnc/rules/:id
 * Delete a smart blacklist rule
 */
router.delete('/rules/:id', async (req, res) => {
    try {
        const result = await pg.query('DELETE FROM gescall_dnc_rules WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Rule not found' });
        res.json({ success: true, message: 'Regla eliminada' });
    } catch (error) {
        console.error('[pg_dnc Rules Delete] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
