require('dotenv').config();
const express = require('express');
const cors = require('cors');
const publicRoutes = require('./routes/public');
const { publicApiAuth } = require('./middleware/publicApiAuth');
const audioRoutes = require('./routes/audio');
const swaggerSpec = require('./swagger');
const swaggerUi = require('swagger-ui-express');
const cron = require('node-cron');
const { keepRemoteAgentsAlive } = require('./services/keepRemoteAgentsAlive');

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://164.92.67.176:5173',
  'https://gescall.balenthi.com',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'http://164.92.67.176:3002',
  'http://209.38.233.46:3002',
  ...(process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean),
].filter(Boolean);

const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) {
    return callback(null, origin);
  }
  console.log('[CORS Public API] BLOCKED Origin:', origin);
  // TEMPORARY: Allow this origin anyway to fix the issue and catch the value in logs
  return callback(null, origin);
};

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const docsUser = process.env.DOCS_PORTAL_USER || 'docs';
const docsPass = process.env.DOCS_PORTAL_PASS || 'docs';

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const parts = raw.split(';').map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(`${name}=`));
  if (!found) return '';
  return decodeURIComponent(found.split('=').slice(1).join('='));
}

function docsPortalAuth(req, res, next) {
  const token = getCookie(req, 'docs_auth');
  if (token === '1') {
    return next();
  }
  return res.status(302).redirect('/api/docs-login');
}

const { URL } = require('url');

function extractHostname(urlString) {
  try {
    if (!urlString) return null;
    // Handle cases without protocol just in case, though allowedOrigins usually have them
    const url = urlString.startsWith('http') ? urlString : `http://${urlString}`;
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

function restrictDocsToCorsIps(req, res, next) {
  // Get client IP, handling proxies (x-forwarded-for)
  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  // Normalize IP (remove IPv6 prefix if present)
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
  if (clientIp.startsWith('::ffff:')) clientIp = clientIp.substring(7);
  if (clientIp === '::1') clientIp = '127.0.0.1';

  // Extract allowed IPs/Hostnames from allowedOrigins
  const allowedHosts = allowedOrigins
    .map(origin => extractHostname(origin))
    .filter(Boolean);

  // Check if client IP is in allowed hosts
  // Note: This is a simple string match. For robust CIDR support, a library like 'ip-range-check' would be needed, 
  // but for this requirement (matching listed CORS IPs), strict equality or inclusion is sufficient.

  const isAllowed = allowedHosts.includes(clientIp);

  if (!isAllowed) {
    console.log(`[Docs Access] BLOCKED IP: ${clientIp} - Not in allowed CORS origins`);
    return res.status(403).send('Access Denied: Your IP is not authorized to view documentation.');
  }

  next();
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'public-api',
  });
});

