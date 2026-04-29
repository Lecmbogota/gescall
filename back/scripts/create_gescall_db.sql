CREATE DATABASE IF NOT EXISTS gescall_db;
USE gescall_db;

CREATE TABLE IF NOT EXISTS gescall_users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('ADMIN', 'AGENT', 'MANAGER') DEFAULT 'AGENT',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gescall_campaigns (
    campaign_id VARCHAR(50) PRIMARY KEY,
    campaign_name VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    dial_method ENUM('RATIO', 'MANUAL', 'INBOUND') DEFAULT 'RATIO',
    auto_dial_level DECIMAL(5,2) DEFAULT '1.0',
    dial_prefix VARCHAR(10) DEFAULT '',
    campaign_cid VARCHAR(20) DEFAULT '0000000000',
    xferconf_c_number VARCHAR(50) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gescall_lists (
    list_id BIGINT PRIMARY KEY,
    list_name VARCHAR(100) NOT NULL,
    campaign_id VARCHAR(50) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES gescall_campaigns(campaign_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gescall_leads (
    lead_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    list_id BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'NEW',  -- NEW, QUEUE, DIALING, RINGING, ANSWER, BUSY, NOANSWER, FAILED, COMPLETED
    phone_number VARCHAR(20) NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    vendor_lead_code VARCHAR(100),
    state VARCHAR(50),
    alt_phone VARCHAR(20),
    comments TEXT,
    called_count INT DEFAULT 0,
    last_call_time TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES gescall_lists(list_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gescall_call_log (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
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

-- Insert a default admin user (password is default 'TEcnologia2020' hashed as raw for now, backend will update)
-- For simplicity, let's insert a plaintext one if the backend auth handles it or we can insert an MD5/Bcrypt
