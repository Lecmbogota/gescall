/**
 * ivrFlows.js — REST API for IVR Flow CRUD
 */
const express = require('express');
const router = express.Router();

module.exports = function (database) {

    // Helper: get pool lazily (database.pool may be null until connect resolves)
    const getPool = () => {
        if (!database.pool) throw new Error('Database not connected');
        return database.pool;
    };

    const executeQuery = async (query, params) => {
        const pool = getPool();
        if (pool.execute) {
            // MySQL
            const [rows] = await pool.execute(query, params);
            return rows;
        } else {
            // PostgreSQL — rewrite MySQL placeholders to $N
            let pgQuery = query;
            let counter = 1;
            while (pgQuery.includes('?')) {
                pgQuery = pgQuery.replace('?', '$' + counter);
                counter++;
            }
            // Rewrite MySQL ON DUPLICATE KEY UPDATE to PostgreSQL ON CONFLICT
            if (pgQuery.includes('ON DUPLICATE KEY UPDATE')) {
                pgQuery = pgQuery.replace(
                    /ON DUPLICATE KEY UPDATE\s+flow_json\s*=\s*VALUES\(flow_json\)\s*,\s*is_active\s*=\s*VALUES\(is_active\)/i,
                    'ON CONFLICT (campaign_id) DO UPDATE SET flow_json = EXCLUDED.flow_json, is_active = EXCLUDED.is_active'
                );
            }
            const { rows } = await pool.query(pgQuery, params);
            return rows;
        }
    };

    // Node type definitions for the frontend
    const NODE_TYPES = [
        {
            type: 'play_tts', label: 'Reproducir TTS', icon: 'MessageSquare', color: '#6366f1',
            description: 'Genera y reproduce audio con texto a voz',
            fields: [
                { name: 'text', label: 'Texto', type: 'textarea', required: true, placeholder: 'Usa {{comments}} para insertar el mensaje del lead' },
                { name: 'interruptible', label: 'Interrumpible con DTMF', type: 'boolean', default: false },
            ]
        },
        {
            type: 'play_audio', label: 'Reproducir Audio', icon: 'Volume2', color: '#8b5cf6',
            description: 'Reproduce un archivo de audio pregrabado',
            fields: [
                { name: 'filename', label: 'Archivo', type: 'text', required: true, placeholder: 'ej: custom/welcome' },
            ]
        },
        {
            type: 'collect_dtmf', label: 'Esperar DTMF', icon: 'Hash', color: '#f59e0b',
            description: 'Espera que el usuario marque un dígito',
            fields: [
                { name: 'timeout', label: 'Timeout (seg)', type: 'number', default: 10 },
                { name: 'maxRetries', label: 'Reintentos', type: 'number', default: 2 },
                { name: 'validDigits', label: 'Dígitos válidos', type: 'text', default: '0123456789' },
                { name: 'retryMessage', label: 'Mensaje de reintento', type: 'textarea', placeholder: 'No detectamos ninguna entrada...' },
                { name: 'invalidMessage', label: 'Mensaje inválido', type: 'textarea', placeholder: 'Opción no válida...' },
            ]
        },
        {
            type: 'menu', label: 'Menú Interactivo', icon: 'List', color: '#ec4899',
            description: 'Reproduce un audio/TTS y bifurca según el dígito marcado',
            fields: [
                { name: 'audioType', label: 'Origen del Audio', type: 'select', options: ['TTS', 'Audio'], default: 'TTS' },
                { name: 'text', label: 'Plantilla TTS', type: 'textarea', placeholder: 'Selecciona una plantilla...' },
                { name: 'filename', label: 'Archivo de Audio', type: 'text', placeholder: 'Sube un archivo de audio' },
                { name: 'validDigits', label: 'Dígitos Válidos', type: 'text', default: '123' },
                { name: 'timeout', label: 'Timeout (seg)', type: 'number', default: 10 },
                { name: 'maxRetries', label: 'Reintentos', type: 'number', default: 2 },
                { name: 'retryMessage', label: 'Mensaje Reintento', type: 'textarea', placeholder: 'Opción no válida...' },
                { name: 'interruptible', label: 'Interrumpible por DTMF', type: 'boolean', default: true },
            ]
        },
        {
            type: 'transfer', label: 'Transferir', icon: 'PhoneForwarded', color: '#10b981',
            description: 'Transfiere la llamada a una campaña, agente o número externo',
            fields: [
                { name: 'destinationType', label: 'Destino', type: 'select', options: ['Campaña', 'Agente', 'Número externo'], default: 'Campaña' },
                { name: 'targetCampaignId', label: 'Campaña destino', type: 'select', placeholder: 'Selecciona la campaña destino' },
                { name: 'agentUsername', label: 'Usuario agente', type: 'text', placeholder: 'Ej: agente1' },
                { name: 'agentExtension', label: 'Extensión agente', type: 'text', placeholder: 'Opcional si el usuario tiene extensión' },
                { name: 'number', label: 'Número externo', type: 'text', placeholder: 'Ej: 573152092535' },
                { name: 'trunk', label: 'Troncal', type: 'select', options: ['PJSIP/chock', 'SIP/gs102', 'SIP/10000'], default: 'PJSIP/chock' },
                { name: 'prefix', label: 'Prefijo de marcado', type: 'text', placeholder: 'Ej: 1122 (se antepone al número)' },
                { name: 'overflowNumber', label: 'Número de desborde', type: 'text', placeholder: 'Si no contesta, transferir a...' },
                { name: 'message', label: 'Mensaje antes de transferir', type: 'textarea', placeholder: 'En breve será atendido...' },
                { name: 'timeout', label: 'Timeout (seg)', type: 'number', default: 45 },
            ]
        },
        {
            type: 'condition', label: 'Condición', icon: 'GitBranch', color: '#ef4444',
            description: 'Bifurca el flujo basado en una condición',
            fields: [
                { name: 'variable', label: 'Variable (ej: api_status, dtmf)', type: 'text', placeholder: 'Nombre de variable a evaluar' },
                { name: 'operator', label: 'Operador', type: 'select', options: ['equals', 'not_equals', 'contains', 'not_empty', 'empty', 'greater_than', 'less_than'], default: 'equals' },
                { name: 'value', label: 'Valor', type: 'text' },
            ]
        },
        {
            type: 'set_variable', label: 'Variable', icon: 'Settings', color: '#64748b',
            description: 'Establece una variable para uso posterior',
            fields: [
                { name: 'name', label: 'Nombre', type: 'text', required: true },
                { name: 'value', label: 'Valor', type: 'text', required: true },
            ]
        },
        {
            type: 'hangup', label: 'Colgar', icon: 'PhoneOff', color: '#dc2626',
            description: 'Termina la llamada',
            fields: [
                { name: 'message', label: 'Mensaje de despedida', type: 'textarea', placeholder: 'Gracias por llamar...' },
                { name: 'status', label: 'Estado del lead', type: 'select', options: ['NEW', 'QUEUE', 'NI', 'SALE', 'PU', 'PM', 'XFER', 'CB', 'CALLBK', 'CBHOLD', 'NA', 'AA', 'N', 'NP', 'B', 'AB', 'DROP', 'XDROP', 'PDROP', 'AM', 'AL', 'AFAX', 'DNC', 'DC', 'ADC', 'DNCC', 'WLFLTR', 'ERI', 'A', 'INCALL', 'DEAD', 'DISPO', 'COMPLET'], default: 'COMPLET' },
            ]
        },
        {
            type: 'http_request', label: 'HTTP Request', icon: 'Globe', color: '#0ea5e9',
            description: 'Realiza una petición HTTP a un servicio externo',
            fields: [
                { name: 'url', label: 'URL', type: 'text', required: true, placeholder: 'ej: https://api.com/v1/users/{{phone}}' },
                { name: 'method', label: 'Método', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
                { name: 'headers', label: 'Headers (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer token", "Content-Type": "application/json"}' },
                { name: 'params', label: 'Query Params (JSON)', type: 'textarea', placeholder: '{"tel": "{{phone}}", "account": "123"}' },
                { name: 'body', label: 'Body (JSON)', type: 'textarea', placeholder: '{"name": "{{first_name}}"}' },
            ]
        },
    ];

    // GET /api/ivr-flows/node-types
    router.get('/node-types', (req, res) => {
        res.json(NODE_TYPES);
    });

    // GET /api/ivr-flows/:campaignId
    router.get('/:campaignId', async (req, res) => {
        try {
            const rows = await executeQuery(
                'SELECT * FROM gescall_ivr_flows WHERE campaign_id = ? LIMIT 1',
                [req.params.campaignId]
            );
            if (rows.length === 0) {
                return res.json({ campaign_id: req.params.campaignId, flow_json: null, is_active: false });
            }
            const row = rows[0];
            res.json({
                id: row.id,
                campaign_id: row.campaign_id,
                flow: JSON.parse(row.flow_json),
                is_active: row.is_active === 1,
                created_at: row.created_at,
                updated_at: row.updated_at,
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/ivr-flows/:campaignId
    router.put('/:campaignId', async (req, res) => {
        try {
            const { flow, is_active } = req.body;
            const flowJson = JSON.stringify(flow);
            const active = is_active !== undefined ? (is_active ? 1 : 0) : 1;

            await executeQuery(
                `INSERT INTO gescall_ivr_flows (campaign_id, flow_json, is_active)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE flow_json = VALUES(flow_json), is_active = VALUES(is_active)`,
                [req.params.campaignId, flowJson, active]
            );

            res.json({ success: true, campaign_id: req.params.campaignId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/ivr-flows/:campaignId
    router.delete('/:campaignId', async (req, res) => {
        try {
            await executeQuery('DELETE FROM gescall_ivr_flows WHERE campaign_id = ?', [req.params.campaignId]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/ivr-flows/test-tts
    router.post('/test-tts', async (req, res) => {
        try {
            const { text } = req.body;
            if (!text) return res.status(400).json({ error: 'Text required' });

            const http = require('http');
            // Optimización Gescall: Usar Keep-Alive Agent para reusar sockets TCP al modelo de IA
            const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });

            let TTS_API = process.env.PIPER_TTS_URL || 'http://127.0.0.1:5000/tts';

            try {
                const rows = await executeQuery('SELECT url FROM gescall_tts_nodes WHERE is_active = TRUE');
                if (rows && rows.length > 0) {
                    const randIdx = Math.floor(Math.random() * rows.length);
                    TTS_API = rows[randIdx].url;
                }
            } catch (e) {
                console.warn('[API] Error fetching TTS from DB for test, fallback to ENV:', e.message);
            }

            const data = JSON.stringify({ text, format: 'wav' });

            const response = await new Promise((resolve, reject) => {
                const url = new URL(TTS_API);
                const req = http.request({
                    hostname: url.hostname,
                    port: url.port,
                    path: url.pathname,
                    method: 'POST',
                    agent: keepAliveAgent,
                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
                    timeout: 15000,
                }, (resp) => {
                    const chunks = [];
                    resp.on('data', chunk => chunks.push(chunk));
                    resp.on('end', () => resolve({ status: resp.statusCode, data: Buffer.concat(chunks) }));
                });
                req.on('error', reject);
                req.on('timeout', () => { req.destroy(); reject(new Error('TTS timeout')); });
                req.write(data);
                req.end();
            });

            if (response.status === 200) {
                res.set('Content-Type', 'audio/wav');
                res.send(response.data);
            } else {
                res.status(500).json({ error: `TTS server returned ${response.status}` });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/ivr-flows/:campaign_id/executions
    router.get('/:campaign_id/executions', async (req, res) => {
        try {
            const { campaign_id } = req.params;
            const limit = parseInt(req.query.limit) || 50;
            // Fetch the list of past executions (without the full JSON payload for bandwidth efficiency)
            const rows = await executeQuery(
                `SELECT id, campaign_id, lead_id, channel_id, started_at, finished_at, duration_ms, status, created_at 
                 FROM gescall_ivr_executions 
                 WHERE campaign_id = ? 
                 ORDER BY id DESC LIMIT ?`,
                [campaign_id, limit]
            );
            res.json({ executions: rows });
        } catch (err) {
            console.error('[API] Error fetching executions:', err.message);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // GET /api/ivr-flows/executions/:id
    router.get('/executions/:id', async (req, res) => {
        try {
            const rows = await executeQuery(
                `SELECT * FROM gescall_ivr_executions WHERE id = ? LIMIT 1`,
                [req.params.id]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Execution not found' });
            }

            // Parse the stored JSON
            const execution = rows[0];
            try {
                if (execution.execution_data) {
                    execution.execution_data = JSON.parse(execution.execution_data);
                }
            } catch (e) {
                console.warn('[API] Could not parse execution_data JSON for id', execution.id);
            }

            res.json({ execution });
        } catch (err) {
            console.error('[API] Error fetching execution detail:', err.message);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    return router;
};
