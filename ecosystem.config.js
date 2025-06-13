module.exports = {
  apps: [{
    name: 'auto-clock-in',
    script: 'lib/scripts/auto-clock-in.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    env_development: {
      NODE_ENV: 'development'
    },
    log_file: 'logs/auto-clock-in.log',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '30s'
  }]
}