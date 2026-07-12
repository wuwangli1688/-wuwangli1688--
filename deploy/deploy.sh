#!/bin/bash
# 记账助手 - 服务端部署脚本
# 在服务器上运行此脚本
# 使用方法: bash deploy.sh

set -e

echo "=========================================="
echo "  记账助手 - 服务端部署"
echo "=========================================="

# 配置
DOMAIN="wuwanli.online"
APP_DIR="/opt/jizhang-app"
NODE_VERSION="24"

# 1. 安装依赖
echo "[1/6] 安装系统依赖..."
apt-get update -qq
apt-get install -y -qq nginx curl git

# 2. 安装 Node.js
echo "[2/6] 安装 Node.js $NODE_VERSION..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi
# 安装 pnpm
npm install -g pnpm

# 3. 创建项目目录
echo "[3/6] 创建项目目录..."
mkdir -p $APP_DIR
cd $APP_DIR

# 4. 上传代码
echo "[4/6] 代码上传..."
echo "请将项目代码上传到 $APP_DIR 目录"
echo "可以使用 scp 命令上传:"
echo "  scp -r /path/to/project/* root@$DOMAIN:$APP_DIR/"
echo ""

# 5. 安装依赖并构建
echo "[5/6] 安装依赖并构建..."
cd $APP_DIR

# 安装后端依赖
cd server
pnpm install
# 构建后端
node build.js
cd ..

# 构建前端
cd client
pnpm install
EXPO_PUBLIC_BACKEND_BASE_URL=https://$DOMAIN/api npx expo export --platform web
cd ..

# 6. 配置 Nginx
echo "[6/6] 配置 Nginx..."
cat > /etc/nginx/sites-available/jizhang-app << 'NGINX_CONF'
server {
    listen 80;
    server_name wuwanli.online;

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
    }

    # 前端静态文件
    location / {
        root /opt/jizhang-app/client/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/jizhang-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo "=========================================="
echo "  部署完成！"
echo "  前端: https://$DOMAIN"
echo "  后端: https://$DOMAIN/api/v1/health"
echo "=========================================="
echo ""
echo "下一步：配置 SSL 证书"
echo "运行: certbot --nginx -d $DOMAIN"
echo ""
echo "启动后端服务:"
echo "  cd $APP_DIR/server"
echo "  npm install -g pm2"
echo "  PORT=9091 EXPO_PUBLIC_BACKEND_BASE_URL=https://$DOMAIN/api pm2 start dist/index.js --name jizhang-api"
echo "  pm2 save"