# AI Token 看板

基于 New API 平台的 Token 使用情况统计和管理 Dashboard，包含完整的前后端和数据库。

## ✨ 功能特性

- 📊 **全局筛选器**: 模型选择、时间范围选择（快捷选项+自定义）
- 🎯 **总览卡片**: 总 Token 消耗、总花费、总请求数 KPI 展示
- 📈 **时间趋势分析**: 折线图展示分时/累计数据，支持多指标切换
- 🧩 **分模型使用量分析**: 堆叠面积图展示各模型使用情况
- 🔄 **实时数据**: 定时同步（每小时一次），手动刷新按钮
- 🗃️ **数据库存储**: MySQL 数据库存储历史数据
- 🌙 **暗色模式**: 支持亮色/暗色主题切换
- 📱 **响应式设计**: 适配桌面端和移动端

## ✅ 需求确认（2026-03-26）

| 编号 | 需求点 | 说明 |
| --- | --- | --- |
| R1 | 分模型使用量图横轴 | 需改为时间轴（按小时粒度），使用 `/api/logs/summary` 提供的数据 |
| R2 | 统计模式 | 提供“分时”“累计”两种模式；累计模式按小时对各模型进行累加展示 |
| R3 | 数据接口 | `/api/logs/summary` 新增 `modelTimeSeries` 字段，包含每小时各模型的 tokens/cost/requests 等指标 |
| R4 | 堆叠展示 | 默认堆叠显示，支持通过卡片 extra 区域的开关切换堆叠/并列柱状 |
| R5 | 适用范围 | 开关仅影响“分模型使用量分析”图表，其余图表保持现状 |

> 上述需求已由产品确认，后续实现需与此保持一致。


## 🏗️ 技术架构

### 前端

## ✅ 需求确认（模型价格同步）

> 最后更新：2026-03-27 00:30

| 编号 | 描述 | 说明 |
| ---- | ---- | ---- |
| P1 | 价格字段 | 仅同步 prompt/completion 单价（USD，按 1K tokens），字段名 `prompt_price_per_1k`、`completion_price_per_1k`，并记录 `currency`。 |
| P2 | 数据源 | 直接请求 `https://raw.githubusercontent.com/BaseLLM/llm-metadata/refs/heads/main/price/latest.json`，无鉴权，需自行缓存/控制频率。 |
| P3 | 数据落库 | 新增 models 表字段 `prompt_price_per_1k DECIMAL(10,6)`、`completion_price_per_1k DECIMAL(10,6)`、`currency VARCHAR(10)`，手动/定时同步都会更新。 |
| P4 | 同步触发 | DataSync 同步日志时顺带同步价格；`/api/init` 初始化完成后也要拉一次价格。 |
| P5 | API 输出 | `/api/models` 返回上述字段及最近一次缓存元数据，前端 hooks 可直接消费。 |
| P6 | 失败策略 | 价格同步失败时记录日志但不阻断主流程，下次同步再尝试。 |

### 待确认问题

| 问题 | 选项 | 当前状态 |
| ---- | ---- | ---- |
| 是否需要记录价格来源版本号 | 1) 只记 URL 2) 记录 commit hash 3) 双写 | 待确认。 |
| 缓存 TTL | 1) 1 小时 2) 6 小时 3) 24 小时 | 建议 6 小时，待确认。 |

## ✅ 需求确认（同步时间改造）

> 最后更新：2026-03-27 00:00

| 编号 | 描述 | 说明 |
| ---- | ---- | ---- |
| T1 | 定时同步颗粒度 | 需要支持自定义 cron 表达式，并在 UI 中展示下次运行时间。 |
| T2 | 手动同步等待提示 | 后端返回更细的同步状态，前端展示“同步中/完成”并显示耗时。 |
| T3 | 安全防抖 | 手动同步需限制频率（例如 1 分钟内仅允许一次），避免重复触发。 |

### 待确认问题

| 问题 | 选项 | 当前状态 |
| ---- | ---- | ---- |
| 同步耗时展示粒度 | 1) 仅毫秒 2) 秒级 3) 人类可读 | 待用户明确。 |
| 定时同步是否可暂停 | 1) 仅关闭 cron 2) 前端开关 3) API 控制 | 待确认。 |


> 最后更新：2026-03-27 00:00

| 编号 | 描述 | 说明 |
| ---- | ---- | ---- |
| P1 | 价格字段范围 | 仅同步输入/输出 token 的美元单价（按 1M tokens 计价），其他元数据暂不纳入。 |
| P2 | 数据落库位置 | 优先直接写入 `models` 表；如需新增字段，使用 DECIMAL(12, 6) 级别的精度满足价格需求。 |
| P3 | 同步链路 | 复用现有 `DataSync` 同步链路（手动/定时）触发价格同步，不额外增加新调度。 |
| P4 | 数据暴露 | `/api/models` 需要返回价格字段，前端暂不强制展示，只为后续扩展做准备。 |
| P5 | API 来源 | 使用 [LLM Metadata API](https://basellm.github.io/llm-metadata/zh/#api) 的模型价格数据，调用参数以文档为准，不臆造。 |
| P6 | 失败回退 | 当价格同步失败时沿用旧价格并记录日志，不影响主流程。 |

### 待确认问题

| 问题 | 选项 | 当前状态 |
| ---- | ---- | ---- |
| 本地模型 ID 与远端别名 | 1) 严格 `model_id` 精确匹配 2) 维护 alias 表 3) 其他 | **默认**：先以 `model_id` 精确匹配，保留无匹配项原值，如遇大量别名再行扩展。 |

