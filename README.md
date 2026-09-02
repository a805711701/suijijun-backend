# 随机君小红书内容操盘手 - Node.js 后端服务

为「随机君小红书内容操盘手」前端应用提供云端数据共享能力的 Node.js 后端服务。

## 功能特性

- 用户管理（登录、创建、启用/禁用、删除、重置密码）
- 生成记录存储与查询（跨设备共享）
- 素材库管理（分类、增删改查）
- 产品事实管理
- 管理后台统计
- JWT 鉴权
- 支持 SQLite（本地/简单部署）和 PostgreSQL（生产/Render）
- CORS 全开放，方便前端跨域调用

## 技术栈

- Node.js >= 18
- Express 4
- SQLite (better-sqlite3) / PostgreSQL (pg)
- JWT (jsonwebtoken)
- bcryptjs（密码加密）
- CORS

## 快速开始（本地开发）

```bash
# 安装依赖
npm install

# 启动服务（默认端口 3000，使用 SQLite）
npm start

# 或开发模式（自动重启）
npm run dev
```

启动后访问：
- 健康检查：http://localhost:3000/health
- API 健康检查：http://localhost:3000/api/health

默认管理员账号：
- 用户名：admin1
- 密码：admin123

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| PORT | 服务端口 | 3000 |
| DATABASE_URL | PostgreSQL 连接串（不填则用 SQLite） | 无 |
| JWT_SECRET | JWT 签名密钥（生产环境必须设置） | suijijun-default-secret |
| ADMIN_USERNAME | 默认管理员用户名 | admin1 |
| ADMIN_PASSWORD | 默认管理员密码 | admin123 |

## 部署到 Render（推荐，最简单）

### 第一步：准备 GitHub 仓库

1. 注册 GitHub 账号（如没有）
2. 创建新仓库（公开或私有均可）
3. 将本项目所有文件上传到仓库根目录（确保根目录有 package.json）

### 第二步：创建 Web Service

1. 打开 https://render.com，用 GitHub 账号登录
2. 点「New +」→「Web Service」
3. 选择你刚创建的 GitHub 仓库
4. 配置：
   - Name: suijijun-backend（随便起）
   - Region: 选 Singapore（离国内近）或 Oregon
   - Branch: main
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `node src/index.js`
   - Instance Type: Free（免费）或 Starter（付费，更稳定）
5. 点「Create Web Service」
6. 等待 1-2 分钟部署完成

### 第三步：配置环境变量（推荐）

1. 进入服务的「Environment」页面
2. 添加以下环境变量：
   - `JWT_SECRET`: 随便填一个长字符串（如 `my-super-secret-key-2024`）
   - `ADMIN_PASSWORD`: 你的管理员密码（不填则默认 admin123）
3. 保存后会自动重新部署

### 第四步：（推荐）创建 PostgreSQL 数据库，实现数据持久化

> Render 免费套餐的本地磁盘是临时的，服务重启后 SQLite 数据会丢失。建议用 PostgreSQL。

1. 在 Render 仪表盘点「New +」→「PostgreSQL」
2. 配置：
   - Name: suijijun-db
   - Region: 和 Web Service 选同一个
   - Instance Type: Free（免费，90天有效期）或付费
3. 点「Create Database」
4. 创建完成后，复制「Internal Database URL」
5. 回到 Web Service 的「Environment」页面，添加环境变量：
   - `DATABASE_URL`: 粘贴刚才复制的 Internal Database URL
6. 保存后自动重新部署，后端会自动连接 PostgreSQL 并创建表

### 第五步：测试连接

部署完成后，Render 会给你一个服务地址，如 `https://suijijun-backend.onrender.com`

在浏览器打开：
- `https://你的地址/health` → 应返回 `{"status":"ok",...}`
- `https://你的地址/api/health` → 同样返回 ok

说明后端部署成功。

## 部署到云服务器（阿里云/腾讯云等）

