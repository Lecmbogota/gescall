#!/usr/bin/env node
/**
 * Smoke E2E con fixture:
 * 1) Login
 * 2) Inserta una pausa temporal en gescall_agent_pause_segments
 * 3) Consulta /api/reports/system/agent-pause-summary
 * 4) Verifica que la fila exista
 * 5) Limpia fixture
 *
 * Uso:
 *   BACKEND_URL="http://127.0.0.1:3001" \
 *   GESCALL_USER="admin" \
 *   GESCALL_PASS="admin" \
 *   node scripts/smoke_pause_report_with_fixture.js
 */

const fs = require('fs');
const dotenv = require('dotenv');
if (fs.existsSync(__dirname + '/../.env')) {
  const envConfig = dotenv.parse(fs.readFileSync(__dirname + '/../.env'));
  for (const k in envConfig) process.env[k] = envConfig[k];
}
const pg = require('../config/pgDatabase');

function toSqlDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

async function login(backend, username, password) {
  const data = await requestJson(`${backend}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_user: username, password }),
  });
  const token = data?.token || data?.data?.token;
  if (!token) throw new Error('Login sin token');
  return token;
}

async function resolveCampaigns(backend, token) {
  const data = await requestJson(`${backend}/api/campaigns`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const rows = Array.isArray(data?.data) ? data.data : [];
  const ids = rows
    .map((r) => String(r.campaign_id || '').trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

async function main() {
  const backend = process.env.BACKEND_URL || 'http://127.0.0.1:3001';
  const username = process.env.GESCALL_USER || '';
  const password = process.env.GESCALL_PASS || '';
  if (!username || !password) {
    throw new Error('Define GESCALL_USER y GESCALL_PASS');
  }

  console.log('[fixture] Login...');
  const token = await login(backend, username, password);

  let campaigns = [];
  if (process.env.CAMPAIGNS) {
    campaigns = process.env.CAMPAIGNS.split(',').map((x) => x.trim()).filter(Boolean);
  } else {
    campaigns = await resolveCampaigns(backend, token);
  }
  if (campaigns.length === 0) {
    throw new Error('No hay campañas accesibles para este usuario');
  }
  const campaignId = campaigns[0];

  const now = new Date();
  const startRange = new Date(now);
  startRange.setHours(0, 0, 0, 0);
  const endRange = new Date(now);
  endRange.setHours(23, 59, 59, 0);
  const startedAt = new Date(now.getTime() - 5 * 60 * 1000);
  const endedAt = new Date(now.getTime() - 3 * 60 * 1000);
  const expectedSec = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

  const markerCode = 'NOT_READY_SMOKE';
  const markerUser = `smoke_${Date.now()}`;

  console.log(`[fixture] Insertando segmento temporal (${markerUser})...`);
  const ins = await pg.query(
    `INSERT INTO gescall_agent_pause_segments
      (agent_username, pause_code, campaign_id, started_at, ended_at, duration_sec)
     VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6)
     RETURNING segment_id`,
    [markerUser, markerCode, campaignId, startedAt.toISOString(), endedAt.toISOString(), expectedSec]
  );
  const segmentId = ins.rows[0]?.segment_id;
  if (!segmentId) throw new Error('No se pudo crear fixture');

  try {
    console.log('[fixture] Consultando reporte...');
    const report = await requestJson(`${backend}/api/reports/system/agent-pause-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        campaigns: [campaignId],
        startDatetime: toSqlDateTime(startRange),
        endDatetime: toSqlDateTime(endRange),
      }),
    });

    const rows = Array.isArray(report?.data) ? report.data : [];
    const found = rows.find((r) => r.agent_username === markerUser && r.pause_code === markerCode);
    if (!found) {
      throw new Error('La fila fixture no apareció en el reporte');
    }
    if (typeof found.total_pause_sec !== 'number' || found.total_pause_sec <= 0) {
      throw new Error('total_pause_sec inválido para la fila fixture');
    }

    console.log('[fixture] OK');
    console.log(`  campaña: ${campaignId}`);
    console.log(`  fixture segment_id: ${segmentId}`);
    console.log(`  pause_sessions reportado: ${found.pause_sessions}`);
    console.log(`  total_pause_sec reportado: ${found.total_pause_sec}`);
  } finally {
    await pg.query('DELETE FROM gescall_agent_pause_segments WHERE segment_id = $1', [segmentId]).catch(() => {});
    console.log(`[fixture] Limpieza realizada para segment_id=${segmentId}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[fixture] ERROR:', err.message);
    process.exit(1);
  });

