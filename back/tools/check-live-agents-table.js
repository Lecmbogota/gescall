require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkTable() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || '209.38.233.46',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'cron',
      password: process.env.DB_PASSWORD || '1234',
      database: process.env.DB_NAME || 'asterisk'
    });

    console.log('Checking vicidial_live_agents table structure...\n');

    // Get table structure
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vicidial_live_agents'
      ORDER BY ORDINAL_POSITION
    `, [process.env.DB_NAME || 'asterisk']);

    console.log('Columns in vicidial_live_agents:');
    columns.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
    });

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkTable();
