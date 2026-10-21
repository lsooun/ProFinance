# ProFinance — 项目与财务管理

ProFinance 是一个项目与财务管理应用，覆盖项目预算、收支记账、工时、回款计划、人员与用户权限。前端为 React + TypeScript + Tailwind CSS，后端为 Node.js + SQLite，数据保存在本地，不依赖外部服务。

## 界面预览

| 登录 | 管理员仪表盘 |
|---|---|
| ![登录页](docs/screenshots/login.png) | ![管理员仪表盘](docs/screenshots/admin-dashboard.png) |

普通员工只能看到被分配的项目和本人数据：

![员工项目页](docs/screenshots/employee-projects.png)

## 功能

- **仪表盘**：实际收入 / 实际支出 / 实际利润 / 预算总额，本月收支、项目状态、最近流水
- **项目管理**：项目增删改查、状态筛选、预算拆分、合同收入、计划/实际利润、预算使用率；项目负责人从真实用户账号中选择；新建项目可上传 Cost Sheet 自动计算预算、收入、毛利、审批利润和付款节点
- **项目详情**：成员分配与计划工时编辑、工时汇总、回款节点增删改与自动对账、预算分类实际执行、Cost Sheet 分析、项目收支
- **收支管理**：收入/支出增删改查、筛选、预算分类、收入关联回款节点、CSV 批量导入
- **工时管理**：工时填报与修改、按项目/人员筛选、CSV 批量导入；填报单位支持小时/天/周/月/年，数据库统一折算为小时存储
- **人员管理**：人员档案、角色、部门、在职状态、人均工时统计（人员档案用于项目成员与工时，登录账号用于系统权限与项目负责人；所有用户角色都可以关联人员档案）
- **统计报表**：财务、工时、回款计划三个页签，月/年切换，CSV 导出
- **用户与权限**：管理员、项目经理、普通员工三种角色；个人资料修改、密码修改、管理员生成一次性密码重置链接；项目经理可查看全部项目汇总统计，但只能查看自己负责项目的明细
- **项目文档**：成本表、合同、SOW、蓝图签字、测试确认、上线确认、项目关闭等分类归档，支持 Excel / Word / PDF，单文件不超过 10 MB
- **安全**：密码 scrypt 加盐哈希、HttpOnly 会话 Cookie、服务端 RBAC、一次性重置令牌、上传文件落盘

## 技术架构

```
浏览器（React SPA）
  │  HttpOnly Cookie + JSON API
  ▼
Node HTTP API（server/app.mjs）
  │
  ▼
SQLite（data/profinance.db） + 附件目录（data/uploads/）
```

- 前端不再使用 `localStorage` 存业务数据，登录态保存在 HttpOnly Cookie 中。
- 开发模式下 Vite 运行在 `5173`，通过代理访问 `8787` 的 API。
- 生产模式下由 Node 服务同时提供 API 和 `dist/` 静态文件。

## 环境要求

- Node.js **22.5+**（使用内置 `node:sqlite`）
- npm

## 快速开始

```bash
npm install
npm run dev
```

打开 <http://127.0.0.1:5173/>。

首次启动会自动创建数据库并写入中文演示数据。

### Cost Sheet 模板

新建项目时可上传成本表 Excel，系统会读取报价、人员成本、其它费用、外包报价、人天成本和 Cost Sheet Summary 工作表，计算合同总额、净收入、人力/差旅/其他成本、毛利、审批利润、人天和付款节点，并自动填充项目预算与合同收入。解析结果会保存在项目中，原文件按“成本表”类型归档。

### 演示账号

| 角色 | 邮箱 | 密码 |
|---|---|---|
| 管理员 | `admin@company.com` | `123456` |
| 项目经理 | `manager@company.com` | `123456` |
| 普通员工 | `wang.lei@company.com` | `123456` |

> 演示账号提示仅在开发模式显示；生产构建不会展示账号或默认密码。首次部署后请立即通过右上角菜单“修改密码”。忘记密码时，可由管理员在用户管理中生成 30 分钟有效的一次性重置链接。

### 生产运行（本机 Node）

```bash
npm run build
npm start
```

默认地址：<http://127.0.0.1:8787/>。可通过环境变量调整：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PF_HOST` | `127.0.0.1` | 监听地址；Docker/内网访问时设为 `0.0.0.0` |
| `PF_PORT` / `PORT` | `8787` | 生产服务端口 |
| `PF_DB_PATH` | `data/profinance.db` | SQLite 数据库路径 |
| `PF_UPLOAD_DIR` | `data/uploads` | 附件目录 |
| `PF_SECURE_COOKIE` | 未设置 | 设为 `1` 时 Cookie 增加 `Secure`（HTTPS 部署时启用） |

## Docker 部署

项目已包含 `Dockerfile`、`docker-compose.yml`、Caddy 反向代理配置和持久卷。  
**不需要在宿主机安装 SQLite**，Node 镜像已内置 `node:sqlite`。

### 方式一：本机/内网快速运行

```bash
docker compose up -d --build
curl http://127.0.0.1:8787/api/health
```

- 访问：<http://127.0.0.1:8787/>
- 应用端口仅绑定到宿主机 `127.0.0.1`，不直接暴露公网。
- 数据保存在命名卷 `profinance-data` 中（数据库 + 附件）。
- 默认 `PF_SECURE_COOKIE=0`，适合本地 HTTP 测试；公网 HTTPS 部署请设为 `1`。

### 方式二：生产环境 + Caddy 自动 HTTPS

