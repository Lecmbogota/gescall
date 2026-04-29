-- gescall_trunks table for SIP/PJSIP trunk management
CREATE TABLE gescall_trunks (
    trunk_id VARCHAR(50) PRIMARY KEY,
    trunk_name VARCHAR(100) NOT NULL,
    provider_host VARCHAR(100) NOT NULL,
    provider_port INT DEFAULT 5060,
    auth_user VARCHAR(100),
    auth_password VARCHAR(255),
    registration BOOLEAN DEFAULT true,
    max_channels INT DEFAULT 50,
    dial_prefix VARCHAR(10),
    codecs VARCHAR(100) DEFAULT 'ulaw,alaw',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
