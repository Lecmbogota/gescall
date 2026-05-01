const { Pool } = require('pg');
const pool = new Pool({
  user: 'gescall_admin',
  host: '127.0.0.1',
  database: 'gescall_db',
  password: 'gescall2024',
  port: 5432,
});

async function run() {
  const permissions = [
    'view_campaigns',
    'manage_schedules',
    'manage_audio',
    'view_reports',
    'manage_ivr',
    'manage_callerid',
    'manage_blacklist',
    'admin',
    'manage_tts_nodes',
    'manage_trunks',
    'view_users',
    'view_roles',
    'view_api_docs'
  ];

  try {
    for (const perm of permissions) {
        await pool.query("INSERT INTO gescall_role_permissions (role_id, permission) VALUES (1, $1) ON CONFLICT DO NOTHING;", [perm]);
    }
    console.log("Permissions granted successfully");
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