### 前提

- 一台云服务器（1核1G最低配即可，约60元/月）
- 服务器已安装 Node.js 18+
- 开放 3000 端口（或你想用的端口）

### 部署步骤

```bash
# 1. 上传代码到服务器（用 scp 或 git clone）
scp -r ./ user@your-server-ip:/opt/suijijun-backend

# 2. 登录服务器
ssh user@your-server-ip

# 3. 进入项目目录
cd /opt/suijijun-backend

# 4. 安装依赖
npm install --production

# 5. 安装 PM2（进程管理，保持后台运行）
npm install -g pm2

# 6. 设置环境变量（推荐写入 .env 文件）
cat > .env << EOF
PORT=3000
JWT_SECRET=your-secret-key-change-this
ADMIN_PASSWORD=your-admin-password
EOF

# 7. 启动服务
pm2 start src/index.js --name suijijun-backend

# 8. 设置开机自启
pm2 startup
pm2 save
```

### 配置 Nginx 反向代理 + HTTPS（推荐）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

然后用 Let's Encrypt 配置 HTTPS：
```bash
certbot --nginx -d your-domain.com
```

## API 文档

所有 API 路径前缀为 `/api`，除了 `/health`。

### 认证

#### POST /api/auth/login
登录，返回 JWT token。

请求体：
```json
{
  "username": "admin1",
  "password": "admin123"
}
```

响应：
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "username": "admin1",
    "role": "admin",
    "status": "active"
  }
}
```

#### GET /api/auth/me
获取当前用户信息（需要 token）。

#### GET /api/auth/has-users
检查系统是否已有用户（不需要 token）。

### 用户管理（管理员）

所有接口需要管理员权限，Header 带 `Authorization: Bearer <token>`。

#### GET /api/admin/users
获取用户列表，支持分页和筛选。

查询参数：`page`, `pageSize`, `role`, `status`

#### POST /api/admin/users
创建用户。

请求体：
```json
{
  "username": "zhangsan",
  "password": "password123",
  "role": "member"
}
```

#### PUT /api/admin/users/:id
更新用户（重置密码、修改角色）。

#### PUT /api/admin/users/:id/status
启用/禁用用户。

请求体：
```json
{
  "status": "disabled"
}
```

#### DELETE /api/admin/users/:id
删除用户。

### 生成记录

#### POST /api/generations
创建生成记录（需要登录）。

请求体：
```json
{
  "mode": "modeA",
  "task_type": "关键词生产",
  "input_content": "静音",
  "output_content": "...完整生成内容...",
  "title": "静音关键词内容生产"
}
```

#### GET /api/generations
获取生成记录列表（管理员看全部，普通成员看自己的）。

查询参数：`page`, `pageSize`, `mode`, `task_type`, `search`, `user_id`

#### GET /api/generations/:id
获取单条生成记录详情。

#### DELETE /api/generations/:id
删除生成记录。

#### POST /api/generations/check-duplicate
去重检测。

### 素材库

#### GET /api/materials
获取素材库列表（支持分类筛选和搜索）。

查询参数：`category`, `search`, `page`, `pageSize`

#### POST /api/materials
新增素材（需要登录）。

请求体：
```json
{
  "category": "爆文案例",
  "title": "某爆款笔记标题",
  "content": "...内容...",
  "source": "manual"
}
```

#### PUT /api/materials/category/:category
批量替换指定分类的全部内容。

#### PUT /api/materials/:id
更新单条素材。

#### DELETE /api/materials/:id
删除素材。

### 产品事实

#### GET /api/product-facts
获取产品事实（公开，不需要登录）。

#### PUT /api/product-facts
更新产品事实（需要登录）。

请求体：
```json
{
  "content": "产品类型：...\n核心特点：..."
}
```

### 管理后台统计

#### GET /api/admin/stats
获取综合统计数据（需要管理员权限）。

## 前端修改指南

要让前端应用连接到这个后端，需要修改以下部分：

### 1. 增加后端配置

在前端的设置/管理后台页面，增加「自定义后端」模式，让用户输入后端地址（如 `https://suijijun-backend.onrender.com`）。