## ✅ 需求确认（分模型时序图增强）

> 最后更新：2026-03-26 23:00

| 编号 | 描述 | 说明 |
| ---- | ---- | ---- |
| R1 | 将首页“分模型使用量分析”横轴统一改为时间轴 | 以小时粒度展示，后端返回 `modelTimeSeries` 数据（不再直接用静态模型总计）。 |
| R2 | 支持“分时 / 累计”两种模式 | “分时”展示每个小时的独立值；“累计”按小时累加后展示。 |
| R3 | 默认使用堆叠展示 | 增加堆叠开关，默认开启，关闭后以并列柱状显示。 |
| R4 | Y 轴展示各模型堆叠值 | 需要前端/图表配置支持堆叠与非堆叠切换。 |
| R5 | 数据来源与接口保持风格一致 | 如需调整 `/api/logs/summary`，应更新 `modelTimeSeries` 字段和前端 hooks。 |

### 待确认问题

| 问题 | 选项 | 当前状态 |
| ---- | ---- | ---- |
| 堆叠开关位置 | 1) 与模式并列 2) 下拉菜单 3) 其他 | **建议**：在卡片 extra 区域新增 Switch，但待用户确认。 |



## Checklist Progress

> 详见 `.tdt/checklist.md` 获取完整任务列表。

### Overall Status
- Total: 93 项
- Completed: 0 项
- Progress: 0%

### Chapter Breakdown
| 章节 | 任务数 | 已完成 | 说明 |
| ---- | ------ | ------ | ---- |
| 16. 分模型时序图增强 | 8 | 0 | 新增 modelTimeSeries 字段、堆叠开关与分时/累计逻辑待实现 |

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **UI组件**: Ant Design (antd)
- **图表**: Recharts
- **状态管理**: React Query + React State

### 后端
- **API 代理**: Next.js API Routes
- **数据库**: MySQL + mysql2
- **定时任务**: node-cron (每小时同步)
- **HTTP客户端**: Axios

### 数据流
```
New API → Next.js API代理 → MySQL数据库 → 前端Dashboard
         (每小时同步)         (持久化存储)   (可视化展示)
```

## 🚀 快速开始

### 1. 环境准备

```bash
# 复制环境变量配置
cp .env.example .env.local

# 编辑 .env.local 文件，配置您的 API 信息和数据库
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置数据库

确保 MySQL 服务正在运行，然后创建数据库：

```sql
CREATE DATABASE ai_token_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. 运行开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

### 5. 初始化系统

