#!/usr/bin/env node
/**
 * Smoke test: reporte de pausas por agente.
 *
 * Uso:
 *   BACKEND_URL="http://127.0.0.1:3001" \
 *   GESCALL_USER="admin" \
 *   GESCALL_PASS="admin" \
 *   node scripts/smoke_pause_report.js
 *
 * Opcionales:
 *   START_DATETIME="2026-05-05 00:00:00"
 *   END_DATETIME="2026-05-05 23:59:59"
 *   CAMPAIGNS="C001,C002"
 */

function toSqlDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 0);
  return {
    startDatetime: toSqlDateTime(start),
    endDatetime: toSqlDateTime(end),
  };
}

function parseCampaigns(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

async function requestJson(url, options) {
  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  if (!res.ok) {
    const detail = body && (body.error || body.message) ? ` - ${body.error || body.message}` : '';
    throw new Error(`HTTP ${res.status} ${res.statusText}${detail}`);
  }
  return body;
}

function validateRows(rows) {
  const issues = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      issues.push('Fila inválida (no es objeto)');
      continue;
    }
    if (!row.agent_username) issues.push('Fila sin agent_username');
    if (!row.pause_code) issues.push('Fila sin pause_code');
    if (typeof row.pause_sessions !== 'number') issues.push('pause_sessions no numérico');
    if (typeof row.total_pause_sec !== 'number') issues.push('total_pause_sec no numérico');
    if (row.pause_sessions < 0) issues.push('pause_sessions negativo');
    if (row.total_pause_sec < 0) issues.push('total_pause_sec negativo');
  }
  return issues;
}

async function main() {
  const backend = process.env.BACKEND_URL || 'http://127.0.0.1:3001';
  const username = process.env.GESCALL_USER || '';
  const password = process.env.GESCALL_PASS || '';
  const campaigns = parseCampaigns(process.env.CAMPAIGNS || '');
  const range = todayRange();
  const startDatetime = process.env.START_DATETIME || range.startDatetime;
  const endDatetime = process.env.END_DATETIME || range.endDatetime;

  if (!username || !password) {
    throw new Error('Faltan credenciales: define GESCALL_USER y GESCALL_PASS');
  }

  console.log('[smoke] Login...');
  const login = await requestJson(`${backend}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_user: username,
      password,
    }),
  });

  const token = login?.token || login?.data?.token;
  if (!token) {
    throw new Error('Login exitoso pero no se recibió token');
  }

  console.log('[smoke] Consultando /api/reports/system/agent-pause-summary ...');
  const report = await requestJson(`${backend}/api/reports/system/agent-pause-summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      campaigns,
      startDatetime,
      endDatetime,
    }),
  });

  if (!report?.success || !Array.isArray(report.data)) {
    throw new Error('Respuesta inválida del endpoint de reporte');
  }

  const issues = validateRows(report.data);
  if (issues.length > 0) {
    console.error('[smoke] Inconsistencias detectadas:');
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(2);
  }

  const totalRows = report.data.length;
  const totalSec = report.data.reduce((acc, r) => acc + (r.total_pause_sec || 0), 0);
  const uniqueAgents = new Set(report.data.map((r) => r.agent_username)).size;
  const uniqueCodes = new Set(report.data.map((r) => r.pause_code)).size;

  console.log('[smoke] OK');
  console.log(`  rango: ${startDatetime} -> ${endDatetime}`);
  console.log(`  campañas enviadas: ${campaigns.length}`);
  console.log(`  filas: ${totalRows}`);
  console.log(`  agentes: ${uniqueAgents}`);
  console.log(`  tipos de pausa: ${uniqueCodes}`);
  console.log(`  tiempo total en pausa (s): ${totalSec}`);
}

main().catch((err) => {
  console.error('[smoke] ERROR:', err.message);
  process.exit(1);
});

