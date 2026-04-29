const express = require('express');
const router = express.Router();
const pg = require('../config/pgDatabase');

router.get('/', async (req, res) => {
    try {
        const { rows } = await pg.query('SELECT * FROM gescall_lists');
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/next-id', async (req, res) => {
    try {
        const { rows } = await pg.query('SELECT COALESCE(MAX(list_id), 999999) + 1 AS next_id FROM gescall_lists');
        const nextId = parseInt(rows[0].next_id);
        res.json({ success: true, next_id: Math.max(nextId, 1000000) });
    } catch (error) {
        console.error('[pg_lists next-id] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const { list_id, list_name, campaign_id, updated_by } = req.body;

        await pg.query(
            `INSERT INTO gescall_lists (list_id, list_name, campaign_id, active, updated_by) 
       VALUES ($1, $2, $3, false, $4)`,
            [list_id, list_name, campaign_id, updated_by || 'Sistema']
        );

        res.json({ success: true, data: { list_id, list_name } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/campaign/:campaign_id', async (req, res) => {
    try {
        const { campaign_id } = req.params;
        const { rows } = await pg.query(`
      SELECT 
        l.*,
        COUNT(led.lead_id) as total_leads,
        SUM(CASE WHEN led.status = 'NEW' THEN 1 ELSE 0 END) as leads_new
      FROM gescall_lists l
      LEFT JOIN gescall_leads led ON l.list_id = led.list_id
      WHERE l.campaign_id = $1
      GROUP BY l.list_id
    `, [campaign_id]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:list_id/leads', async (req, res) => {
    try {
        const { list_id } = req.params;

        // Ensure list_id is numeric to prevent Postgres errors with BIGINT
        if (isNaN(parseInt(list_id))) {
            return res.status(400).json({ success: false, error: 'list_id must be a number' });
        }

        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;

        const countQuery = await pg.query('SELECT COUNT(*) FROM gescall_leads WHERE list_id = $1', [list_id]);
        const total = parseInt(countQuery.rows[0].count);

        const { rows } = await pg.query(
            'SELECT * FROM gescall_leads WHERE list_id = $1 ORDER BY lead_id DESC LIMIT $2 OFFSET $3',
            [list_id, limit, offset]
        );

        res.json({ success: true, data: rows, total });
    } catch (error) {
        console.error('[pg_lists] Error fetching leads by list:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update list status
router.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { active, updated_by } = req.body; // Expects 'Y' or 'N' from frontend

        if (!['Y', 'N'].includes(active)) {
            return res.status(400).json({ error: 'Invalid active status. Must be Y or N' });
        }

        const isActive = active === 'Y';
        await pg.query('UPDATE gescall_lists SET active = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $3 WHERE list_id = $2', [isActive, id, updated_by || 'Sistema']);

        res.json({ success: true, message: `List status updated to ${isActive}` });
    } catch (error) {
        console.error('[pg_lists] Error updating list status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete list and all associated data
router.delete('/:id', async (req, res) => {
    let client;
    try {
        client = await pg.pool.connect();
        const { id } = req.params;
        
        // Find campaign_id to clear redis hopper later
        const listQuery = await client.query('SELECT campaign_id FROM gescall_lists WHERE list_id = $1', [id]);
        const campaignId = listQuery.rowCount > 0 ? listQuery.rows[0].campaign_id : null;

        await client.query('BEGIN');
        
        // We DO NOT delete gescall_call_log to preserve historical reporting data
        // await client.query('DELETE FROM gescall_call_log WHERE list_id = $1', [id]);
        
        const leadsResult = await client.query('DELETE FROM gescall_leads WHERE list_id = $1', [id]);
        const listResult = await client.query('DELETE FROM gescall_lists WHERE list_id = $1', [id]);
        
        await client.query('COMMIT');
        
        // Clear the hopper in Redis for this campaign if it exists
        if (campaignId) {
            try {
                const redis = require('../config/redisClient');
                await redis.del(`gescall:hopper:${campaignId}`);
            } catch (redisErr) {
                console.error('[pg_lists] Failed to clear redis hopper on delete:', redisErr.message);
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Lista eliminada correctamente',
            deleted_leads: leadsResult.rowCount,
            list_found: listResult.rowCount > 0
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('[pg_lists] Error deleting list:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (client) client.release();
    }
});

// Get lead counts by status for a list
router.get('/:id/status-counts', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await pg.query(`
            SELECT status, COUNT(*) as count 
            FROM gescall_leads 
            WHERE list_id = $1 
            GROUP BY status
            ORDER BY count DESC
        `, [id]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[pg_lists] Error getting status counts:', error);
        res.status(500).json({ error: error.message });
    }
});
// Recycle list — creates a NEW list with copies of the selected leads
router.post('/:id/recycle', async (req, res) => {
    try {
        const { id } = req.params;
        const { statuses, updated_by } = req.body; // Array of statuses to recycle
        const redis = require('../config/redisClient');

        if (!statuses || !Array.isArray(statuses) || statuses.length === 0) {
            return res.status(400).json({ success: false, error: 'Statuses array is required' });
        }

        // Ensure source list exists
        const listCheck = await pg.query("SELECT * FROM gescall_lists WHERE list_id = $1", [id]);
        if (listCheck.rowCount === 0) {
            return res.status(404).json({ success: false, error: 'List not found' });
        }

        const sourceList = listCheck.rows[0];
        const campaignId = sourceList.campaign_id;

        // Count leads that will be recycled
        const countCheck = await pg.query(
            `SELECT COUNT(*) as cnt FROM gescall_leads WHERE list_id = $1 AND status = ANY($2::text[])`,
            [id, statuses]
        );
        const leadsToRecycle = parseInt(countCheck.rows[0].cnt);

        if (leadsToRecycle === 0) {
            return res.json({ success: true, message: 'No leads match the selected statuses.', count: 0 });
        }

        // Generate new list_id
        const nextIdResult = await pg.query('SELECT COALESCE(MAX(list_id), 999999) + 1 AS next_id FROM gescall_lists');
        const newListId = parseInt(nextIdResult.rows[0].next_id);

        // Generate new list name with recycle counter
        const baseName = sourceList.list_name.replace(/_R\d+$/, ''); // Strip existing _R suffix
        const recycleCountResult = await pg.query(
            `SELECT COUNT(*) as cnt FROM gescall_lists WHERE list_name LIKE $1`,
            [`${baseName}_R%`]
        );
        const recycleNum = parseInt(recycleCountResult.rows[0].cnt) + 1;
        const newListName = `${baseName}_R${recycleNum}`;

        // Create the new list (inactive by default)
        await pg.query(
            `INSERT INTO gescall_lists (list_id, list_name, campaign_id, active, updated_by) VALUES ($1, $2, $3, false, $4)`,
            [newListId, newListName, campaignId, updated_by || 'Sistema']
        );

        // Copy leads into new list with fresh status
        const insertResult = await pg.query(`
            INSERT INTO gescall_leads (list_id, status, phone_number, vendor_lead_code, called_count, tts_vars)
            SELECT $1, 'NEW', phone_number, vendor_lead_code, 0, COALESCE(tts_vars, '{}')
            FROM gescall_leads
            WHERE list_id = $2 AND status = ANY($3::text[])
        `, [newListId, id, statuses]);

        // Deactivate the source list so its leads don't get picked up again
        await pg.query('UPDATE gescall_lists SET active = false, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE list_id = $1', [id, updated_by || 'Sistema']);

        // Clear the hopper for this campaign
        await redis.del(`gescall:hopper:${campaignId}`);

        res.json({
            success: true,
            message: `Created new list "${newListName}" (ID: ${newListId}) with ${insertResult.rowCount} recycled leads. Source list deactivated.`,
            count: insertResult.rowCount,
            new_list_id: newListId,
            new_list_name: newListName
        });
    } catch (error) {
        console.error('[pg_lists] Error recycling list:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// File-based lead upload — streaming, low memory
// ============================================================
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const uploadTaskService = require('../services/uploadTaskService');

const UPLOAD_DIR = '/tmp/gescall-uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const uploadMiddleware = multer({
    storage: diskStorage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.xlsx', '.xls', '.csv'].includes(ext)) return cb(null, true);
        cb(new Error('Solo archivos Excel (.xlsx, .xls) o CSV'));
    },
});

/**
 * POST /api/lists/:list_id/upload-file
 * Upload an Excel file to bulk-insert leads into PostgreSQL.
 * Returns immediately with a taskId; progress is emitted via Socket.IO.
 */
router.post('/:list_id/upload-file', uploadMiddleware.single('file'), async (req, res) => {
    const { list_id } = req.params;
    const { campaign_id } = req.body;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ success: false, error: 'Archivo requerido' });
    }

    // Ensure list exists
    const listCheck = await pg.query('SELECT list_id FROM gescall_lists WHERE list_id = $1', [list_id]);
    if (listCheck.rowCount === 0) {
        fs.unlinkSync(file.path);
        return res.status(404).json({ success: false, error: 'Lista no encontrada' });
    }

    const taskId = `upload-${Date.now()}`;

    // Respond immediately — processing happens async
    res.json({ success: true, taskId, message: 'Upload iniciado' });

    // Async processing
    processFileUpload(req.app.get('io'), taskId, file.path, list_id, campaign_id);
});

/**
 * Server-side file processing — reads Excel from disk, bulk inserts to PG
 */
async function processFileUpload(io, taskId, filePath, listId, campaignId) {
    let totalLeads = 0;
    let processed = 0;
    let successful = 0;
    let errors = 0;

    // 0. Persist task immediately so the frontend has a DB record to poll against if it crashes early
    try {
        await uploadTaskService.createFileTask(taskId, listId, campaignId, 0, filePath);
    } catch (dbErr) {
        console.error(`[FileUpload] Failed to init task:`, dbErr.message);
    }

    try {
        // 1. Parse the Excel file from disk
        console.log(`[FileUpload] Task ${taskId}: Reading file ${filePath}`);
        const workbook = XLSX.readFile(filePath, { type: 'file' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('El archivo Excel está vacío');

        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        console.log(`[FileUpload] Task ${taskId}: Parsed ${rows.length} rows`);

        // Log first row for debugging
        if (rows.length > 0) {
            console.log(`[FileUpload] Task ${taskId}: First row content: ${JSON.stringify(rows[0])}`);
            if (rows.length > 1) {
                console.log(`[FileUpload] Task ${taskId}: Second row content: ${JSON.stringify(rows[1])}`);
            }
        }

        // 1.5 Validate against Campaign Schema
        const campQuery = await pg.query('SELECT lead_structure_schema FROM gescall_campaigns WHERE campaign_id = $1', [campaignId]);
        const schema = campQuery.rows[0]?.lead_structure_schema || [];

        if (rows.length > 0 && schema.length > 0) {
            const firstRowKeys = Object.keys(rows[0]).map(k => k.toLowerCase().replace(/[\uFEFF\r\n\t]/g, '').trim());
            console.log(`[FileUpload] Task ${taskId}: Validating against schema. Parsed file headers: ${JSON.stringify(firstRowKeys)}`);
            
            // Allow synonymous fallbacks for phone
            const phoneSynonyms = ['phone', 'phone_number', 'telefono', 'teléfono', 'celular', 'movil', 'mobile', 'contacto', 'number'];
            
            const missingRequired = schema
                .filter(col => col.required)
                .filter(col => {
                    const colName = col.name.toLowerCase().replace(/[\uFEFF\r\n\t]/g, '').trim();
                    // If it's a phone, allow synonyms to pass validation if any is present
                    if (phoneSynonyms.includes(colName)) {
                        return !firstRowKeys.some(k => phoneSynonyms.includes(k));
                    }
                    return !firstRowKeys.includes(colName);
                });
                
            if (missingRequired.length > 0) {
                const missingNames = missingRequired.map(c => c.name).join(', ');
                throw new Error(`El archivo no cumple con la estructura de la campaña. Faltan requeridas: ${missingNames}. Encontradas: ${firstRowKeys.join(', ')}`);
            }
        }

        // 2. Normalize leads
        const leads = [];
        let skippedCount = 0;
        for (const row of rows) {
            const keys = Object.keys(row);
            const findKey = (candidates) =>
                keys.find(k => candidates.includes(k.toLowerCase().replace(/[\uFEFF\r\n\t]/g, '').trim()));

            const phoneKey = findKey(['phone', 'phone_number', 'telefono', 'teléfono', 'celular', 'movil', 'mobile', 'contacto', 'number']);
            const rawPhone = phoneKey ? row[phoneKey] : (keys[0] ? row[keys[0]] : '');
            const phone = String(rawPhone).replace(/[^0-9]/g, '');

            if (phone.length < 7) {
                skippedCount++;
                if (skippedCount <= 5) {
                    console.log(`[FileUpload] Skipped row #${skippedCount} due to invalid phone. rawPhone: "${rawPhone}", cleanedPhone: "${phone}", phoneKey: "${phoneKey}", row: ${JSON.stringify(row)}`);
                }
                continue;
            }

            const nameKey = findKey(['first_name', 'firstname', 'name', 'nombre', 'nombres']);
            const lastNameKey = findKey(['last_name', 'lastname', 'surname', 'apellido', 'apellidos']);
            const vendorKey = findKey(['vendor_lead_code', 'identificador', 'vendor', 'lead_code', 'codigo', 'referencia', 'ref']);
            const commentsKey = findKey(['comments', 'mensaje', 'comment', 'nota', 'notas', 'observaciones', 'message']);

            // Collect TTS vars: any column not mapped to a standard field
            const standardKeys = new Set([phoneKey, nameKey, lastNameKey, vendorKey, commentsKey].filter(Boolean).map(k => k.toLowerCase().trim()));
            const ttsVars = {};
            for (const k of keys) {
                if (!standardKeys.has(k.toLowerCase().trim())) {
                    ttsVars[k] = String(row[k] ?? '');
                }
            }

            leads.push({
                phone_number: phone,
                first_name: nameKey ? String(row[nameKey] || '') : null,
                last_name: lastNameKey ? String(row[lastNameKey] || '') : null,
                vendor_lead_code: vendorKey ? String(row[vendorKey] || '') : null,
                comments: commentsKey ? String(row[commentsKey] || '') : null,
                tts_vars: Object.keys(ttsVars).length > 0 ? JSON.stringify(ttsVars) : '{}',
            });
        }

        if (skippedCount > 0) {
            console.log(`[FileUpload] Task ${taskId}: Total skipped rows: ${skippedCount}`);
        }

        totalLeads = leads.length;
        if (totalLeads === 0) {
            const sampleRow = rows.length > 0 ? JSON.stringify(rows[0]) : 'N/A';
            throw new Error(`No se encontraron leads válidos (mínimo 7 dígitos). ${rows.length} filas leídas, todas rechazadas. Primera fila: ${sampleRow}`);
        }

        console.log(`[FileUpload] Task ${taskId}: ${totalLeads} valid leads to insert`);

        // 3. Update task status to running
        try {
            // Provide a direct update to set the correct total_records now that we know it
            await uploadTaskService.updateTaskStatus(taskId, 'running');
            const isPg = process.env.USE_GESCALL_DIALER === 'true';
            await require('../config/pgDatabase').query(
                isPg 
                  ? 'UPDATE gescall_upload_tasks SET total_records = $1 WHERE id = $2'
                  : 'UPDATE gescall_upload_tasks SET total_records = ? WHERE id = ?',
                [totalLeads, taskId]
            );
        } catch (dbErr) {
            console.error(`[FileUpload] Failed to update task status:`, dbErr.message);
        }

        // 4. Bulk INSERT in chunks of 2000
        const BATCH_SIZE = 2000;

        for (let i = 0; i < totalLeads; i += BATCH_SIZE) {
            const batch = leads.slice(i, i + BATCH_SIZE);

            try {
                const values = [];
                const params = [];
                let paramIdx = 1;

                for (const lead of batch) {
                    values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
                    params.push(
                        listId,
                        lead.phone_number,
                        lead.first_name || null,
                        lead.last_name || null,
                        lead.vendor_lead_code || null,
                        lead.comments || null,
                        lead.tts_vars
                    );
                }

                await pg.query(
                    `INSERT INTO gescall_leads 
                     (list_id, phone_number, first_name, last_name, vendor_lead_code, comments, tts_vars)
                     VALUES ${values.join(', ')}`,
                    params
                );

                successful += batch.length;
            } catch (dbErr) {
                console.error(`[FileUpload] Batch error at offset ${i}:`, dbErr.message);
                errors += batch.length;
            }

            processed += batch.length;
            const percentage = Math.round((processed / totalLeads) * 100);

            // Emit progress via Socket.IO
            if (io) {
                io.to(`task:${taskId}`).emit('upload:leads:progress', {
                    processId: taskId,
                    percentage,
                    processed,
                    total: totalLeads,
                    successful,
                    errors,
                });
            }

            // Persist progress every 10 batches
            if ((i / BATCH_SIZE) % 10 === 0 || processed === totalLeads) {
                try {
                    await uploadTaskService.updateProgress(taskId, processed, successful, errors);
                } catch (e) { /* non-critical */ }
            }
        }

        // 5. Complete
        if (io) {
            io.to(`task:${taskId}`).emit('upload:leads:complete', {
                processId: taskId,
                successful,
                errors,
                message: 'Carga completada exitosamente',
            });
        }

        try {
            await uploadTaskService.updateTaskStatus(taskId, 'completed', processed, successful, errors);
        } catch (e) { /* non-critical */ }

        console.log(`[FileUpload] Task ${taskId} completed: ${successful} successful, ${errors} errors`);

    } catch (err) {
        console.error(`[FileUpload] Task ${taskId} FAILED:`, err.message);

        if (io) {
            io.to(`task:${taskId}`).emit('upload:leads:error', {
                processId: taskId,
                message: err.message,
            });
        }

        try {
            await uploadTaskService.markFailed(taskId, err.message);
        } catch (e) { /* non-critical */ }
    } finally {
        // Cleanup temp file
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            console.log(`[FileUpload] Cleaned up temp file: ${filePath}`);
        } catch (e) { /* ignore */ }
    }
}

module.exports = router;
