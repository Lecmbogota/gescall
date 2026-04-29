-- CallerID Pools Migration for PostgreSQL
CREATE TABLE IF NOT EXISTS gescall_callerid_pools (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255),
    country_code CHAR(2) DEFAULT 'CO',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gescall_callerid_pool_numbers (
    id SERIAL PRIMARY KEY,
    pool_id INT NOT NULL REFERENCES gescall_callerid_pools(id) ON DELETE CASCADE,
    callerid VARCHAR(20) NOT NULL,
    area_code CHAR(3) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP NULL,
    use_count INT DEFAULT 0,
    rr_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pool_id, callerid)
);
CREATE INDEX IF NOT EXISTS idx_pool_selection ON gescall_callerid_pool_numbers(pool_id, area_code, is_active, rr_order);
CREATE INDEX IF NOT EXISTS idx_area_code ON gescall_callerid_pool_numbers(area_code);

CREATE TABLE IF NOT EXISTS gescall_campaign_callerid_settings (
    campaign_id VARCHAR(50) PRIMARY KEY,
    rotation_mode VARCHAR(10) DEFAULT 'OFF',
    pool_id INT NULL REFERENCES gescall_callerid_pools(id) ON DELETE SET NULL,
    match_mode VARCHAR(10) DEFAULT 'LEAD',
    fixed_area_code CHAR(3) NULL,
    fallback_callerid VARCHAR(20) NULL,
    selection_strategy VARCHAR(20) DEFAULT 'ROUND_ROBIN',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gescall_callerid_usage_log (
    id BIGSERIAL PRIMARY KEY,
    campaign_id VARCHAR(50),
    lead_id INT NULL,
    phone_number VARCHAR(20),
    callerid_used VARCHAR(20),
    area_code_target CHAR(3),
    pool_id INT NULL,
    selection_result VARCHAR(20),
    strategy VARCHAR(20) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cid_log_campaign_date ON gescall_callerid_usage_log(campaign_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cid_log_callerid ON gescall_callerid_usage_log(callerid_used);
