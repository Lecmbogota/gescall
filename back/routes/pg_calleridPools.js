const express = require('express');
const router = express.Router();
const multer = require('multer');
const pg = require('../config/pgDatabase');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.mimetype === 'text/plain' ||
            file.originalname.toLowerCase().endsWith('.csv') || file.originalname.toLowerCase().endsWith('.txt')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos CSV o TXT'));
        }
    }
});

const COUNTRY_REGEX = {
    CO: /^3[0-9]{9}$/,
    MX: /^[2-9][0-9]{9}$/,
    US: /^[2-9][0-9]{9}$/
};

function validateCallerIdFormat(callerid, countryCode = 'CO') {
    const clean = callerid.replace(/[^0-9]/g, '');
    const regex = COUNTRY_REGEX[countryCode] || COUNTRY_REGEX.CO;
    return regex.test(clean) ? clean : null;
}

// GET /api/callerid-pools
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let query = `
            SELECT p.*,
                   (SELECT COUNT(*) FROM gescall_callerid_pool_numbers n WHERE n.pool_id = p.id) as total_numbers,
                   (SELECT COUNT(*) FROM gescall_callerid_pool_numbers n WHERE n.pool_id = p.id AND n.is_active = true) as active_numbers
            FROM gescall_callerid_pools p
        `;
        let countQuery = 'SELECT COUNT(*) as total FROM gescall_callerid_pools p';
        const params = [];
        let pIndex = 1;

        if (search) {
            query += ` WHERE p.name ILIKE $${pIndex} OR p.description ILIKE $${pIndex}`;
            countQuery += ` WHERE p.name ILIKE $${pIndex} OR p.description ILIKE $${pIndex}`;
            params.push(`%${search}%`);
            pIndex++;
        }

        query += ` ORDER BY p.id DESC LIMIT $${pIndex} OFFSET $${pIndex + 1}`;
        params.push(limit, offset);

        const [countResult, result] = await Promise.all([
            pg.query(countQuery, search ? [params[0]] : []),
            pg.query(query, params)
        ]);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].total) || 0,
                page, limit, pages: Math.ceil((countResult.rows[0].total || 0) / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/callerid-pools/:id
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await pg.query(`
            SELECT p.*,
                   (SELECT COUNT(*) FROM gescall_callerid_pool_numbers n WHERE n.pool_id = p.id) as total_numbers,
                   (SELECT COUNT(*) FROM gescall_callerid_pool_numbers n WHERE n.pool_id = p.id AND n.is_active = true) as active_numbers
            FROM gescall_callerid_pools p
            WHERE p.id = $1
        `, [req.params.id]);

        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Pool no encontrado' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/callerid-pools
router.post('/', async (req, res) => {
    try {
        const { name, description, country_code } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'El nombre es requerido' });

        const { rows } = await pg.query(
            'INSERT INTO gescall_callerid_pools (name, description, country_code) VALUES ($1, $2, $3) RETURNING id',
            [name.trim(), description || '', country_code || 'CO']
        );
        res.json({ success: true, data: { id: rows[0].id }, message: 'Pool creado exitosamente' });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ success: false, error: 'Ya existe un pool con ese nombre' });
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/callerid-pools/:id
router.put('/:id', async (req, res) => {
    try {
        const { name, description, country_code, is_active } = req.body;
        const updates = [];
        const params = [];
        let pIndex = 1;

        if (name) { updates.push(`name = $${pIndex++}`); params.push(name); }
        if (description !== undefined) { updates.push(`description = $${pIndex++}`); params.push(description); }
        if (country_code) { updates.push(`country_code = $${pIndex++}`); params.push(country_code); }
        if (is_active !== undefined) { updates.push(`is_active = $${pIndex++}`); params.push(is_active); }

        if (updates.length > 0) {
            params.push(req.params.id);
            await pg.query(`UPDATE gescall_callerid_pools SET ${updates.join(', ')} WHERE id = $${pIndex}`, params);
        }
        res.json({ success: true, message: 'Pool actualizado' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/callerid-pools/:id
router.delete('/:id', async (req, res) => {
    try {
        await pg.query('DELETE FROM gescall_callerid_pools WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Pool eliminado' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/callerid-pools/:id/numbers
router.get('/:id/numbers', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM gescall_callerid_pool_numbers WHERE pool_id = $1';
        let countQuery = 'SELECT COUNT(*) as total FROM gescall_callerid_pool_numbers WHERE pool_id = $1';
        const params = [req.params.id];
        let pIndex = 2;

        if (search) {
            query += ` AND callerid LIKE $${pIndex}`;
            countQuery += ` AND callerid LIKE $${pIndex}`;
            params.push(`%${search}%`);
            pIndex++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${pIndex} OFFSET $${pIndex + 1}`;
        params.push(limit, offset);

        const [countResult, result] = await Promise.all([
            pg.query(countQuery, search ? params.slice(0, pIndex - 1) : [params[0]]),
            pg.query(query, params)
        ]);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].total) || 0,
                page, limit, pages: Math.ceil((countResult.rows[0].total || 0) / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/callerid-pools/:id/numbers
router.post('/:id/numbers', async (req, res) => {
    try {
        const { callerid } = req.body;
        const { rows: pool } = await pg.query('SELECT country_code FROM gescall_callerid_pools WHERE id = $1', [req.params.id]);
        if (pool.length === 0) return res.status(404).json({ success: false, error: 'Pool no encontrado' });

        const validNumber = validateCallerIdFormat(callerid, pool[0].country_code);
        if (!validNumber) return res.status(400).json({ success: false, error: `Formato inválido para ${pool[0].country_code}` });

        const { rows } = await pg.query(
            'INSERT INTO gescall_callerid_pool_numbers (pool_id, callerid) VALUES ($1, $2) RETURNING id',
            [req.params.id, validNumber]
        );
        res.json({ success: true, data: { id: rows[0].id }, message: 'Número agregado' });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ success: false, error: 'Este número ya existe en el pool' });
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/callerid-pools/:id/import
router.post('/:id/import', upload.single('file'), async (req, res) => {
    try {
        const { rows: pool } = await pg.query('SELECT country_code FROM gescall_callerid_pools WHERE id = $1', [req.params.id]);
        if (pool.length === 0) return res.status(404).json({ success: false, error: 'Pool no encontrado' });

        let rawContent = '';
        if (req.file) rawContent = req.file.buffer.toString('utf-8');
        else if (req.body.numbers) rawContent = req.body.numbers;
        else return res.status(400).json({ success: false, error: 'No se proporcionaron números' });

        const lines = rawContent.split(/[\r\n,;]+/);
        const validNumbers = [];
        const invalidNumbers = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const clean = trimmed.replace(/[^0-9]/g, '');
            const validNumber = validateCallerIdFormat(clean, pool[0].country_code);
            if (validNumber) validNumbers.push(validNumber);
            else if (clean.length > 0) invalidNumbers.push(trimmed);
        }

        const uniqueNumbers = [...new Set(validNumbers)];
        if (uniqueNumbers.length === 0) {
            return res.status(400).json({ success: false, error: 'No se encontraron números válidos', invalid_count: invalidNumbers.length });
        }

        let insertedCount = 0;
        const batchSize = 500;
        for (let i = 0; i < uniqueNumbers.length; i += batchSize) {
            const batch = uniqueNumbers.slice(i, i + batchSize);
            const values = batch.map((_, idx) => `($1, $${idx + 2})`).join(', ');
            const query = `INSERT INTO gescall_callerid_pool_numbers (pool_id, callerid) VALUES ${values} ON CONFLICT (pool_id, callerid) DO NOTHING`;
            const result = await pg.query(query, [req.params.id, ...batch]);
            insertedCount += result.rowCount;
        }

        res.json({
            success: true,
            message: 'Importación completada',
            data: { total_found: uniqueNumbers.length, inserted: insertedCount, skipped: uniqueNumbers.length - insertedCount, invalid: invalidNumbers.length }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/callerid-pools/:poolId/numbers/:numberId
router.delete('/:poolId/numbers/:numberId', async (req, res) => {
    try {
        await pg.query('DELETE FROM gescall_callerid_pool_numbers WHERE id = $1 AND pool_id = $2', [req.params.numberId, req.params.poolId]);
        res.json({ success: true, message: 'Número eliminado' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/callerid-pools/:poolId/numbers/:numberId/toggle
router.put('/:poolId/numbers/:numberId/toggle', async (req, res) => {
    try {
        const { is_active } = req.body;
        await pg.query('UPDATE gescall_callerid_pool_numbers SET is_active = $1 WHERE id = $2', [is_active, req.params.numberId]);
        res.json({ success: true, message: is_active ? 'Número activado' : 'Número desactivado' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/callerid-pools/:id/area-codes
router.get('/:id/area-codes', async (req, res) => {
    try {
        const { rows } = await pg.query(`
            SELECT SUBSTRING(callerid FROM 1 FOR 3) as area_code, COUNT(*) as count
            FROM gescall_callerid_pool_numbers
            WHERE pool_id = $1 AND is_active = true
            GROUP BY SUBSTRING(callerid FROM 1 FOR 3)
            ORDER BY count DESC
        `, [req.params.id]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/callerid-pools/:id/logs
router.get('/:id/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;

        const { rows } = await pg.query(`
            SELECT * FROM gescall_callerid_logs 
            WHERE pool_id = $1
            ORDER BY used_at DESC
            LIMIT $2 OFFSET $3
        `, [req.params.id, limit, offset]);

        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
