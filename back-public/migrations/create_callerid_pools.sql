-- CallerID Local Presence Tables for GesCall
-- This migration creates tables for managing CallerID pools and campaign rotation settings

-- ============================================
-- Table: CallerID Pools
-- ============================================
CREATE TABLE IF NOT EXISTS gescall_callerid_pools (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    country_code CHAR(2) DEFAULT 'CO' COMMENT 'CO=Colombia, MX=Mexico, US=United States',
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: CallerID Pool Numbers
-- ============================================
CREATE TABLE IF NOT EXISTS gescall_callerid_pool_numbers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pool_id INT NOT NULL,
    callerid VARCHAR(20) NOT NULL COMMENT 'Full CallerID number',
    area_code CHAR(3) NOT NULL COMMENT 'First 3 digits (LADA/NPA)',
    is_active TINYINT(1) DEFAULT 1,
    last_used_at DATETIME NULL,
    use_count INT DEFAULT 0,
    rr_order INT DEFAULT 0 COMMENT 'Round-robin order counter',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pool_id) REFERENCES gescall_callerid_pools(id) ON DELETE CASCADE,
    UNIQUE KEY idx_pool_callerid (pool_id, callerid),
    INDEX idx_selection (pool_id, area_code, is_active, rr_order),
    INDEX idx_area_code (area_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: Campaign CallerID Settings
-- ============================================
CREATE TABLE IF NOT EXISTS gescall_campaign_callerid_settings (
    campaign_id VARCHAR(20) PRIMARY KEY COMMENT 'Vicidial campaign_id',
    rotation_mode ENUM('OFF', 'POOL') DEFAULT 'OFF',
    pool_id INT NULL,
    match_mode ENUM('LEAD', 'FIXED') DEFAULT 'LEAD' COMMENT 'LEAD=match lead phone prefix, FIXED=use fixed_area_code',
    fixed_area_code CHAR(3) NULL,
    fallback_callerid VARCHAR(20) NULL,
    selection_strategy ENUM('ROUND_ROBIN', 'RANDOM', 'LRU') DEFAULT 'ROUND_ROBIN',
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (pool_id) REFERENCES gescall_callerid_pools(id) ON DELETE SET NULL,
    INDEX idx_pool (pool_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: CallerID Usage Log
-- ============================================
CREATE TABLE IF NOT EXISTS gescall_callerid_usage_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    campaign_id VARCHAR(20),
    lead_id INT NULL,
    phone_number VARCHAR(20) COMMENT 'Lead phone number dialed',
    callerid_used VARCHAR(20),
    area_code_target CHAR(3),
    pool_id INT NULL,
    selection_result ENUM('MATCHED', 'FALLBACK', 'DEFAULT') COMMENT 'How the CallerID was selected',
    strategy ENUM('ROUND_ROBIN', 'RANDOM', 'LRU') NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_campaign_date (campaign_id, created_at),
    INDEX idx_callerid (callerid_used),
    INDEX idx_date (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
