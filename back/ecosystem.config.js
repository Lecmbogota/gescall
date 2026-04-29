module.exports = {
  apps: [
    {
      name: 'vicidial-backend',
      script: './server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '3G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      node_args: "--max-old-space-size=4096",
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Configuración para manejo de errores
      min_uptime: '10s',
      max_restarts: 10,
      // Configuración de reinicio automático
      cron_restart: '0 3 * * *', // Reinicia a las 3 AM todos los días
      // Variables de entorno adicionales si las necesitas
      instance_var: 'INSTANCE_ID',
    },
    {
      name: 'gescall-public-api',
      script: '/opt/gescall/back-public/public-server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PUBLIC_API_PORT: 3002,
      },
      error_file: '/opt/gescall/back-public/logs/pm2-public-error.log',
      out_file: '/opt/gescall/back-public/logs/pm2-public-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      cron_restart: '0 4 * * *',
      instance_var: 'PUBLIC_INSTANCE_ID',
    },
  ],
};
