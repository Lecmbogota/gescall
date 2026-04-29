CREATE TABLE gescall_users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'AGENT', -- 'ADMIN', 'AGENT', 'MANAGER'
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gescall_campaigns (
    campaign_id VARCHAR(50) PRIMARY KEY,
    campaign_name VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    dial_method VARCHAR(20) DEFAULT 'RATIO',
    auto_dial_level DECIMAL(5,2) DEFAULT 1.0,
    dial_prefix VARCHAR(10) DEFAULT '',
    campaign_cid VARCHAR(20) DEFAULT '0000000000',
    xferconf_c_number VARCHAR(50) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gescall_lists (
    list_id BIGINT PRIMARY KEY,
    list_name VARCHAR(100) NOT NULL,
    campaign_id VARCHAR(50) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES gescall_campaigns(campaign_id) ON DELETE CASCADE
);

CREATE TABLE gescall_leads (
    lead_id BIGSERIAL PRIMARY KEY,
    list_id BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'NEW',  -- NEW, QUEUE, DIALING, RINGING, ANSWER, BUSY, NOANSWER, FAILED, COMPLETED
    phone_number VARCHAR(20) NOT NULL,
    vendor_lead_code VARCHAR(100),
    called_count INT DEFAULT 0,
    last_call_time TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES gescall_lists(list_id) ON DELETE CASCADE
);

CREATE TABLE gescall_call_log (
    log_id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT NOT NULL,
    campaign_id VARCHAR(50) NOT NULL,
    list_id BIGINT NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    call_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    call_status VARCHAR(20) NOT NULL,
    call_duration INT DEFAULT 0,
    dtmf_pressed VARCHAR(50) DEFAULT '',
    transferred_to VARCHAR(100) DEFAULT ''
);

-- Insert a default admin user ('TEcnologia2020' hash placeholder)
INSERT INTO gescall_users (username, password_hash, role) VALUES ('admin', 'placeholder_hash', 'ADMIN');