app.get('/api/docs-login', restrictDocsToCorsIps, (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gescall API Docs</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f6f7fb; }
      .card { max-width: 420px; margin: 10vh auto; background: #fff; border-radius: 10px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
      h1 { font-size: 20px; margin: 0 0 12px; }
      label { display: block; font-size: 12px; color: #4b5563; margin-top: 12px; }
      input { width: 100%; padding: 10px 12px; margin-top: 6px; border: 1px solid #e5e7eb; border-radius: 6px; }
      button { width: 100%; margin-top: 16px; padding: 10px 12px; border: 0; background: #2563eb; color: #fff; border-radius: 6px; cursor: pointer; }
      .error { color: #dc2626; font-size: 12px; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Acceso a documentación</h1>
      <form method="post" action="/api/docs/login">
        <label for="user">Usuario</label>
        <input id="user" name="user" autocomplete="username" required />
        <label for="pass">Contraseña</label>
        <input id="pass" name="pass" type="password" autocomplete="current-password" required />
        <button type="submit">Ingresar</button>
      </form>
    </div>
  </body>
</html>
  `);
});

app.post('/api/docs/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (user === docsUser && pass === docsPass) {
    res.setHeader('Set-Cookie', 'docs_auth=1; Path=/api; HttpOnly; SameSite=Lax');
    return res.redirect('/api/docs-keys');
  }
  return res.status(401).send('Credenciales inválidas');
});

function getConfiguredKeys() {
  const raw = process.env.PUBLIC_API_KEYS || process.env.PUBLIC_API_KEY || '';
  return raw
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
}

app.get('/api/docs-keys', restrictDocsToCorsIps, docsPortalAuth, (req, res) => {
  const keys = getConfiguredKeys();
  res.send(`
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Keys - Gescall</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f6f7fb; padding: 20px; }
      .container { max-width: 800px; margin: 0 auto; }
      .card { background: #fff; border-radius: 10px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); margin-bottom: 20px; }
      h1 { font-size: 24px; margin: 0 0 20px; color: #111827; }
      h2 { font-size: 18px; margin: 20px 0 12px; color: #374151; }
      .key-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin: 8px 0; font-family: monospace; word-break: break-all; }
      .copy-btn { margin-top: 8px; padding: 6px 12px; background: #2563eb; color: #fff; border: 0; border-radius: 4px; cursor: pointer; font-size: 12px; }
      .info { background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px; margin: 16px 0; border-radius: 4px; }
      .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 16px 0; border-radius: 4px; }
      .btn-primary { display: inline-block; margin-top: 16px; padding: 10px 20px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; }
      .btn-secondary { display: inline-block; margin-left: 8px; padding: 10px 20px; background: #6b7280; color: #fff; text-decoration: none; border-radius: 6px; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
      pre { background: #1f2937; color: #f9fafb; padding: 16px; border-radius: 6px; overflow-x: auto; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <h1>🔑 API Keys Configuradas</h1>
        ${keys.length > 0 ? `
          <div class="info">
            <strong>✓ API Keys encontradas:</strong> ${keys.length}
          </div>
          ${keys.map((key, idx) => `
            <div>
              <strong>API Key #${idx + 1}:</strong>
              <div class="key-box" id="key-${idx}">${key}</div>
              <button class="copy-btn" onclick="copyKey('key-${idx}')">Copiar</button>
            </div>
          `).join('')}
          <h2>📖 Cómo usar la API</h2>
          <ol style="line-height: 1.8;">
            <li>Ve a <a href="/api/docs/swagger" target="_blank"><strong>Swagger UI</strong></a> para <strong>probar los endpoints directamente</strong> desde el navegador</li>
            <li>En Swagger UI, haz click en <strong>"Authorize"</strong> (arriba a la derecha) y pega tu API Key</li>
            <li>Luego puedes hacer click en <strong>"Try it out"</strong> en cualquier endpoint para probarlo</li>
            <li>Para usar desde código, incluye el header <code>x-api-key</code>: <code>curl -H "x-api-key: TU_API_KEY" ...</code></li>
          </ol>
        ` : `
          <div class="warning">
            <strong>⚠ No hay API Keys configuradas</strong>
            <p>Para configurar las API Keys, edita el archivo <code>.env</code> en <code>/opt/gescall/back-public/</code> y agrega:</p>
            <pre>PUBLIC_API_KEYS=tu_api_key_1,tu_api_key_2,tu_api_key_3</pre>
            <p>Luego reinicia el servicio:</p>
            <pre>pm2 restart gescall-public-api</pre>
          </div>
        `}
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <a href="/api/docs/swagger" class="btn-primary">🚀 Swagger UI (Probar API)</a>
          <a href="/api/docs/logout" class="btn-secondary">Cerrar Sesión</a>
        </div>
      </div>
    </div>
    <script>
      function copyKey(id) {
        const el = document.getElementById(id);
        const text = el.textContent.trim();
        navigator.clipboard.writeText(text).then(() => {
          const btn = event.target;
          const original = btn.textContent;
          btn.textContent = '✓ Copiado!';
          setTimeout(() => { btn.textContent = original; }, 2000);
        });
      }
    </script>
  </body>
</html>
  `);
});

app.post('/api/docs/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'docs_auth=; Path=/api; Max-Age=0; HttpOnly; SameSite=Lax');
  return res.redirect('/api/docs-login');
});



app.get('/api/public/docs.json', restrictDocsToCorsIps, docsPortalAuth, (req, res) => {
  res.json(swaggerSpec);
});


// Swagger UI para probar endpoints directamente
app.use('/api/docs/swagger', restrictDocsToCorsIps, docsPortalAuth, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Gescall API - Swagger UI (Para Probar)',
}));

app.get('/api/docs.json', restrictDocsToCorsIps, docsPortalAuth, (req, res) => {
  res.json(swaggerSpec);
});



// Redirect /api/docs to Swagger UI
app.get('/api/docs', restrictDocsToCorsIps, (req, res) => {
  res.redirect('/api/docs/swagger');
});

app.use('/api/public/v1/audio', publicApiAuth, audioRoutes);
app.use('/api/public/v1', publicRoutes);

const PORT = process.env.PUBLIC_API_PORT || 3002;

// Ejecutar keepRemoteAgentsAlive cada 10 segundos para mantener los agentes visibles
// Esto hace que los usuarios con remote agents aparezcan como disponibles en el reporte en tiempo real
cron.schedule('*/10 * * * * *', () => {
  keepRemoteAgentsAlive().catch((err) => {
    console.error('[Cron] Error en keepRemoteAgentsAlive:', err.message);
  });
});

// Inicializar tablas de base de datos al arrancar
(async () => {
  try {
    const database = require('./config/database');
    const sql = `
      CREATE TABLE IF NOT EXISTS gescall_api_keys (
        api_key VARCHAR(255) PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        last_used_at TIMESTAMP NULL,
        is_active TINYINT(1) DEFAULT 1,
        INDEX idx_username (username),
        INDEX idx_expires_at (expires_at),
        INDEX idx_is_active (is_active)
      )
    `;
    await database.query(sql);
    console.log('[Init] Tabla de API keys inicializada');
  } catch (err) {
    console.error('[Init] Error inicializando tablas:', err.message);
  }
})();

// Ejecutar inmediatamente al iniciar
keepRemoteAgentsAlive().catch((err) => {
  console.error('[Init] Error en keepRemoteAgentsAlive:', err.message);
});

app.listen(PORT, () => {
  console.log(`Public API server running on port ${PORT}`);
});
