CREATE TABLE IF NOT EXISTS gescall_schedules (
    id SERIAL PRIMARY KEY,
    schedule_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(50) NOT NULL,
    target_name VARCHAR(100),
    action VARCHAR(20) NOT NULL,
    scheduled_at TIMESTAMP NOT NULL,
    end_at TIMESTAMP,
    recurring VARCHAR(20) DEFAULT 'none',
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gescall_dnc (
    phone_number VARCHAR(20) PRIMARY KEY,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gescall_whitelist_prefixes (
    id SERIAL PRIMARY KEY,
    prefix VARCHAR(10) NOT NULL UNIQUE,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gescall_callerid_pools (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    country_code VARCHAR(10) DEFAULT 'CO',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gescall_callerid_pool_numbers (
    id SERIAL PRIMARY KEY,
    pool_id INT NOT NULL REFERENCES gescall_callerid_pools(id) ON DELETE CASCADE,
    callerid VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pool_id, callerid)
);

CREATE TABLE IF NOT EXISTS gescall_campaign_callerid_settings (
    campaign_id VARCHAR(50) PRIMARY KEY REFERENCES gescall_campaigns(campaign_id) ON DELETE CASCADE,
    rotation_mode VARCHAR(20) DEFAULT 'OFF',
    pool_id INT REFERENCES gescall_callerid_pools(id) ON DELETE SET NULL,
    match_mode VARCHAR(20) DEFAULT 'LEAD',
    fixed_area_code VARCHAR(10),
    fallback_callerid VARCHAR(20),
    selection_strategy VARCHAR(20) DEFAULT 'ROUND_ROBIN',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gescall_callerid_logs (
    id SERIAL PRIMARY KEY,
    pool_id INT REFERENCES gescall_callerid_pools(id) ON DELETE SET NULL,
    callerid VARCHAR(20) NOT NULL,
    campaign_id VARCHAR(50) NOT NULL,
    lead_phone VARCHAR(20) NOT NULL,
    match_type VARCHAR(20) NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
