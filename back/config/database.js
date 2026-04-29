const mysql = require('mysql2/promise');

class Database {
  constructor() {
    this.pool = null;
    this.connectionAttempts = 0;
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 segundos
  }

  async connect(retryCount = 0) {
    if (this.pool) {
      // Verificar si el pool sigue activo
      try {
        const testConnection = await this.pool.getConnection();
        testConnection.release();
        return this.pool;
      } catch (error) {
        // El pool está inactivo, recrearlo
        console.warn('[Database] Pool inactivo, recreando conexión...');
        this.pool = null;
      }
    }

    const dbHost = process.env.DB_HOST || '209.38.233.46';
    const dbPort = process.env.DB_PORT || 3306;
    const dbUser = process.env.DB_USER || 'cron';
    const dbName = process.env.DB_NAME || 'asterisk';

    try {
      console.log(`[Database] Intentando conectar a MySQL... (Intento ${retryCount + 1}/${this.maxRetries + 1})`);
      console.log(`[Database] Host: ${dbHost}:${dbPort}`);
      console.log(`[Database] Usuario: ${dbUser}`);
      console.log(`[Database] Base de datos: ${dbName}`);

      this.pool = mysql.createPool({
        host: dbHost,
        port: parseInt(dbPort),
        user: dbUser,
        password: process.env.DB_PASSWORD || 'test',
        database: dbName,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        connectTimeout: 10000 // 10 segundos timeout
      });

      // Test connection con timeout
      const connection = await Promise.race([
        this.pool.getConnection(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout de conexión después de 10 segundos')), 10000)
        )
      ]);

      console.log('✓ Database connected successfully');
      connection.release();
      this.connectionAttempts = 0; // Reset contador en éxito

      return this.pool;
    } catch (error) {
      this.connectionAttempts++;
      const errorMessage = error.message || 'Error desconocido';
      const errorCode = error.code || 'UNKNOWN';

      console.error('✗ Database connection error:', errorMessage);
      console.error('✗ Error code:', errorCode);

      // Mensajes de error más descriptivos
      if (errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
        console.error('✗ La conexión fue rechazada. Posibles causas:');
        console.error('  - El servidor MySQL no está corriendo');
        console.error('  - El firewall está bloqueando la conexión');
        console.error('  - MySQL no está configurado para aceptar conexiones remotas');
        console.error('  - La IP o puerto son incorrectos');
        console.error(`  - Verificar conectividad: mysql -h ${dbHost} -P ${dbPort} -u ${dbUser} -p`);
      } else if (errorCode === 'ETIMEDOUT' || errorMessage.includes('timeout')) {
        console.error('✗ Timeout de conexión. El servidor no responde.');
      } else if (errorCode === 'ER_ACCESS_DENIED_ERROR' || errorMessage.includes('Access denied')) {
        console.error('✗ Acceso denegado. Verificar usuario y contraseña.');
      }

      // Reintentar si no hemos alcanzado el máximo
      if (retryCount < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, retryCount); // Backoff exponencial
        console.log(`[Database] Reintentando en ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connect(retryCount + 1);
      }

      // Si llegamos aquí, todos los reintentos fallaron
      console.error('✗ Todos los intentos de conexión fallaron');
      throw new Error(`MySQL connect ERROR: ${errorMessage}`);
    }
  }

  async query(sql, params = []) {
    try {
      if (!this.pool) {
        await this.connect();
      }

      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      const errorCode = error.code || 'UNKNOWN';
      const errorMessage = error.message || 'Error desconocido';

      // Si es un error de conexión, intentar reconectar
      if (errorCode === 'PROTOCOL_CONNECTION_LOST' ||
        errorCode === 'ECONNREFUSED' ||
        errorMessage.includes('Connection lost') ||
        errorMessage.includes('ECONNREFUSED')) {
        console.warn('[Database] Conexión perdida, intentando reconectar...');
        this.pool = null; // Forzar recreación del pool
        try {
          await this.connect();
          // Reintentar la query después de reconectar
          const [rows] = await this.pool.execute(sql, params);
          return rows;
        } catch (reconnectError) {
          console.error('[Database] Error al reconectar:', reconnectError.message);
          throw new Error(`MySQL connect ERROR: ${reconnectError.message}`);
        }
      }

      console.error('[Database] Query error:', errorMessage);
      console.error('[Database] Error code:', errorCode);
      console.error('[Database] SQL:', sql.substring(0, 200));
      console.error('[Database] Params:', params);
      throw error;
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('Database connection closed');
    }
  }
}

// Singleton instance
const database = new Database();

module.exports = database;
