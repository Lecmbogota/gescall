-- GesCall Call Log Table
-- Custom CDR-like table for call reporting with correct pool CallerID
-- This table is managed by GesCall AGI scripts, not by Vicidial

CREATE TABLE IF NOT EXISTS gescall_call_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    lead_id INT(9) UNSIGNED NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    pool_callerid VARCHAR(20) DEFAULT NULL COMMENT 'CallerID from our pool (the one shown to the customer)',
    original_callerid VARCHAR(30) DEFAULT NULL COMMENT 'Original Vicidial callerid (V108...)',
    campaign_id VARCHAR(20) NOT NULL,
    list_id BIGINT UNSIGNED DEFAULT NULL,
    call_date DATETIME NOT NULL,
    call_status ENUM('DIALING', 'RINGING', 'ANSWER', 'HANGUP', 'CANCEL', 'FAILED') DEFAULT 'DIALING',
    dtmf_pressed VARCHAR(10) DEFAULT NULL COMMENT 'DTMF pressed by the customer',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;
