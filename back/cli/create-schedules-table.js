require('dotenv').config();
const db = require('./services/databaseService');

async function createSchedulesTable() {
    console.log('Creating gescall_schedules table...');

    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS gescall_schedules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            schedule_type ENUM('list', 'campaign') NOT NULL,
            target_id VARCHAR(50) NOT NULL,
            target_name VARCHAR(255),
            action ENUM('activate', 'deactivate') NOT NULL,
            scheduled_at DATETIME NOT NULL,
            end_at DATETIME NULL,
            executed BOOLEAN DEFAULT FALSE,
            executed_at DATETIME NULL,
            recurring ENUM('none', 'daily', 'weekly', 'monthly') DEFAULT 'none',
            created_by VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_scheduled_at (scheduled_at),
            INDEX idx_executed (executed),
            INDEX idx_type_target (schedule_type, target_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    try {
        await db.executeQuery(createTableSQL);
        console.log('✓ Table gescall_schedules created successfully');

        // Verify
        const tables = await db.executeQuery("SHOW TABLES LIKE 'gescall_schedules'");
        console.log('Verification:', tables);

        // Show structure
        const structure = await db.executeQuery("DESCRIBE gescall_schedules");
        console.table(structure);

    } catch (error) {
        console.error('Error creating table:', error.message);
    }

    process.exit(0);
}

createSchedulesTable();
