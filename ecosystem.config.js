module.exports = {
  apps: [
    {
      name: 'gescall-backend',
      script: 'server.js',
      cwd: '/opt/gescall/back',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: '/opt/gescall/back/logs/pm2-error.log',
      out_file: '/opt/gescall/back/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10
    },
    {
      name: 'gescall-dialer',
      script: './gescall-dialer',
      cwd: '/opt/gescall/dialer-go',
      instances: 1,
      autorestart: true,
      watch: false,
      error_file: '/opt/gescall/dialer-go/logs/pm2-error.log',
      out_file: '/opt/gescall/dialer-go/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10
    }
  ]
};
