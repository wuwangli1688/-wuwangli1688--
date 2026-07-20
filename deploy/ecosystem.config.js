// ============================================
// 收支记账本 - PM2 进程管理配置
// 部署路径：/path/to/app/deploy/ecosystem.config.js
// 启动命令：pm2 start deploy/ecosystem.config.js
// ============================================

module.exports = {
  apps: [
    {
      name: "app-server",
      script: "pnpm",
      args: "run start",
      cwd: __dirname + "/../server",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 9091,
        HOST: "0.0.0.0",
      },
      // 日志配置
      error_file: "./logs/server-error.log",
      out_file: "./logs/server-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      // 自动重启配置
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};