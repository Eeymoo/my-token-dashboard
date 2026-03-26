# CLAUDE.md

## 项目概览

这是一个基于 **Next.js 14 App Router** 的 AI Token 看板项目，用于统计和管理用户在 New API 平台上的 Token 使用情况。当前项目以前后端一体的方式实现：

- 前端页面位于 `src/app/page.tsx`
- 后端接口位于 `src/app/api/**/route.ts`
- 数据库访问位于 `src/lib/db.ts`
- 外部 New API 客户端位于 `src/lib/api-client.ts`
- 数据同步与聚合逻辑位于 `src/lib/sync.ts`

## 技术栈

- 框架：Next.js 14
- 语言：TypeScript
- UI：Ant Design 5
- 图表：Recharts
- 状态与请求缓存：@tanstack/react-query
- HTTP 客户端：axios
- 日期处理：dayjs
- 数据库：MySQL（mysql2/promise）
- 定时任务：node-cron
- 样式：Tailwind CSS + 全局 CSS

## 目录结构

```text
src/
  app/
    api/
      init/route.ts          # 系统初始化接口
      logs/route.ts          # 日志查询/测试写入接口
      logs/summary/route.ts  # 汇总数据接口
      models/route.ts        # 模型列表接口
      sync/route.ts          # 手动/定时同步接口
    globals.css              # 全局样式
    layout.tsx               # 全局布局、Antd/QueryProvider 注入
    page.tsx                 # 仪表盘首页
    QueryProvider.tsx        # React Query Provider
  hooks/
    useLogs.ts               # 前端数据请求 hooks
  lib/
    api-client.ts            # New API 请求封装
    db.ts                    # MySQL 连接与 SQL 操作
    sync.ts                  # 数据同步、聚合、调度
  types/
    api.ts                   # API 类型定义
```

## 核心架构

### 1. 前端展示层

前端主页面在 `src/app/page.tsx`，负责：

- 时间范围选择
- 模型筛选
- 汇总指标展示
- 时间趋势图展示
- 分模型使用量展示
- 手动触发同步
- 暗色模式切换

前端通过 `src/hooks/useLogs.ts` 中的 hooks 调用后端接口：

- `useSummary()` → `/api/logs/summary`
- `useModels()` → `/api/models`
- `useSync()` → `/api/sync`
- `useLogs()` → `/api/logs`

### 2. API 层

#### `/api/init`
文件：`src/app/api/init/route.ts`

用途：
- 初始化同步器
- 初始化数据库表
- 启动定时同步

#### `/api/sync`
文件：`src/app/api/sync/route.ts`

用途：
- `GET`：异步触发一次同步
- `POST`：初始化同步器，并选择立即同步或启动定时同步

说明：
- 需要 `Authorization: Bearer <ADMIN_API_KEY>` 鉴权
- 鉴权逻辑较简单，位于当前文件内部

#### `/api/logs`
文件：`src/app/api/logs/route.ts`

用途：
- `GET`：按时间范围、模型、分页查询 `api_logs`
- `POST`：手动写入一条日志（主要用于测试）

#### `/api/logs/summary`
文件：`src/app/api/logs/summary/route.ts`

用途：
- 汇总总 Token、总花费、总请求数
- 统计成功/失败请求
- 返回按模型聚合的数据
- 返回按天聚合的时间序列数据

#### `/api/models`
文件：`src/app/api/models/route.ts`

用途：
- 优先从 `models` 表读取模型列表
- 若失败，则从 `api_logs` 中提取去重模型
- 若仍为空，则返回内置默认模型列表
- `POST` 支持新增/更新模型

### 3. 数据访问层

文件：`src/lib/db.ts`

职责：
- 创建 MySQL 连接池
- 测试数据库连接
- 初始化数据库表
- 执行通用 SQL 查询
- 插入日志

当前初始化会创建三张核心表：

1. `api_logs`
   - 原始日志主表
   - 保存模型、用户、Token、费用、请求、延迟、接口等信息

2. `models`
   - 模型信息表
   - 保存模型名称、提供商、分类、描述、启用状态

3. `aggregated_data`
   - 聚合结果表
   - 以 hour/day/week/month 粒度保存聚合数据

另外，同步模块会额外维护：