访问 [http://localhost:3000/api/init](http://localhost:3000/api/init) 初始化数据库和启动定时同步。

### 6. 构建生产版本

```bash
npm run build
npm start
```

## ⚙️ 环境变量配置

### 必需配置
```env
# New API 配置
NEW_API_BASE_URL=https://new-api.onemue.cn/
NEW_API_KEY=您的API密钥
NEW_API_USER=当前登录用户的 user_id

# 数据库配置（运行时读取，不会被构建阶段写死）
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_NAME=ai_token_dashboard
DATABASE_USER=用户名
DATABASE_PASSWORD=密码

# 管理配置
ADMIN_API_KEY=设置一个管理密钥
```

> ⚠️ **注意**：Next.js 服务端代码（包括 `/api/logs/summary`、同步任务等）会在运行时直接读取上述 DATABASE_* 变量。如果通过 `docker-compose` 运行，容器内会自动注入 `DATABASE_HOST=mysql`；在本机直接 `npm run dev` 或 `npm start` 时，请手动把 `DATABASE_HOST` 配置成可以访问 MySQL 的地址（例如 `127.0.0.1`），否则会连到默认的 IPv6 `::1:3306` 而失败。
>
> New API 日志管理接口除了系统访问令牌外，还需要 `NEW_API_USER`（当前登录用户的 `user_id`）。`NEW_API_KEY` 与 `NEW_API_USER` 必须对应同一用户身份，否则同步会被上游拒绝。

### 可选配置
```env
# 同步配置
SYNC_INTERVAL_HOURS=1  # 同步间隔（小时）
SYNC_ENABLED=true     # 是否启用同步

# 应用配置
NEXT_PUBLIC_APP_NAME="AI Token 看板"
NEXT_PUBLIC_DEFAULT_CURRENCY=USD
```

## 📁 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由（后端代理）
│   │   ├── logs/          # 日志查询
│   │   ├── models/        # 模型列表
│   │   ├── sync/          # 数据同步
│   │   └── init/          # 系统初始化
│   ├── layout.tsx         # 根布局
│   ├── page.tsx           # 主页面
│   └── globals.css        # 全局样式
├── components/            # 业务组件（按需创建）
├── hooks/                 # 自定义 Hooks
│   └── useLogs.ts         # 数据查询 Hook
├── lib/                   # 工具库
│   ├── db.ts              # 数据库连接
│   ├── api-client.ts      # New API 客户端
│   └── sync.ts            # 数据同步器
├── types/                 # TypeScript 类型定义
│   └── api.ts             # API 类型定义
└── utils/                 # 工具函数（预留）
```

## 🔧 核心功能实现

### 数据同步机制
- **定时同步**: 每小时自动从 New API 同步数据到本地数据库
- **手动同步**: 支持手动触发同步
- **增量同步**: 基于最后同步时间进行增量更新
- **错误重试**: 同步失败时自动重试机制

### 数据聚合
- **按时间粒度**: 小时/天/周/月自动聚合
- **按模型分组**: 支持多维度分析
- **实时计算**: 前端实时计算累计数据

### API 代理
- **保护 API Key**: 通过后端代理保护 API 密钥
- **数据转换**: 统一数据格式和错误处理
- **缓存策略**: 合理的数据缓存减少重复请求

## 🗄️ 数据库设计

### 主要表结构
1. **api_logs**: 原始 API 日志记录
2. **models**: 模型信息表
3. **aggregated_data**: 聚合数据表（按时间粒度）
4. **sync_metadata**: 同步元数据表

### 索引优化
- 时间戳索引: 加速时间范围查询
- 模型索引: 加速模型筛选
- 组合索引: 支持复杂查询场景

## 🐳 Docker 部署

使用 Docker Compose 可以快速启动包含 MySQL 数据库的完整环境。

### 1. 环境准备

```bash
# 复制 Docker 环境变量配置
cp .env.docker.example .env
# 编辑 .env 文件，根据实际情况修改配置
```

### 2. 启动服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 3. 初始化数据库

应用启动后，访问以下 URL 初始化数据库和启动定时同步：

```
http://localhost:3000/api/init
```

或者使用 curl 命令：

```bash
curl http://localhost:3000/api/init
```

### 4. 访问应用

- 前端应用: http://localhost:3000
- MySQL 数据库: localhost:3306 (用户名/密码见 .env 文件)

### 5. 管理命令

```bash
# 停止服务
docker-compose down

# 停止服务并删除数据卷
docker-compose down -v

# 重启服务
docker-compose restart

# 查看服务状态
docker-compose ps

# 查看应用日志
docker-compose logs app

# 查看数据库日志
docker-compose logs mysql
```

### 7. GitHub Container Registry 镜像

每次发布 tag 时，GitHub Actions 会自动构建并推送 Docker 镜像到 GitHub Container Registry。

#### 可用镜像标签

```
ghcr.io/eeymoo/my-token-dashboard:latest          # 最新稳定版
ghcr.io/eeymoo/my-token-dashboard:v1.0.0          # 特定版本
ghcr.io/eeymoo/my-token-dashboard:v1.0            # 主次版本
ghcr.io/eeymoo/my-token-dashboard:v1              # 主版本
```

#### 使用预构建镜像

运行预构建镜像时，数据库等服务端配置应通过容器运行时环境变量注入，而不是在镜像构建阶段写死。

```bash
# 拉取最新镜像
docker pull ghcr.io/eeymoo/my-token-dashboard:latest

# 使用预构建镜像运行
docker run -p 3000:3000 \
  -e DATABASE_HOST=mysql \
  -e DATABASE_NAME=ai_token_dashboard \
  -e DATABASE_USER=username \
  -e DATABASE_PASSWORD=password \
  ghcr.io/eeymoo/my-token-dashboard:latest
```

#### 登录 GitHub Container Registry

```bash
# 使用 GitHub Personal Access Token 登录
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

#### 创建新版本并发布

```bash
# 创建并推送新 tag
git tag v1.0.0
git push origin v1.0.0
# GitHub Actions 会自动构建并推送镜像
```

## 🚢 部署

### Vercel (推荐)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-repo/ai-token-dashboard)

### 自托管
1. 配置数据库连接
2. 设置环境变量
3. 构建并启动服务
4. 访问 `/api/init` 初始化系统

## 🐛 故障排除

### 常见问题
1. **数据库连接失败**
   - 检查 MySQL 服务状态
   - 验证数据库配置
   - 检查网络连接

2. **API 同步失败**
   - 验证 API Key 是否正确
   - 检查网络连接
   - 查看服务器日志

3. **前端数据不显示**
   - 检查浏览器控制台错误
   - 验证 API 路由是否正常
   - 检查数据库是否有数据

### 日志查看
```bash
# 查看 Next.js 服务器日志
npm run dev  # 开发环境
npm start    # 生产环境
```

## 📄 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 支持

如有问题，请查看 [New API 文档](https://docs.newapi.pro) 或提交 Issue。