#!/bin/bash
# 收支记账本 - 服务端一键部署脚本
# 在腾讯云服务器上运行此脚本
# 使用方法: bash deploy.sh
# 前置条件: 将项目代码上传到服务器后，在此脚本所在目录执行

set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${DOMAIN:-wuwanli.online}"

echo "=========================================="
echo "  收支记账本 - 服务端部署"
echo "  域名: $DOMAIN"
echo "  目录: $APP_DIR"
echo "=========================================="

# 1. 安装系统依赖
echo ""
echo "[1/7] 安装系统依赖..."
apt-get update -qq
apt-get install -y -qq nginx curl git

# 2. 安装 Node.js 24
echo ""
echo "[2/7] 安装 Node.js 24..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js $(node -v)"
echo "npm $(npm -v)"

# 安装 pnpm
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm
fi
echo "pnpm $(pnpm -v)"

# 安装 PM2
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi
echo "pm2 $(pm2 -v 2>/dev/null || echo '已安装')"

# 3. 配置环境变量
echo ""
echo "[3/7] 配置环境变量..."
cd "$APP_DIR/server"

if [ ! -f .env ]; then
  if [ -n "$COZE_SUPABASE_URL" ]; then
    cat > .env << EOF
COZE_SUPABASE_URL=$COZE_SUPABASE_URL
COZE_SUPABASE_ANON_KEY=$COZE_SUPABASE_ANON_KEY
COZE_SUPABASE_SERVICE_ROLE_KEY=$COZE_SUPABASE_SERVICE_ROLE_KEY
PORT=9091
HOST=0.0.0.0
NODE_ENV=production
FRONTEND_URL=https://$DOMAIN
EOF
    echo "环境变量已从系统环境变量自动生成"
  else
    echo "⚠️  未检测到环境变量，请手动编辑 server/.env 文件"
    echo "   参考模板: deploy/.env.production"
    if [ ! -f .env ]; then
      cp "$APP_DIR/deploy/.env.production" .env
      echo "   已复制模板，请编辑后重新运行本脚本"
    fi
  fi
else
  echo "环境变量文件已存在，跳过"
fi

# 4. 安装依赖
echo ""
echo "[4/7] 安装项目依赖..."
cd "$APP_DIR"
pnpm install

# 5. 构建后端
echo ""
echo "[5/7] 构建后端服务..."
cd "$APP_DIR/server"
pnpm run build
echo "后端构建完成"

# 6. 配置 Nginx
echo ""
echo "[6/7] 配置 Nginx..."
cat > /etc/nginx/sites-available/jizhang-app << 'NGINX_CONF'
server {
    listen 80;
    server_name __DOMAIN__;

    # 后端 API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:9091;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50m;
        proxy_read_timeout 120s;
    }

    # 前端静态文件（Web 版）
    location / {
        root /opt/jizhang-app/client/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
NGINX_CONF

# 替换域名占位符
sed -i "s/__DOMAIN__/$DOMAIN/g" /etc/nginx/sites-available/jizhang-app

# 启用站点
ln -sf /etc/nginx/sites-available/jizhang-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试配置
nginx -t && systemctl restart nginx
echo "Nginx 配置完成"

# 7. 启动后端服务（PM2）
echo ""
echo "[7/7] 启动后端服务..."
cd "$APP_DIR"

# 停止旧进程（如果有）
pm2 delete app-server 2>/dev/null || true

# 使用 PM2 配置启动
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup 2>/dev/null || true

echo ""
echo "=========================================="
echo "  ✅ 部署完成！"
echo "=========================================="
echo ""
echo "  后端 API:  https://$DOMAIN/api/v1/health"
echo "  管理命令:"
echo "    pm2 status           # 查看进程状态"
echo "    pm2 logs app-server  # 查看日志"
echo "    pm2 restart app-server  # 重启服务"
echo ""
echo "  ⚠️  下一步：配置 SSL 证书"
echo "    运行: sudo certbot --nginx -d $DOMAIN"
echo ""

# 检查服务状态
echo "检查服务状态..."
sleep 2
curl -s http://127.0.0.1:9091/api/v1/health && echo " - API 正常" || echo " - API 未响应"
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000 && echo " - 前端正常" || echo " - 前端未响应"