4. `sync_metadata`
   - 保存 `last_sync_time` 等同步元数据

### 4. 外部 API 层

文件：`src/lib/api-client.ts`

职责：
- 配置 axios 实例访问 New API
- 注入 `Authorization` 与 `New-Api-User` 请求头
- 通过 `/api/log/` 拉取外部日志数据
- 对外部接口响应做兼容性归一化

关键点：
- `fetchLogs()` 当前是同步模块真正依赖的外部拉取入口
- `normalizeLogResponse()` 会把不同字段风格归一成内部使用格式
- `fetchModels()` 与 `fetchSummary()` 当前更像占位/演示实现，主流程并不依赖它们

## 数据同步流程

文件：`src/lib/sync.ts`

`DataSync` 是项目的数据同步核心，主要职责如下：

1. `initialize()`
   - 测试数据库连接
   - 初始化数据库表
   - 确保 `sync_metadata` 表存在

2. `syncData()`
   - 防止并发重复同步
   - 读取上次同步时间
   - 从 New API 分页拉取日志
   - 通过 `transformLogToDbFormat()` 兼容多种日志字段格式
   - 写入 `api_logs`
   - 更新 `last_sync_time`
   - 触发聚合

3. `aggregateData()`
   - 分别按 hour/day/week/month 执行聚合
   - 将结果写入 `aggregated_data`

4. `startScheduledSync()`
   - 基于 `SYNC_INTERVAL_HOURS` 生成 cron 表达式
   - 启动定时同步
   - 启动时立即执行一次同步

## 前端数据流

1. 用户打开首页 `src/app/page.tsx`
2. 页面根据时间范围生成 `startDate` / `endDate`
3. `useSummary()` 请求 `/api/logs/summary`
4. `useModels()` 请求 `/api/models`
5. 用户点击“同步数据”后，`useSync()` 请求 `/api/sync`
6. 同步成功后失效 React Query 缓存并重新拉取数据

## 关键环境变量

参考 `.env.example`：

### 外部 New API
- `NEW_API_BASE_URL`
- `NEW_API_KEY`
- `NEW_API_USER`

### 数据库
- `DATABASE_URL`
- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_NAME`
- `DATABASE_USER`
- `DATABASE_PASSWORD`

### 管理接口
- `ADMIN_API_KEY`

### 前端配置
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_DEFAULT_CURRENCY`

### 同步配置
- `SYNC_INTERVAL_HOURS`
- `SYNC_ENABLED`

## 运行方式

### 安装依赖
```bash
npm install
```

### 启动开发环境
```bash
npm run dev
```

### 初始化系统
启动服务后可调用：

```bash
curl http://localhost:3000/api/init
```

### 手动触发同步
```bash
curl -H "Authorization: Bearer <ADMIN_API_KEY>" "http://localhost:3000/api/sync?force=true"
```

## 当前实现特征

1. 项目是单体式 Next.js 应用，前端和 API 共仓。
2. MySQL 是核心数据源，页面展示主要依赖本地落库后的查询结果。
3. 与 New API 的集成集中在 `src/lib/api-client.ts` 和 `src/lib/sync.ts`。
4. 汇总页主要消费 `/api/logs/summary`，而不是直接消费外部接口。
5. 模型列表接口有多级降级策略：`models` 表 → `api_logs` 去重 → 默认静态列表。
6. 当前存在一些默认值和演示型兜底逻辑，后续修改时优先判断哪些是正式逻辑、哪些是临时占位逻辑。

## 协作约定

1. 与本项目相关的说明、分析、变更反馈，默认使用中文。
2. 回答尽量简洁直接，优先说明结论与改动点。
3. 修改代码前先阅读相关文件，避免脱离现状做假设。
4. 除非明确需要，不要额外创建无关文件或做过度重构。
5. 如果要改动接口、数据库结构、同步流程，先检查 `src/lib/db.ts`、`src/lib/sync.ts`、`src/app/api/**/route.ts` 的联动影响。
6. 强制使用中文回复用户，除非用户明确要求使用其他语言。

## 维护建议

后续如果项目结构有较大变化，优先更新以下部分：

- 目录结构
- API 路由说明
- 数据库表说明
- 同步流程
- 协作约定
