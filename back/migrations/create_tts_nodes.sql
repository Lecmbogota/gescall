-- Migration for creating GesCall TTS Nodes table (PostgreSQL)
CREATE TABLE IF NOT EXISTS gescall_tts_nodes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    url VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert a default node using the current configuration
INSERT INTO gescall_tts_nodes (name, url, is_active) 
VALUES ('Default Piper TTS', 'http://69.30.85.181:22033/tts', true)
ON CONFLICT DO NOTHING;
