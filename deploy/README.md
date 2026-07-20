# 收支记账本 - 腾讯云部署指南

> 本文档基于腾讯云 CVM（云服务器）环境，指导你完成从零到上线的完整部署流程。

---

## 目录

1. [购买服务器](#1-购买服务器)
2. [环境初始化](#2-环境初始化)
3. [创建数据库](#3-创建数据库)
4. [上传代码](#4-上传代码)
5. [配置环境变量](#5-配置环境变量)
6. [安装依赖与构建](#6-安装依赖与构建)
7. [配置 Nginx + HTTPS](#7-配置-nginx--https)
8. [启动服务](#8-启动服务)
9. [前端打包上架](#9-前端打包上架)
10. [日常维护](#10-日常维护)

---

## 1. 购买服务器

### 腾讯云 CVM 推荐配置

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| **机型** | 轻量应用服务器 或 标准型 SA2 | 轻量服务器性价比更高 |
| **CPU** | 2核 | 够用 |
| **内存** | 4GB | 建议 4GB，2GB 勉强可跑 |
| **系统盘** | 40GB SSD | 足够 |
| **带宽** | 5Mbps | 按量或包月均可 |
| **操作系统** | Ubuntu 22.04 LTS 或 CentOS 7.9+ | 推荐 Ubuntu |
| **地域** | 离你最近的节点 | 如华南选广州，华东选上海 |

### 购买入口
- 腾讯云官网 → 云服务器 → 立即购买
- 建议选择 **轻量应用服务器**（2核4G 5M带宽约 50元/月）

### 安全组配置（重要）
购买后，在"安全组"中放行以下端口：

| 端口 | 用途 |
|------|------|
| 22 | SSH 连接 |
| 80 | HTTP（用于申请证书） |
| 443 | HTTPS |
| 9091 | 后端 API（可选，通过 Nginx 反向代理可不开放） |

---

## 2. 环境初始化

SSH 登录到服务器后，执行以下命令完成初始化：

### 2.1 安装基础工具

```bash
# Ubuntu
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget nginx

# 或 CentOS
# sudo yum update -y
# sudo yum install -y git curl wget nginx
```

### 2.2 安装 Node.js（推荐 24.x）

```bash
# 使用 NodeSource 安装
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# 验证
node -v   # 应输出 v24.x.x
npm -v    # 应输出 10.x.x
```

### 2.3 安装 pnpm

```bash
npm install -g pnpm
pnpm -v   # 应输出 9.x.x
```

### 2.4 安装 PM2（进程管理）

```bash
npm install -g pm2
pm2 -v    # 应输出 5.x.x
```

---

## 3. 创建数据库

### 方案 A：使用 Supabase 云服务（推荐）

1. 访问 [supabase.com](https://supabase.com) 注册账号
2. 点击 **New Project**，填写项目名称，设置数据库密码
3. 选择离你最近的云区域（如新加坡）
4. 创建完成后，在 **Project Settings → Database** 中获取连接信息

### 方案 B：使用腾讯云 PostgreSQL

1. 腾讯云控制台 → 云数据库 PostgreSQL → 创建实例
2. 创建后获取内网连接地址
3. 用 pgAdmin 或命令行连接后执行建表 SQL

### 建表

将 `deploy/schema.sql` 中的 SQL 语句在数据库中执行：

```bash
# 如果使用 Supabase，在 Supabase 控制台 → SQL Editor 中粘贴执行
# 如果使用 PostgreSQL，用 psql 执行
psql -h 你的数据库地址 -U 用户名 -d 数据库名 -f deploy/schema.sql
```

---

## 4. 上传代码

### 方式一：通过 Git（推荐）

```bash
# 在服务器上
cd /opt
git clone 你的代码仓库地址 app
cd app
```

### 方式二：通过 SCP 上传

```bash
# 在本地电脑上
scp -r /path/to/project 用户名@服务器IP:/opt/app
```

---

## 5. 配置环境变量

```bash
cd /opt/app/server

# 复制环境变量模板
cp ../deploy/.env.production .env

# 编辑配置
vim .env
```

将 `.env` 中的以下内容替换为实际值：

```ini
# 替换为你的 Supabase 项目信息
COZE_SUPABASE_URL=https://你的项目ID.supabase.co
COZE_SUPABASE_ANON_KEY=你的匿名密钥
COZE_SUPABASE_SERVICE_ROLE_KEY=你的服务角色密钥

# 替换为你的域名
FRONTEND_URL=https://你的域名.com
```

---

## 6. 安装依赖与构建

```bash
cd /opt/app

# 安装所有依赖
pnpm install

# 构建后端
cd server && pnpm run build && cd ..

# 验证构建产物
ls -la server/dist/   # 应包含 index.js
```

---

## 7. 配置 Nginx + HTTPS

### 7.1 配置 Nginx

```bash
# 复制 Nginx 配置文件
sudo cp deploy/nginx.conf /etc/nginx/conf.d/app.conf

# 编辑配置文件，替换 YOUR_DOMAIN 为你的备案域名
sudo vim /etc/nginx/conf.d/app.conf
```

### 7.2 申请 SSL 证书（腾讯云免费）

**方式一：腾讯云 SSL 证书控制台**
1. 腾讯云控制台 → SSL 证书 → 申请免费证书
2. 填写你的域名，完成 DNS 验证
3. 下载 Nginx 版本的证书文件
4. 上传到服务器：

```bash
# 在服务器上创建证书目录
sudo mkdir -p /etc/nginx/ssl

# 上传证书文件（pem 和 key）
# 将下载的证书文件上传到 /etc/nginx/ssl/ 目录下
```

**方式二：使用 Certbot（自动申请）**

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 申请证书（会自动修改 Nginx 配置）
sudo certbot --nginx -d 你的域名.com

# 证书自动续期
sudo certbot renew --dry-run
```

### 7.3 测试 Nginx 配置

```bash
sudo nginx -t                    # 测试配置是否正确
sudo systemctl restart nginx     # 重启 Nginx
```

---

## 8. 启动服务

### 8.1 启动后端服务（PM2）

```bash
cd /opt/app

# 启动
pm2 start deploy/ecosystem.config.js

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status
pm2 logs app-server            # 查看实时日志
```

### 8.2 验证服务是否正常

```bash
# 测试后端 API
curl http://127.0.0.1:9091/api/v1/health

# 测试前端页面
curl -I http://127.0.0.1:5000

# 通过域名访问
curl https://你的域名.com/api/v1/health
```

### 8.3 PM2 常用命令

```bash
pm2 status               # 查看所有进程状态
pm2 logs app-server      # 查看日志
pm2 restart app-server   # 重启
pm2 stop app-server      # 停止
pm2 delete app-server    # 删除进程
```

---

## 9. 前端打包上架

### 9.1 修改后端地址

在 `client/app.config.ts` 中，将 `EXPO_PUBLIC_BACKEND_BASE_URL` 改为你的线上域名：

```typescript
EXPO_PUBLIC_BACKEND_BASE_URL: "https://你的域名.com"
```

### 9.2 打包 Android APK

```bash
cd client

# 安装 EAS CLI
npm install -g eas-cli

# 登录 Expo 账号
eas login

# 配置构建（首次需配置 eas.json）
eas build --platform android --profile production

# 构建完成后会生成下载链接，下载 APK 文件
```

### 9.3 上架应用商店

#### Android 应用商店
| 商店 | 说明 |
|------|------|
| **华为应用市场** | 注册华为开发者账号，上传 APK |
| **小米应用商店** | 注册小米开发者账号 |
| **OPPO 软件商店** | 注册 OPPO 开发者账号 |
| **vivo 应用商店** | 注册 vivo 开发者账号 |
| **应用宝** | 腾讯自家应用商店 |
| **酷安** | 第三方应用市场 |

#### iOS App Store
```bash
# 需要 Mac 电脑 + Apple 开发者账号（99美元/年）
eas build --platform ios --profile production
```

提交后通过 App Store Connect 上架。

---

## 10. 日常维护

### 10.1 更新代码

```bash
cd /opt/app
git pull                    # 拉取最新代码
pnpm install                # 更新依赖
cd server && pnpm run build && cd ..  # 重新构建
pm2 restart app-server      # 重启服务
```

### 10.2 查看日志

```bash
# 应用日志
pm2 logs app-server

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 10.3 数据库备份

```bash
# 导出数据库
pg_dump -h 数据库地址 -U 用户名 -d 数据库名 > backup_$(date +%Y%m%d).sql
```

### 10.4 监控

推荐安装腾讯云自带的**云监控**插件，或在服务器上安装：

```bash
# 安装 Node.js 进程监控
npm install -g pm2-server-monit
pm2 server-monit           # 打开监控面板
```

---

## 附录：常见问题

### Q: 部署后 API 请求返回 401
A: 检查 `COZE_SUPABASE_URL` 和 `COZE_SUPABASE_ANON_KEY` 是否正确配置

### Q: 部署后静态资源 404
A: 检查 Nginx 配置中 `location /assets/` 是否正确指向前端服务

### Q: 上传文件失败
A: 目前上传功能使用 Coze 内置存储，上线后需替换为腾讯云 COS（对象存储）