module.exports = {
  apps: [{
    name: 'warehouse',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    // Переменные окружения из .env файла
    env_file: '.env',
    // Дополнительные переменные
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      HOST: '0.0.0.0'
    },
    // Автоматический перезапуск
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    // Логирование
    error_file: '/home/ruslan/.pm2/logs/warehouse-error.log',
    out_file: '/home/ruslan/.pm2/logs/warehouse-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Время на graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    // Задержка перед перезапуском при падении
    restart_delay: 1000,
    min_uptime: 5000,
    max_restarts: 10
  }]
};