1. 将域名 DNS 解析到服务器公网 IP，放行 `80/443` 端口。
2. 准备配置：

```bash
cp deploy/production.env.example deploy/production.env
vi deploy/production.env
```

至少修改：

```dotenv
APP_DOMAIN=profinance.example.com
PF_SECURE_COOKIE=1
```

3. 启动应用与 Caddy：

```bash
docker compose --env-file deploy/production.env --profile proxy up -d --build
docker compose ps
docker compose logs -f app
```

Caddy 会自动申请并续期 HTTPS 证书；应用仅通过容器网络暴露给 Caddy。  
反向代理配置见 [deploy/Caddyfile](deploy/Caddyfile)。

> 如果已经有 Nginx / 云负载均衡，只需运行 `docker compose up -d app`，将上游指向 `127.0.0.1:8787`，并把 `PF_SECURE_COOKIE` 设为 `1`。

### 数据卷与备份

```bash
# 查看卷
docker volume inspect profinance-data

# 停止应用后做一致性备份
docker compose stop app
mkdir -p backups
docker run --rm \
  -v profinance-data:/data \
  -v "$PWD/backups":/backup \
  alpine sh -c 'tar czf /backup/profinance-$(date +%F-%H%M).tgz -C /data .'
docker compose start app
```

恢复时把备份包解压回 `profinance-data` 卷即可。`docker compose down` 会保留数据卷；`docker compose down -v` 会**删除数据库和附件**，请谨慎使用。

### 镜像与容器说明

- 构建阶段安装依赖并执行 `npm run build`，运行阶段只包含 `dist/`、`server/` 和 Node 运行时。
- 容器以非 root 用户 `node` 运行。
- 应用在容器内监听 `0.0.0.0:8787`，宿主机端口默认只映射到 `127.0.0.1`。
- 健康检查：`/api/health`。
- 首次启动自动建库并写入中文演示数据。

## 权限模型

| 能力 | 管理员 | 项目经理 | 普通员工 |
|---|---|---|---|
| 仪表盘 | 全部数据 | 全部项目汇总；明细仅自己负责项目 | 仅自己项目与工时 |
| 项目管理 | 全部 | 全部项目汇总；仅自己负责项目可看明细/编辑 | 仅被分配项目（只读） |
| 收支管理 | 全部 | 仅自己负责项目 | 无权访问 |
| 工时管理 | 全部人员 | 仅自己负责项目 | 仅本人 |
| 人员管理 | 全部 | 全部 | 无权访问 |
| 统计报表 | 全部 | 仅自己负责项目明细 | 无权访问 |
| 用户管理 | 全部 | 无权访问 | 无权访问 |
| 项目财务/回款/附件 | 可见可管理 | 仅自己负责项目可见可管理 | 不可见 |

权限同时在服务端和界面层校验；即使绕过界面直接请求 API，也会被拒绝。

## 数据与备份

- 数据库：`data/profinance.db`
- 附件：`data/uploads/`
- 备份：停止服务后复制 `data/` 目录即可。
- 重置演示数据：

```bash
# 先停止 npm run dev / npm start
npm run db:reset
npm run dev
```

`data/` 已加入 `.gitignore`，不会提交到版本库。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动 API（8787）和 Vite（5173） |
| `npm run dev:web` | 只启动 Vite |
| `npm run dev:api` | 只启动 API（监听文件变更） |
| `npm run build` | 生产构建到 `dist/` |
| `npm start` | 启动生产服务（需先构建） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint |
| `npm test` | 后端集成测试（认证、权限、附件、管理员保护） |
| `npm run check` | typecheck + lint + test + build |

## 目录结构

```
Dockerfile                 多阶段生产镜像
docker-compose.yml         应用 + 可选 Caddy 反向代理
deploy/
  Caddyfile                Caddy 反向代理配置
  production.env.example   生产环境变量示例
server/
  app.mjs                  API 路由、认证、权限、业务校验
  db.mjs                   SQLite 表结构、密码哈希、中文种子数据
  index.mjs                生产静态服务 + API 服务
  app.test.mjs             后端集成测试
scripts/
  dev.mjs                  同时启动 API 与 Vite
  reset-db.mjs             清空本地数据
src/
  components/              布局、通用 UI、Toast
  context/                 认证上下文
  lib/                     API、数据缓存、路由、财务计算、CSV、格式化
  pages/                   各业务页面
  types/                   类型与中文枚举
```

## 安全说明

- 密码使用 `scrypt` 加盐哈希存储，数据库中不保存明文密码。
- 会话使用 HttpOnly + SameSite=Lax Cookie，前端无法读取。
- 所有写操作在服务端做角色校验；员工访问非分配项目、他人工时、财务数据都会被拒绝。
- 附件限制为 `.xlsx/.xls`、单文件 5 MB，文件保存在磁盘上。
- 本地 HTTP 环境未启用 `Secure` Cookie；上线请使用 HTTPS 并设置 `PF_SECURE_COOKIE=1`。
- Docker 镜像以非 root 用户运行，应用端口仅绑定宿主机回环地址，由 Caddy/Nginx 对外提供 HTTPS；建议再加限流、防火墙和定期备份。
- SQLite 适合单实例部署；如需多副本横向扩容，应迁移到 PostgreSQL 等网络数据库。

## 说明

仓库内的 `.env`、`supabase/` 目录是早期版本遗留的 Supabase 配置和 SQL 迁移，**当前版本未使用**。当前后端为本地 Node + SQLite。