### 2. 修改 API 调用层

将原来调用本地 localStorage 或飞书插件的地方，改为调用后端 API：

```javascript
// 示例：API 封装
const API_BASE = 'https://suijijun-backend.onrender.com/api';

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }
  return data;
}

// 登录
async function login(username, password) {
  const data = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

// 创建生成记录
async function createGeneration(record) {
  return apiRequest('/generations', {
    method: 'POST',
    body: JSON.stringify(record)
  });
}

// 获取生成记录列表
async function getGenerations(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiRequest(`/generations?${query}`);
}
```

### 3. 修改登录逻辑

- 登录时调用 `POST /api/auth/login`，获取 token
- 将 token 和用户信息保存到 localStorage
- 后续请求在 Header 中带 `Authorization: Bearer <token>`
- token 过期或无效时，清除本地数据并跳转到登录页

### 4. 修改数据存储逻辑

将以下数据从 localStorage 改为从后端 API 获取：
- 用户信息 → `/api/auth/me`
- 生成记录 → `/api/generations`
- 素材库 → `/api/materials`
- 产品事实 → `/api/product-facts`
- 管理后台统计 → `/api/admin/stats`

### 5. 保持本地降级（可选）

为了防止后端不可用时前端完全无法使用，可以保留本地模式作为降级：
- 后端连接失败时，提示用户「后端服务暂不可用，是否切换到本地模式？」
- 本地模式下数据存在 localStorage，不跨设备共享

## 数据库备份

### SQLite 备份

```bash
# 直接复制数据库文件
cp data/app.db data/app.db.backup-$(date +%Y%m%d)
```

### PostgreSQL 备份

```bash
pg_dump -U username -h hostname database_name > backup-$(date +%Y%m%d).sql
```

建议设置定时备份（如每天一次）。

## 常见问题

### Q: Render 免费套餐服务休眠怎么办？
A: 免费套餐 15 分钟无请求会休眠，下次访问要等几秒唤醒。可以用监控工具（如 UptimeRobot）定时访问保持唤醒，或升级到付费套餐。

### Q: 数据会丢失吗？
A: 如果用 SQLite 且部署在 Render 免费套餐，服务重启后数据会丢失（因为磁盘是临时的）。建议用 PostgreSQL（Render 提供免费的 PostgreSQL 实例），数据持久化。

### Q: 忘记管理员密码怎么办？
A: 设置环境变量 `ADMIN_PASSWORD` 为新密码，重新部署后会更新默认管理员密码。或者直接修改数据库中的用户记录。

### Q: 如何修改默认管理员账号？
A: 设置环境变量 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，首次启动时会创建对应账号。如果账号已存在则不会修改。

### Q: 前端调用后端报 CORS 错误怎么办？
A: 后端已配置 CORS 全开放，应该不会有问题。如果仍有问题，检查后端是否正常启动，以及前端调用的地址是否正确。

## 项目结构

```
suijijun-backend/
├── src/
│   ├── index.js              # 入口文件
│   ├── db.js                 # 数据库抽象层（SQLite/PG）
│   ├── middleware/
│   │   └── auth.js           # JWT 鉴权中间件
│   └── routes/
│       ├── auth.js           # 认证路由
│       ├── generations.js    # 生成记录路由
│       ├── materials.js      # 素材库路由
│       ├── productFacts.js   # 产品事实路由
│       └── admin/
│           ├── users.js      # 用户管理路由
│           └── stats.js      # 统计路由
├── data/                     # SQLite 数据库文件目录（自动创建）
├── package.json
├── render.yaml               # Render 部署配置
├── .gitignore
└── README.md
```

## License

MIT
