# 记账助手 - 部署指南

## 服务器信息

| 项目 | 内容 |
|------|------|
| 域名 | wuwanli.online |
| 服务器 IP | 118.195.198.69 |
| 前端地址 | https://wuwanli.online |
| 后端地址 | https://wuwanli.online/api |

## 部署步骤

### 1. 将代码上传到服务器

在你的本地电脑（或当前开发环境）执行：

```bash
# 将项目打包上传到服务器
scp -r /path/to/project/* root@118.195.198.69:/opt/jizhang-app/
```

### 2. SSH 登录服务器

```bash
ssh root@118.195.198.69
```

### 3. 运行部署脚本

```bash
cd /opt/jizhang-app
bash deploy/deploy.sh
```

### 4. 配置 SSL 证书

```bash
# 安装 certbot
apt-get install -y certbot python3-certbot-nginx

# 申请 SSL 证书
certbot --nginx -d wuwanli.online

# 按照提示输入邮箱，同意协议即可
```

### 5. 启动后端服务

```bash
cd /opt/jizhang-app/server
npm install -g pm2
EXPO_PUBLIC_BACKEND_BASE_URL=https://wuwanli.online/api pm2 start build.js --name jizhang-api
pm2 save
```

### 6. 验证部署

```bash
# 验证后端
curl https://wuwanli.online/api/v1/health

# 验证前端
curl -I https://wuwanli.online
```

## 服务器要求

- Ubuntu 20.04+ / CentOS 7+
- Node.js 24+
- Nginx
- 内存: 最低 1GB，推荐 2GB
- 开放端口: 80 (HTTP), 443 (HTTPS)

## 备案信息

参见 `client/assets/keystore/README.md` 获取签名文件指纹信息。