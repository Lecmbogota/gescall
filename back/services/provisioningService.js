/**
 * GesCall Auto-Provisioning Service
 * 
 * Runs at backend startup to ensure all required resources exist:
 * - Database tables (10 gescall_* tables)
 * - Asterisk ARI configuration
 * - Required directories (TTS cache, audio files)
 * - Dialplan includes
 * 
 * All operations are idempotent (IF NOT EXISTS / check-before-write).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ──────────────────────────────────────────────────────
// Database Table Definitions
// ──────────────────────────────────────────────────────

const TABLES = [
    {
        name: 'gescall_call_log',
        sql: `CREATE TABLE IF NOT EXISTS gescall_call_log (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      lead_id INT(9) UNSIGNED NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      vendor_lead_code VARCHAR(40) DEFAULT NULL,
      pool_callerid VARCHAR(20) DEFAULT NULL COMMENT 'CallerID from pool (shown to customer)',
      original_callerid VARCHAR(30) DEFAULT NULL COMMENT 'Original Vicidial callerid (V-string)',
      campaign_id VARCHAR(20) NOT NULL,
      list_id BIGINT UNSIGNED DEFAULT NULL,
      call_date DATETIME NOT NULL,
      call_status VARCHAR(20) DEFAULT 'DIALING',
      dtmf_pressed VARCHAR(10) DEFAULT NULL COMMENT 'DTMF pressed by customer',
      call_duration INT UNSIGNED DEFAULT 0 COMMENT 'Duration in seconds',
      hangup_cause VARCHAR(50) DEFAULT NULL,
      uniqueid VARCHAR(30) DEFAULT NULL,
      server_ip VARCHAR(15) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_lead_id (lead_id),
      INDEX idx_phone_number (phone_number),
      INDEX idx_campaign_id (campaign_id),
      INDEX idx_call_date (call_date),
      INDEX idx_list_id (list_id),
      UNIQUE INDEX idx_lead_call (lead_id, call_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci`,
    },
    {
        name: 'gescall_callerid_pools',
        sql: `CREATE TABLE IF NOT EXISTS gescall_callerid_pools (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(255),
      country_code CHAR(2) DEFAULT 'CO',
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY idx_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
        name: 'gescall_callerid_pool_numbers',
        sql: `CREATE TABLE IF NOT EXISTS gescall_callerid_pool_numbers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pool_id INT NOT NULL,
      callerid VARCHAR(20) NOT NULL,
      area_code CHAR(3) NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      last_used_at DATETIME NULL,
      use_count INT DEFAULT 0,
      rr_order INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pool_id) REFERENCES gescall_callerid_pools(id) ON DELETE CASCADE,
      UNIQUE KEY idx_pool_callerid (pool_id, callerid),
      INDEX idx_selection (pool_id, area_code, is_active, rr_order),
      INDEX idx_area_code (area_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
        name: 'gescall_campaign_callerid_settings',
        sql: `CREATE TABLE IF NOT EXISTS gescall_campaign_callerid_settings (
      campaign_id VARCHAR(20) PRIMARY KEY,
      rotation_mode ENUM('OFF', 'POOL') DEFAULT 'OFF',
      pool_id INT NULL,
      match_mode ENUM('LEAD', 'FIXED') DEFAULT 'LEAD',
      fixed_area_code CHAR(3) NULL,
      fallback_callerid VARCHAR(20) NULL,
      selection_strategy ENUM('ROUND_ROBIN', 'RANDOM', 'LRU') DEFAULT 'ROUND_ROBIN',
      updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (pool_id) REFERENCES gescall_callerid_pools(id) ON DELETE SET NULL,
      INDEX idx_pool (pool_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
        name: 'gescall_callerid_usage_log',
        sql: `CREATE TABLE IF NOT EXISTS gescall_callerid_usage_log (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      campaign_id VARCHAR(20),
      lead_id INT NULL,
      phone_number VARCHAR(20),
      callerid_used VARCHAR(20),
      area_code_target CHAR(3),
      pool_id INT NULL,
      selection_result ENUM('MATCHED', 'FALLBACK', 'DEFAULT'),
      strategy ENUM('ROUND_ROBIN', 'RANDOM', 'LRU') NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_campaign_date (campaign_id, created_at),
      INDEX idx_callerid (callerid_used),
      INDEX idx_date (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
        name: 'gescall_ivr_flows',
        sql: `CREATE TABLE IF NOT EXISTS gescall_ivr_flows (
      id INT AUTO_INCREMENT PRIMARY KEY,
      campaign_id VARCHAR(20) NOT NULL,
      flow_json LONGTEXT NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY campaign_id (campaign_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci`,
    },
    {
        name: 'gescall_schedules',
        sql: `CREATE TABLE IF NOT EXISTS gescall_schedules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      schedule_type ENUM('list', 'campaign') NOT NULL,
      target_id VARCHAR(50) NOT NULL,
      target_name VARCHAR(255) DEFAULT NULL,
      action ENUM('activate', 'deactivate') NOT NULL,
      scheduled_at DATETIME NOT NULL,
      end_at DATETIME DEFAULT NULL,
      executed TINYINT(1) DEFAULT 0,
      executed_at DATETIME DEFAULT NULL,
      recurring ENUM('none', 'daily', 'weekly', 'monthly') DEFAULT 'none',
      created_by VARCHAR(50) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_scheduled_at (scheduled_at),
      KEY idx_executed (executed),
      KEY idx_type_target (schedule_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
        name: 'gescall_whitelist_prefixes',
        sql: `CREATE TABLE IF NOT EXISTS gescall_whitelist_prefixes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      prefix VARCHAR(3) NOT NULL UNIQUE,
      description VARCHAR(100) DEFAULT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prefix (prefix),
      INDEX idx_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
        name: 'gescall_campaign_playback',
        sql: `CREATE TABLE IF NOT EXISTS gescall_campaign_playback (
      campaign_id VARCHAR(20) NOT NULL PRIMARY KEY,
      playback_mode ENUM('tts', 'static_audio') NOT NULL DEFAULT 'tts',
      audio_filename VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci`,
    },
    {
        name: 'gescall_api_keys',
        sql: `CREATE TABLE IF NOT EXISTS gescall_api_keys (
      api_key VARCHAR(255) NOT NULL PRIMARY KEY,
      username VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      last_used_at TIMESTAMP NULL DEFAULT NULL,
      is_active TINYINT(1) DEFAULT 1,
      KEY idx_username (username),
      KEY idx_expires_at (expires_at),
      KEY idx_is_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci`,
    },
    {
        name: 'gescall_upload_tasks',
        sql: `CREATE TABLE IF NOT EXISTS gescall_upload_tasks (
      id VARCHAR(100) NOT NULL PRIMARY KEY,
      task_type VARCHAR(50) NOT NULL DEFAULT 'lead_upload',
      list_id BIGINT UNSIGNED DEFAULT NULL,
      campaign_id VARCHAR(20) DEFAULT NULL,
      status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
      total_records INT DEFAULT 0,
      processed_records INT DEFAULT 0,
      successful_records INT DEFAULT 0,
      error_records INT DEFAULT 0,
      leads_data LONGTEXT DEFAULT NULL,
      error_log TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_status (status),
      INDEX idx_campaign (campaign_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
];

// ──────────────────────────────────────────────────────
// Required Directories
// ──────────────────────────────────────────────────────

const DIRECTORIES = [
    '/var/lib/asterisk/sounds/tts/piper',
    '/var/lib/asterisk/sounds/gescall',
];

// ──────────────────────────────────────────────────────
// ARI Configuration
// ──────────────────────────────────────────────────────

const ARI_CONF_PATH = '/etc/asterisk/ari.conf';
const ARI_USER = process.env.ARI_USER || 'gescall';
const ARI_PASS = process.env.ARI_PASSWORD || 'gescall_ari_2026';

const ARI_CONF_CONTENT = `[general]
enabled = yes
pretty = yes
allowed_origins = *

[${ARI_USER}]
type = user
read_only = no
password = ${ARI_PASS}
password_format = plain
`;

// ──────────────────────────────────────────────────────
// Dialplan
// ──────────────────────────────────────────────────────

const EXTENSIONS_CONF = '/etc/asterisk/extensions.conf';
const GESCALL_CONF = '/etc/asterisk/extensions-gescall.conf';
const GESCALL_INCLUDE = '#include extensions-gescall.conf';

// ──────────────────────────────────────────────────────
// Main Provisioning Logic
// ──────────────────────────────────────────────────────

async function run(pool) {
    console.log('');
    console.log('┌──────────────────────────────────────────┐');
    console.log('│  GesCall Auto-Provisioning               │');
    console.log('└──────────────────────────────────────────┘');

    await provisionDatabase(pool);
    provisionDirectories();
    provisionAriConfig();
    provisionDialplan();

    console.log('✓ Provisioning complete\n');
}

// ──────────────────────────────────────────────────────
// Database Provisioning
// ──────────────────────────────────────────────────────

async function provisionDatabase(pool) {
    let created = 0;
    let existed = 0;

    for (const table of TABLES) {
        try {
            // Check if table exists
            const [rows] = await pool.execute(
                `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
                [table.name]
            );

            if (rows[0].cnt > 0) {
                existed++;
                continue;
            }

            // Create the table
            await pool.execute(table.sql);
            console.log(`  ✓ Created table: ${table.name}`);
            created++;
        } catch (err) {
            // Table might already exist with slightly different schema — that's OK
            if (err.code === 'ER_TABLE_EXISTS_ERROR') {
                existed++;
            } else {
                console.warn(`  ⚠ Table ${table.name}: ${err.message}`);
            }
        }
    }

    if (created > 0) {
        console.log(`  ✓ Database: ${created} tables created, ${existed} already existed`);
    } else {
        console.log(`  ✓ Database: all ${existed} tables OK`);
    }
}

// ──────────────────────────────────────────────────────
// Directory Provisioning
// ──────────────────────────────────────────────────────

function provisionDirectories() {
    let created = 0;

    for (const dir of DIRECTORIES) {
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                // Ensure Asterisk can read the files
                try {
                    execSync(`chown -R asterisk:asterisk ${dir} 2>/dev/null || true`);
                } catch { }
                console.log(`  ✓ Created directory: ${dir}`);
                created++;
            }
        } catch (err) {
            console.warn(`  ⚠ Directory ${dir}: ${err.message}`);
        }
    }

    if (created === 0) {
        console.log('  ✓ Directories: all OK');
    }
}

// ──────────────────────────────────────────────────────
// ARI Config Provisioning
// ──────────────────────────────────────────────────────

function provisionAriConfig() {
    try {
        let needsWrite = false;

        if (!fs.existsSync(ARI_CONF_PATH)) {
            needsWrite = true;
        } else {
            const current = fs.readFileSync(ARI_CONF_PATH, 'utf8');
            // Check if our user section exists
            if (!current.includes(`[${ARI_USER}]`)) {
                needsWrite = true;
            }
        }

        if (needsWrite) {
            fs.writeFileSync(ARI_CONF_PATH, ARI_CONF_CONTENT);
            console.log(`  ✓ ARI config: created/updated ${ARI_CONF_PATH}`);
            // Reload ARI module
            try {
                execSync('asterisk -rx "module reload res_ari.so" 2>/dev/null');
                console.log('  ✓ ARI module reloaded');
            } catch { }
        } else {
            console.log('  ✓ ARI config: OK');
        }
    } catch (err) {
        console.warn(`  ⚠ ARI config: ${err.message}`);
    }
}

// ──────────────────────────────────────────────────────
// Dialplan Provisioning
// ──────────────────────────────────────────────────────

function provisionDialplan() {
    try {
        // Ensure extensions-gescall.conf is included in extensions.conf
        let needsReload = false;

        if (fs.existsSync(EXTENSIONS_CONF)) {
            const extConf = fs.readFileSync(EXTENSIONS_CONF, 'utf8');
            if (!extConf.includes('extensions-gescall.conf')) {
                // Append include at the end
                fs.appendFileSync(EXTENSIONS_CONF, `\n${GESCALL_INCLUDE}\n`);
                console.log('  ✓ Dialplan: added #include extensions-gescall.conf');
                needsReload = true;
            }
        }

        // Create extensions-gescall.conf if it doesn't exist
        if (!fs.existsSync(GESCALL_CONF)) {
            const gescallDialplan = `; ============================================
; GesCall Custom Extensions
; Auto-generated by GesCall provisioning
; ============================================

; Stasis IVR entry point
[gescall-ivr]
exten => 8300,1,Answer()
 same => n,Wait(0.5)
 same => n,Stasis(gescall-ivr)
 same => n,Hangup()

; Piper TTS IVR context
[gescall-piper-ivr]
exten => s,1,AGI(agi-piper-ivr-dtmf.php)
 same => n,Hangup()

; Static audio playback context
[gescall-static-audio]
exten => s,1,AGI(agi-static-audio.php)
 same => n,Hangup()

; Playback mode switch (TTS vs Static)
[gescall-playback-switch]
exten => s,1,AGI(agi-playback-switch.php)
 same => n,Hangup()
`;
            fs.writeFileSync(GESCALL_CONF, gescallDialplan);
            console.log(`  ✓ Dialplan: created ${GESCALL_CONF}`);
            needsReload = true;
        } else {
            console.log('  ✓ Dialplan: OK');
        }

        if (needsReload) {
            try {
                execSync('asterisk -rx "dialplan reload" 2>/dev/null');
                console.log('  ✓ Dialplan reloaded');
            } catch { }
        }
    } catch (err) {
        console.warn(`  ⚠ Dialplan: ${err.message}`);
    }
}

module.exports = { run };
