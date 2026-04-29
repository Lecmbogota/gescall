require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
  console.log('Testing database connection...\n');
  console.log('Configuration:');
  console.log('  Host:', process.env.DB_HOST || '209.38.233.46');
  console.log('  Port:', process.env.DB_PORT || 3306);
  console.log('  User:', process.env.DB_USER || 'cron');
  console.log('  Database:', process.env.DB_NAME || 'asterisk');
  console.log();

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || '209.38.233.46',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'cron',
      password: process.env.DB_PASSWORD || 'test',
      database: process.env.DB_NAME || 'asterisk'
    });

    console.log('✓ Connection successful!');

    // Test a simple query
    const [rows] = await connection.execute('SELECT VERSION() as version, DATABASE() as db_name, USER() as user');
    console.log('\nDatabase Info:');
    console.log('  Version:', rows[0].version);
    console.log('  Database:', rows[0].db_name);
    console.log('  Connected as:', rows[0].user);

    // Test tables access
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      LIMIT 5
    `, [process.env.DB_NAME || 'asterisk']);

    console.log('\nSample tables:');
    tables.forEach(table => {
      console.log('  -', table.TABLE_NAME);
    });

    // Test vicidial tables
    const [viciTables] = await connection.execute(`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME LIKE 'vicidial%'
      LIMIT 10
    `, [process.env.DB_NAME || 'asterisk']);

    console.log('\nVicidial tables:');
    viciTables.forEach(table => {
      console.log('  -', table.TABLE_NAME);
    });

    await connection.end();
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Connection failed!');
    console.error('Error:', error.message);
    console.error('\nPossible solutions:');
    console.error('  1. Verify database credentials are correct');
    console.error('  2. Check if user has remote access permissions');
    console.error('  3. Verify firewall allows connections from your IP');
    console.error('  4. Run this on the database server: GRANT ALL ON asterisk.* TO \'cron\'@\'%\' IDENTIFIED BY \'test\';');
    process.exit(1);
  }
}

testConnection();
