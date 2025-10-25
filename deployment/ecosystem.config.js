/**
 * PM2 Production Configuration for Warehouse Management System
 * 
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production
 */

module.exports = {
  apps: [{
    name: 'warehouse',
    script: './dist/index.js',
    
    // Режим кластера для высокой доступности
    instances: 'max',  // Использовать все доступные CPU
    exec_mode: 'cluster',
    
    // Переменные окружения
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000,
      // DATABASE_URL и другие секреты берутся из .env файла
    },
    
    // Автоматический перезапуск при достижении лимита памяти
    max_memory_restart: '1G',
    
    // Логирование
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Автоматический перезапуск
    autorestart: true,
    
    // Задержка перед перезапуском после краша
    restart_delay: 4000,
    
    // Максимальное количество нестабильных перезапусков
    max_restarts: 10,
    min_uptime: '10s',
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Watch mode (отключен для production)
    watch: false,
    
    // Ignore watch (если watch включен)
    ignore_watch: [
      'node_modules',
      'logs',
      '.git',
      'client',
      '*.log'
    ],
    
    // Переменные окружения для разработки (не используется в production)
    env_development: {
      NODE_ENV: 'development',
      PORT: 5000,
    }
  }],
  
  // Deploy configuration (опционально для CI/CD)
  deploy: {
    production: {
      // SSH settings
      user: 'deploy',
      host: ['your-server-ip'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/warehouse.git',
      path: '/var/www/warehouse',
      
      // Post-deployment commands
      'post-deploy': 'npm install --production && npm run build && npm run db:push && pm2 reload ecosystem.config.js --env production',
      
      // Pre-deployment setup
      'pre-deploy-local': 'echo "Deploying to production..."',
      
      // SSH options
      ssh_options: 'StrictHostKeyChecking=no',
    }
  }
};
