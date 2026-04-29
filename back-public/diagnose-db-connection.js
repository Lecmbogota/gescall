#!/usr/bin/env node

/**
 * Script de diagnóstico para verificar la conexión a MySQL
 * Uso: node diagnose-db-connection.js
 */

const mysql = require('mysql2/promise');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const dbConfig = {
  host: process.env.DB_HOST || '209.38.233.46',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'cron',
  password: process.env.DB_PASSWORD || 'test',
  database: process.env.DB_NAME || 'asterisk',
};

async function checkNetworkConnectivity(host, port) {
  console.log(`\n[1] Verificando conectividad de red a ${host}:${port}...`);
  
  try {
    // Intentar con netcat si está disponible
    try {
      const { stdout, stderr } = await execAsync(`timeout 3 bash -c '</dev/tcp/${host}/${port}' 2>&1 || echo "FAILED"`);
      if (stdout.includes('FAILED') || stderr) {
        console.log(`   ✗ No se puede conectar a ${host}:${port}`);
        console.log(`   Posibles causas:`);
        console.log(`   - El servidor MySQL no está corriendo`);
        console.log(`   - El firewall está bloqueando el puerto ${port}`);
        console.log(`   - La IP ${host} no es accesible desde este servidor`);
        return false;
      } else {
        console.log(`   ✓ El puerto ${port} está abierto en ${host}`);
        return true;
      }
    } catch (error) {
      console.log(`   ⚠ No se pudo verificar con bash, intentando conexión directa...`);
    }
  } catch (error) {
    console.log(`   ⚠ Error al verificar conectividad: ${error.message}`);
  }
  
  return null; // No se pudo determinar
}

async function checkLocalMySQL() {
  console.log(`\n[2] Verificando servidor MySQL local...`);
  
  try {
    const { stdout } = await execAsync('ss -tlnp | grep 3306 || netstat -tlnp 2>/dev/null | grep 3306 || echo "NOT_FOUND"');
    if (stdout.includes('NOT_FOUND') || !stdout.trim()) {
      console.log(`   ✗ No se encontró MySQL escuchando en el puerto 3306 localmente`);
      return false;
    } else {
      console.log(`   ✓ MySQL está escuchando localmente:`);
      console.log(`   ${stdout.trim()}`);
      return true;
    }
  } catch (error) {
    console.log(`   ⚠ Error al verificar MySQL local: ${error.message}`);
    return null;
  }
}

async function testMySQLConnection() {
  console.log(`\n[3] Intentando conectar a MySQL...`);
  console.log(`   Host: ${dbConfig.host}`);
  console.log(`   Port: ${dbConfig.port}`);
  console.log(`   User: ${dbConfig.user}`);
  console.log(`   Database: ${dbConfig.database}`);
  
  let connection = null;
  try {
    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      connectTimeout: 10000,
    });

    console.log(`   ✓ Conexión exitosa!`);
    
    // Probar una query simple
    const [rows] = await connection.execute('SELECT VERSION() as version, DATABASE() as db_name, USER() as user');
    console.log(`   ✓ Query de prueba exitosa:`);
    console.log(`     - Versión MySQL: ${rows[0].version}`);
    console.log(`     - Base de datos: ${rows[0].db_name}`);
    console.log(`     - Usuario: ${rows[0].user}`);
    
    await connection.end();
    return true;
  } catch (error) {
    console.log(`   ✗ Error de conexión: ${error.message}`);
    console.log(`   ✗ Código de error: ${error.code || 'UNKNOWN'}`);
    
    if (error.code === 'ECONNREFUSED') {
      console.log(`\n   Diagnóstico:`);
      console.log(`   - La conexión fue rechazada`);
      console.log(`   - Verificar que MySQL esté corriendo en ${dbConfig.host}:${dbConfig.port}`);
      console.log(`   - Verificar configuración de bind-address en MySQL`);
      console.log(`   - Verificar reglas de firewall`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log(`\n   Diagnóstico:`);
      console.log(`   - Timeout de conexión`);
      console.log(`   - El servidor no responde en ${dbConfig.host}:${dbConfig.port}`);
      console.log(`   - Verificar conectividad de red`);
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log(`\n   Diagnóstico:`);
      console.log(`   - Acceso denegado`);
      console.log(`   - Verificar usuario y contraseña`);
      console.log(`   - Verificar permisos del usuario en MySQL`);
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.log(`\n   Diagnóstico:`);
      console.log(`   - La base de datos '${dbConfig.database}' no existe`);
    }
    
    if (connection) {
      await connection.end().catch(() => {});
    }
    return false;
  }
}

async function checkEnvironmentVariables() {
  console.log(`\n[4] Verificando variables de entorno...`);
  
  const vars = {
    'DB_HOST': process.env.DB_HOST || '(usando valor por defecto: 209.38.233.46)',
    'DB_PORT': process.env.DB_PORT || '(usando valor por defecto: 3306)',
    'DB_USER': process.env.DB_USER || '(usando valor por defecto: cron)',
    'DB_NAME': process.env.DB_NAME || '(usando valor por defecto: asterisk)',
    'DB_PASSWORD': process.env.DB_PASSWORD ? '***configurado***' : '(usando valor por defecto: test)',
  };
  
  Object.entries(vars).forEach(([key, value]) => {
    console.log(`   ${key}: ${value}`);
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Diagnóstico de Conexión a MySQL');
  console.log('═══════════════════════════════════════════════════════════');
  
  await checkEnvironmentVariables();
  await checkLocalMySQL();
  await checkNetworkConnectivity(dbConfig.host, dbConfig.port);
  const connectionSuccess = await testMySQLConnection();
  
  console.log('\n═══════════════════════════════════════════════════════════');
  if (connectionSuccess) {
    console.log('  ✓ DIAGNÓSTICO COMPLETO: La conexión funciona correctamente');
    process.exit(0);
  } else {
    console.log('  ✗ DIAGNÓSTICO COMPLETO: Hay problemas con la conexión');
    console.log('\n  Recomendaciones:');
    console.log('  1. Verificar que MySQL esté corriendo en el servidor remoto');
    console.log('  2. Verificar configuración de bind-address en /etc/mysql/my.cnf');
    console.log('  3. Verificar reglas de firewall (iptables, ufw, etc.)');
    console.log('  4. Verificar que el usuario tenga permisos para conectarse remotamente');
    console.log('  5. Considerar usar localhost si MySQL está en el mismo servidor');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n✗ Error fatal:', error);
  process.exit(1);
});
