/**
 * GesCall Support Tickets API Routes
 * Provides CRUD for support tickets + bidirectional Jira Cloud sync
 */
const express = require('express');
const pg = require('../config/pgDatabase');
const multer = require('multer');
const FormData = require('form-data');
const upload = multer({ storage: multer.memoryStorage() });

module.exports = function (io) {
    const router = express.Router();

    // --- Jira helpers -----------------------------------------------------------

    const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || '').trim();
    const JIRA_USER_EMAIL = (process.env.JIRA_USER_EMAIL || '').trim();
    const JIRA_API_TOKEN = (process.env.JIRA_API_TOKEN || '').trim();
    const JIRA_PROJECT_KEY = (process.env.JIRA_PROJECT_KEY || 'SOP').trim();
    const JIRA_CLIENT_NAME = (process.env.JIRA_CLIENT_NAME || '').trim();

    function jiraEnabled() {
        return !!(JIRA_BASE_URL && JIRA_USER_EMAIL && JIRA_API_TOKEN);
    }

    function jiraHeaders() {
        console.log(`[Jira Debug] Using email: "${JIRA_USER_EMAIL}"`);
        console.log(`[Jira Debug] Using token length: ${JIRA_API_TOKEN.length}`);
        const auth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
        return {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
    }

    async function jiraFetch(path, options = {}) {
        const base = JIRA_BASE_URL.replace(/\/+$/, ''); // strip trailing slash
        const url = `${base}/rest/api/3${path}`;
        const headers = { ...jiraHeaders(), ...(options.headers || {}) };
        const res = await fetch(url, { ...options, headers });
        if (!res.ok) {
            const errBody = await res.text();
            console.error(`[Jira] ${options.method || 'GET'} ${path} → ${res.status}: ${errBody}`);
            throw new Error(`Jira API error ${res.status}`);
        }
        return res.json();
    }

    const PRIORITY_MAP = {
        Low: '4',
        Medium: '3',
        High: '2',
        Critical: '1',
    };

    // Recursively extract plain text from Jira ADF (Atlassian Document Format)
    function extractAdfText(node) {
        if (!node) return '';
        if (typeof node === 'string') return node;
        if (node.type === 'text') return node.text || '';
        if (node.type === 'hardBreak') return '\n';
        if (Array.isArray(node.content)) {
            const inner = node.content.map(extractAdfText).join('');
            // Add newline after block-level elements
            if (['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote'].includes(node.type)) {
                return inner + '\n';
            }
            return inner;
        }
        return '';
    }

    // Jira custom field IDs (set in .env — find IDs in Jira field config)
    const JIRA_FIELD_USUARIO = process.env.JIRA_FIELD_USUARIO || '';
    const JIRA_FIELD_CLIENTE = process.env.JIRA_FIELD_CLIENTE || '';
    const JIRA_FIELD_URL = process.env.JIRA_FIELD_URL || '';
    const JIRA_FIELD_PAIS = process.env.JIRA_FIELD_PAIS || '';
    const JIRA_FIELD_TELEFONO = process.env.JIRA_FIELD_TELEFONO || '';

    // --- Permission helpers -----------------------------------------------------

    async function checkPermission(role_id, permissionId) {
        try {
            // Fast path: system roles bypass permission checks
            const roleRes = await pg.query('SELECT is_system FROM gescall_roles WHERE role_id = $1', [role_id]);
            if (roleRes.rows.length > 0 && roleRes.rows[0].is_system) return true;

            const result = await pg.query(
                'SELECT 1 FROM gescall_role_permissions WHERE role_id = $1 AND permission = $2',
                [role_id, permissionId]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error(`[tickets] Error checking permission ${permissionId} for role_id ${role_id}:`, error);
            return false;
        }
    }

    function requirePermission(permissionId) {
        return async (req, res, next) => {
            if (req.user?.is_system) return next();
            const role_id = req.user?.role_id;
            if (!role_id) {
                return res.status(403).json({ success: false, error: 'Acceso denegado: No tienes permiso para acceder a Soporte' });
            }
            const allowed = await checkPermission(role_id, permissionId);
            if (!allowed) {
                return res.status(403).json({ success: false, error: 'Acceso denegado: No tienes permiso para acceder a Soporte' });
            }
            next();
        };
    }

    // --- Routes -----------------------------------------------------------------

    /**
     * GET /api/tickets
     * List tickets, optional filters: ?status=Open&created_by=admin
     */
    router.get('/', requirePermission('view_support'), async (req, res) => {
        try {
            const { status, created_by } = req.query;
            let sql = 'SELECT * FROM gescall_support_tickets WHERE 1=1';
            const params = [];

            if (status) {
                params.push(status);
                sql += ` AND status = $${params.length}`;
            }
            if (created_by) {
                params.push(created_by);
                sql += ` AND created_by = $${params.length}`;
            }

            sql += ' ORDER BY updated_at DESC';

            const { rows } = await pg.query(sql, params);
            res.json({ success: true, data: rows });
        } catch (error) {
            console.error('[tickets] Error listing tickets:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/tickets/:id
     * Get single ticket + comments (sync from Jira if available)
     */
    router.get('/:id', requirePermission('view_support'), async (req, res) => {
        try {
            const { id } = req.params;
            const ticketResult = await pg.query('SELECT * FROM gescall_support_tickets WHERE id = $1', [id]);
            if (ticketResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Ticket no encontrado' });
            }

            const ticket = ticketResult.rows[0];

            // Sync comments from Jira if connected
            if (jiraEnabled() && ticket.jira_id) {
                try {
                    const jiraData = await jiraFetch(`/issue/${ticket.jira_id}/comment`);
                    const jiraComments = jiraData.comments || [];

                    for (const jc of jiraComments) {
                        // Check if we already have this Jira comment stored
                        const existing = await pg.query(
                            'SELECT id FROM gescall_ticket_comments WHERE jira_comment_id = $1',
                            [jc.id]
                        );
                        if (existing.rows.length === 0) {
                            // Extract plain text from Jira ADF body
                            const body = extractAdfText(jc.body).trim();

                            await pg.query(
                                `INSERT INTO gescall_ticket_comments (ticket_id, jira_comment_id, author, body, source, created_at)
               VALUES ($1, $2, $3, $4, 'jira', $5)`,
                                [
                                    ticket.id,
                                    jc.id,
                                    jc.author?.displayName || jc.author?.emailAddress || 'Jira User',
                                    body,
                                    jc.created,
                                ]
                            );
                        }
                    }

                    // Also sync status and attachments from Jira
                    try {
                        const issueData = await jiraFetch(`/issue/${ticket.jira_id}?fields=status,attachment`);
                        const jiraStatus = issueData.fields?.status?.name || ticket.status;
                        if (jiraStatus !== ticket.status) {
                            await pg.query(
                                'UPDATE gescall_support_tickets SET status = $1, updated_at = NOW() WHERE id = $2',
                                [jiraStatus, ticket.id]
                            );
                            ticket.status = jiraStatus;
                        }

                        // Map Jira attachments so the frontend can receive them
                        if (issueData.fields?.attachment) {
                            ticket.attachments = issueData.fields.attachment.map(a => ({
                                id: a.id,
                                filename: a.filename,
                                mimeType: a.mimeType,
                                size: a.size,
                                url: `/api/tickets/${ticket.id}/attachments/${a.id}`,
                                created: a.created
                            }));
                        } else {
                            ticket.attachments = [];
                        }
                    } catch (statusErr) {
                        console.warn('[tickets] Failed to sync status from Jira:', statusErr.message);
                    }
                } catch (syncErr) {
                    // If Jira returns 404, the issue was deleted — remove local ticket
                    if (syncErr.message && syncErr.message.includes('404')) {
                        console.warn(`[tickets] Jira issue ${ticket.jira_key} not found (404) — deleting local ticket #${ticket.id}`);
                        await pg.query('DELETE FROM gescall_ticket_comments WHERE ticket_id = $1', [ticket.id]);
                        await pg.query('DELETE FROM gescall_support_tickets WHERE id = $1', [ticket.id]);
                        return res.json({ success: false, error: 'Ticket eliminado en Jira' });
                    }
                    console.warn('[tickets] Failed to sync Jira comments:', syncErr.message);
                    // Continue — still show local comments
                }
            }

            // Fetch comments
            const commentsResult = await pg.query(
                'SELECT * FROM gescall_ticket_comments WHERE ticket_id = $1 ORDER BY created_at ASC',
                [id]
            );

            res.json({
                success: true,
                data: {
                    ...ticket,
                    comments: commentsResult.rows,
                },
            });
        } catch (error) {
            console.error('[tickets] Error fetching ticket:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/tickets
     * Create a new ticket (and push to Jira if configured)
     */
    router.post('/', requirePermission('view_support'), async (req, res) => {
        try {
            const { title, description, priority, cliente, url, pais, telefono, usuario } = req.body;
            const created_by = req.user?.username || 'unknown';

            if (!title || !title.trim()) {
                return res.status(400).json({ success: false, error: 'El título es requerido' });
            }

            let jira_key = null;
            let jira_id = null;

            // Push to Jira if configured
            if (jiraEnabled()) {
                try {
                    const summaryPrefix = JIRA_CLIENT_NAME ? `[${JIRA_CLIENT_NAME}] ` : '';
                    const clientLine = JIRA_CLIENT_NAME ? `Cliente: ${JIRA_CLIENT_NAME}\n` : '';
                    const descPrefix = `${clientLine}Solicitado por: ${created_by}\n\n`;
                    const labels = JIRA_CLIENT_NAME ? [JIRA_CLIENT_NAME.replace(/\s+/g, '_')] : [];

                    const issueData = await jiraFetch('/issue', {
                        method: 'POST',
                        body: JSON.stringify({
                            fields: {
                                project: { key: JIRA_PROJECT_KEY },
                                summary: `${summaryPrefix}${title.trim()}`,
                                description: {
                                    version: 1,
                                    type: 'doc',
                                    content: [
                                        {
                                            type: 'paragraph',
                                            content: [{ type: 'text', text: `${descPrefix}${description || ''}` }],
                                        },
                                    ],
                                },
                                issuetype: { id: '10003' },
                                priority: { id: PRIORITY_MAP[priority] || '3' },
                                ...(labels.length > 0 ? { labels } : {}),
                                ...(JIRA_FIELD_USUARIO && usuario ? { [JIRA_FIELD_USUARIO]: usuario } : {}),
                                ...(JIRA_FIELD_CLIENTE && cliente ? { [JIRA_FIELD_CLIENTE]: cliente } : {}),
                                ...(JIRA_FIELD_URL && url ? { [JIRA_FIELD_URL]: url } : {}),
                                ...(JIRA_FIELD_PAIS && pais ? { [JIRA_FIELD_PAIS]: pais } : {}),
                                ...(JIRA_FIELD_TELEFONO && telefono ? { [JIRA_FIELD_TELEFONO]: telefono } : {}),
                            },
                        }),
                    });
                    jira_key = issueData.key;
                    jira_id = issueData.id;
                    console.log(`[tickets] Created Jira issue: ${jira_key}`);
                } catch (jiraErr) {
                    console.error('[tickets] Failed to create Jira issue:', jiraErr.message);
                    // Continue with local ticket creation
                }
            }

            const result = await pg.query(
                `INSERT INTO gescall_support_tickets (jira_key, jira_id, title, description, priority, created_by, cliente, url, pais, telefono, usuario)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
                [jira_key, jira_id, title.trim(), description || '', priority || 'Medium', created_by, cliente || null, url || null, pais || null, telefono || null, usuario || null]
            );

            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            console.error('[tickets] Error creating ticket:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/tickets/:id/comments
     * Add a comment (and push to Jira if the ticket is linked)
     */
    router.post('/:id/comments', requirePermission('view_support'), async (req, res) => {
        try {
            const { id } = req.params;
            const { body } = req.body;
            const author = req.user?.username || 'unknown';

            if (!body || !body.trim()) {
                return res.status(400).json({ success: false, error: 'El comentario es requerido' });
            }

            // Check ticket exists
            const ticketResult = await pg.query('SELECT * FROM gescall_support_tickets WHERE id = $1', [id]);
            if (ticketResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Ticket no encontrado' });
            }

            const ticket = ticketResult.rows[0];
            let jira_comment_id = null;

            // Push to Jira if linked
            if (jiraEnabled() && ticket.jira_id) {
                try {
                    const commentData = await jiraFetch(`/issue/${ticket.jira_id}/comment`, {
                        method: 'POST',
                        body: JSON.stringify({
                            body: {
                                version: 1,
                                type: 'doc',
                                content: [
                                    {
                                        type: 'paragraph',
                                        content: [{ type: 'text', text: `[GesCall - ${author}] ${body.trim()}` }],
                                    },
                                ],
                            },
                        }),
                    });
                    jira_comment_id = commentData.id;
                    console.log(`[tickets] Posted comment to Jira: ${ticket.jira_key}`);
                } catch (jiraErr) {
                    console.error('[tickets] Failed to post Jira comment:', jiraErr.message);
                }
            }

            // Save locally
            const result = await pg.query(
                `INSERT INTO gescall_ticket_comments (ticket_id, jira_comment_id, author, body, source)
       VALUES ($1, $2, $3, $4, 'gescall')
       RETURNING *`,
                [id, jira_comment_id, author, body.trim()]
            );

            // Update ticket timestamp
            await pg.query('UPDATE gescall_support_tickets SET updated_at = NOW() WHERE id = $1', [id]);

            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            console.error('[tickets] Error adding comment:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * PATCH /api/tickets/:id/status
     * Update ticket status locally (+ optionally transition in Jira)
     */
    router.patch('/:id/status', requirePermission('view_support'), async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            if (!status) {
                return res.status(400).json({ success: false, error: 'El estado es requerido' });
            }

            const result = await pg.query(
                'UPDATE gescall_support_tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
                [status, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Ticket no encontrado' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            console.error('[tickets] Error updating status:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/tickets/:id/attachments/:attachmentId
     * Proxy to fetch attachment from Jira
     */
    router.get('/:id/attachments/:attachmentId', requirePermission('view_support'), async (req, res) => {
        try {
            const { attachmentId } = req.params;
            if (!jiraEnabled()) return res.status(400).json({ success: false, error: 'Jira no configurado' });

            const base = JIRA_BASE_URL.replace(/\/+$/, '');
            const url = `${base}/rest/api/3/attachment/content/${attachmentId}`;

            const apiRes = await fetch(url, { headers: jiraHeaders() });
            if (!apiRes.ok) throw new Error(`Jira returned ${apiRes.status}`);

            res.setHeader('Content-Type', apiRes.headers.get('content-type') || 'application/octet-stream');
            res.setHeader('Content-Disposition', apiRes.headers.get('content-disposition') || `inline; filename="attachment-${attachmentId}"`);
            res.setHeader('Cache-Control', 'public, max-age=86400');

            const buffer = await apiRes.arrayBuffer();
            res.send(Buffer.from(buffer));
        } catch (error) {
            console.error('[tickets] Error fetching attachment:', error);
            res.status(500).json({ success: false, error: 'Error al obtener adjunto' });
        }
    });

    /**
     * POST /api/tickets/:id/attachments
     * Upload an attachment to Jira
     */
    router.post('/:id/attachments', requirePermission('view_support'), upload.single('file'), async (req, res) => {
        try {
            const { id } = req.params;
            const file = req.file;

            if (!file) return res.status(400).json({ success: false, error: 'Archivo no proporcionado' });

            const ticketResult = await pg.query('SELECT * FROM gescall_support_tickets WHERE id = $1', [id]);
            if (ticketResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Ticket no encontrado' });
            const ticket = ticketResult.rows[0];

            if (jiraEnabled() && ticket.jira_id) {
                const form = new FormData();
                form.append('file', file.buffer, {
                    filename: file.originalname,
                    contentType: file.mimetype,
                });

                const base = JIRA_BASE_URL.replace(/\/+$/, '');
                const url = `${base}/rest/api/3/issue/${ticket.jira_id}/attachments`;

                // For Jira attachments we must include the X-Atlassian-Token header
                const auth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
                const headers = {
                    Authorization: `Basic ${auth}`,
                    'X-Atlassian-Token': 'no-check',
                    ...form.getHeaders()
                };

                const apiRes = await fetch(url, { method: 'POST', body: form, headers });
                if (!apiRes.ok) {
                    const errBody = await apiRes.text();
                    console.error('[tickets] Jira attach fail:', apiRes.status, errBody);
                    throw new Error('Error subiendo archivo a Jira');
                }
                const result = await apiRes.json();

                // Emulate attachment format
                const a = result[0];
                return res.json({
                    success: true,
                    data: {
                        id: a.id,
                        filename: a.filename,
                        mimeType: a.mimeType,
                        size: a.size,
                        url: `/api/tickets/${ticket.id}/attachments/${a.id}`,
                        created: a.created
                    }
                });
            } else {
                return res.status(400).json({ success: false, error: 'No se pueden adjuntar archivos si Jira no está habilitado' });
            }
        } catch (error) {
            console.error('[tickets] Error uploading attachment:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ── Jira Webhook Receiver ──────────────────────────────────────────────────
    // Jira sends POST events here whenever an issue in the project is updated,
    // deleted, or receives a comment. No JWT required (skipped in jwtAuth.js).
    // Optionally protected by JIRA_WEBHOOK_SECRET header check.

    const JIRA_WEBHOOK_SECRET = process.env.JIRA_WEBHOOK_SECRET || '';

    /**
     * POST /api/tickets/webhook/jira
     * Receives Jira webhook events and syncs changes locally.
     */
    router.post('/webhook/jira', async (req, res) => {
        try {
            // Optional secret validation
            if (JIRA_WEBHOOK_SECRET) {
                const headerSecret = req.headers['x-webhook-secret'] || req.query.secret || '';
                if (headerSecret !== JIRA_WEBHOOK_SECRET) {
                    console.warn('[Jira Webhook] Invalid secret, rejecting');
                    return res.status(403).json({ error: 'Invalid webhook secret' });
                }
            }

            const event = req.body;
            const webhookEvent = event.webhookEvent || '';
            const issue = event.issue || {};
            const jiraId = String(issue.id || '');
            const jiraKey = issue.key || '';

            if (!jiraId) {
                return res.status(200).json({ ok: true, message: 'No issue in payload, skipped' });
            }

            console.log(`[Jira Webhook] Event: ${webhookEvent}, Issue: ${jiraKey} (${jiraId})`);

            // Find local ticket by jira_id
            const ticketResult = await pg.query(
                'SELECT * FROM gescall_support_tickets WHERE jira_id = $1',
                [jiraId]
            );

            if (ticketResult.rows.length === 0) {
                console.log(`[Jira Webhook] No local ticket for jira_id=${jiraId}, ignoring`);
                return res.status(200).json({ ok: true, message: 'Not tracked locally' });
            }

            const ticket = ticketResult.rows[0];

            // ── Issue Updated (status, priority, assignee, etc.) ──
            if (webhookEvent === 'jira:issue_updated') {
                const fields = issue.fields || {};
                const newStatus = fields.status?.name || ticket.status;
                const newPriority = fields.priority?.name || ticket.priority;
                const newAssignee = fields.assignee?.displayName || fields.assignee?.emailAddress || ticket.assigned_to;

                // Extract custom fields
                const customUpdates = {};
                if (JIRA_FIELD_USUARIO && fields[JIRA_FIELD_USUARIO]) customUpdates.usuario = fields[JIRA_FIELD_USUARIO];
                if (JIRA_FIELD_CLIENTE && fields[JIRA_FIELD_CLIENTE]) customUpdates.cliente = fields[JIRA_FIELD_CLIENTE];
                if (JIRA_FIELD_URL && fields[JIRA_FIELD_URL]) customUpdates.url = fields[JIRA_FIELD_URL];
                if (JIRA_FIELD_PAIS && fields[JIRA_FIELD_PAIS]) customUpdates.pais = typeof fields[JIRA_FIELD_PAIS] === 'object' ? fields[JIRA_FIELD_PAIS].value || fields[JIRA_FIELD_PAIS].name : fields[JIRA_FIELD_PAIS];
                if (JIRA_FIELD_TELEFONO && fields[JIRA_FIELD_TELEFONO]) customUpdates.telefono = fields[JIRA_FIELD_TELEFONO];

                // Build SET clause dynamically
                let setClauses = ['status = $1', 'priority = $2', 'assigned_to = $3', 'updated_at = NOW()'];
                let params = [newStatus, newPriority, newAssignee];
                for (const [col, val] of Object.entries(customUpdates)) {
                    params.push(typeof val === 'string' ? val : JSON.stringify(val));
                    setClauses.push(`${col} = $${params.length}`);
                }
                params.push(ticket.id);

                await pg.query(
                    `UPDATE gescall_support_tickets SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
                    params
                );
                console.log(`[Jira Webhook] Updated ticket #${ticket.id}: status=${newStatus}, priority=${newPriority}, custom fields: ${Object.keys(customUpdates).join(', ') || 'none'}`);

                // Check for new comment in the changelog
                const comment = event.comment;
                if (comment && comment.id) {
                    const existing = await pg.query(
                        'SELECT id FROM gescall_ticket_comments WHERE jira_comment_id = $1',
                        [String(comment.id)]
                    );
                    if (existing.rows.length === 0) {
                        const body = extractAdfText(comment.body).trim();
                        await pg.query(
                            `INSERT INTO gescall_ticket_comments (ticket_id, jira_comment_id, author, body, source, created_at)
                         VALUES ($1, $2, $3, $4, 'jira', $5)`,
                            [
                                ticket.id,
                                String(comment.id),
                                comment.author?.displayName || comment.author?.emailAddress || 'Jira',
                                body,
                                comment.created || new Date().toISOString(),
                            ]
                        );
                        console.log(`[Jira Webhook] Synced comment from ${comment.author?.displayName}`);
                    }
                }
            }

            // ── Issue Deleted ──
            if (webhookEvent === 'jira:issue_deleted') {
                await pg.query('DELETE FROM gescall_ticket_comments WHERE ticket_id = $1', [ticket.id]);
                await pg.query('DELETE FROM gescall_support_tickets WHERE id = $1', [ticket.id]);
                console.log(`[Jira Webhook] Ticket #${ticket.id} (${jiraKey}) deleted from GesCall`);
            }

            // ── Comment Created (separate event) ──
            if (webhookEvent === 'comment_created') {
                const comment = event.comment;
                if (comment && comment.id) {
                    const existing = await pg.query(
                        'SELECT id FROM gescall_ticket_comments WHERE jira_comment_id = $1',
                        [String(comment.id)]
                    );
                    if (existing.rows.length === 0) {
                        const body = extractAdfText(comment.body).trim();
                        await pg.query(
                            `INSERT INTO gescall_ticket_comments (ticket_id, jira_comment_id, author, body, source, created_at)
                         VALUES ($1, $2, $3, $4, 'jira', $5)`,
                            [
                                ticket.id,
                                String(comment.id),
                                comment.author?.displayName || comment.author?.emailAddress || 'Jira',
                                body,
                                comment.created || new Date().toISOString(),
                            ]
                        );
                        await pg.query('UPDATE gescall_support_tickets SET updated_at = NOW() WHERE id = $1', [ticket.id]);
                        console.log(`[Jira Webhook] New comment synced on ticket #${ticket.id}`);
                    }
                }
            }

            res.status(200).json({ ok: true });

            // Notify connected frontends to refresh tickets
            if (io) {
                io.emit('ticket:updated', { jiraKey: jiraKey, jiraId: jiraId, event: webhookEvent });
                console.log(`[Jira Webhook] Emitted ticket:updated to all clients`);
            }
        } catch (error) {
            console.error('[Jira Webhook] Error processing event:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}; // end module.exports factory
