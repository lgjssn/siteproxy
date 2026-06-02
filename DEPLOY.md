# VPS 部署指南

## 环境要求

- Node.js >= 14
- npm
- 一个域名（可选，但推荐配置 SSL）

## 快速开始

```bash
# 1. 克隆并切换到 vps-proxy 分支
git clone https://github.com/lgjssn/siteproxy.git
cd siteproxy
git checkout vps-proxy

# 2. 安装依赖
npm install --omit=dev

# 3. 设置环境变量
export PROXY_PASSWORD="你的密码"    # 必填，不设则无密码保护
export SERVER_NAME="你的域名.com"    # 可选，默认用 config.js 里的值
export PORT=8011                    # 可选，默认 8011

# 4. 启动
node index.js
```

服务启动后访问 `http://你的服务器IP:8011`，输入密码即可使用。

## 使用 PM2 守护进程

```bash
npm install -g pm2
pm2 start index.js --name siteproxy
pm2 save
pm2 startup       # 开机自启
```

## 配置 Nginx 反代 + HTTPS

```nginx
server {
    listen 80;
    server_name 你的域名.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name 你的域名.com;

    ssl_certificate     /etc/letsencrypt/live/你的域名.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/你的域名.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8011;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;              # 流式传输，大文件下载需要
        proxy_read_timeout 300s;          # 代理请求超时
    }
}
```

Let's Encrypt 免费 SSL 证书：
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d 你的域名.com
```

## 更新部署

```bash
cd siteproxy
git pull origin vps-proxy
pm2 restart siteproxy
```

## 环境变量说明

| 变量 | 必填 | 说明 |
|---|---|---|
| `PROXY_PASSWORD` | 建议 | 登录密码，不设置则无鉴权（任何人可用） |
| `SERVER_NAME` | 否 | 你的域名，比如 `proxy.example.com` |
| `PORT` | 否 | 监听端口，默认 8011 |

## 使用方式

1. 打开 `https://你的域名.com`
2. 输入密码登录
3. 在首页的地址栏输入 `https/目标网站域名`，例如 `https/bbs.nga.cn`
4. 即可通过代理浏览目标网站
