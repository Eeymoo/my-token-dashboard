# AI Token 看板 - 开发清单

## 1. 项目基础设施 (Project Setup)
- [ ] 1.1 迁移到 Next.js 14 App Router 架构（删除 Vite 配置）
- [ ] 1.2 配置 TypeScript 严格模式（适配 Next.js）
- [ ] 1.3 配置 Tailwind CSS（适配 Next.js）
- [ ] 1.4 配置 ESLint + Prettier
- [ ] 1.5 配置 Vitest 测试框架
- [ ] 1.6 配置 JSDoc 文档生成
- [ ] 1.7 创建环境变量配置（.env.local 模板）
- [ ] 1.8 初始 Git 提交

## 2. 类型定义完善 (Type Definitions)
- [ ] 2.1 完善 API 原始响应类型（New API 格式）
- [ ] 2.2 定义前端聚合数据类型
- [ ] 2.3 定义图表数据类型
- [ ] 2.4 定义筛选器状态类型
- [ ] 2.5 定义 Zustand Store 类型

## 3. API 客户端开发 (API Client)
- [ ] 3.1 创建 Axios 实例配置
- [ ] 3.2 创建 Next.js API Route 代理层（/api/logs）
- [ ] 3.3 创建模型列表 API（/api/models）
- [ ] 3.4 创建汇总数据 API（/api/logs/summary）
- [ ] 3.5 错误处理和重试机制
- [ ] 3.6 API 响应转换逻辑

## 4. 工具函数开发 (Utils)
- [ ] 4.1 时间粒度计算函数（timeGranularity.ts）
- [ ] 4.2 数值格式化函数（formatters.ts）- K/M/B
- [ ] 4.3 日期范围计算函数
- [ ] 4.4 货币转换函数
- [ ] 4.5 数据聚合函数
- [ ] 4.6 累计计算函数

## 5. 状态管理开发 (State Management)
- [ ] 5.1 创建 Zustand Store（dashboard-store.ts）
- [ ] 5.2 筛选器状态管理
- [ ] 5.3 主题状态管理（暗色模式）
- [ ] 5.4 货币单位状态管理
- [ ] 5.5 实时刷新状态管理

## 6. 自定义 Hooks 开发 (Custom Hooks)
- [ ] 6.1 useLogs - 日志数据获取
- [ ] 6.2 useModels - 模型列表获取
- [ ] 6.3 useAggregation - 数据聚合逻辑
- [ ] 6.4 useRealtime - 实时刷新逻辑
- [ ] 6.5 useTheme - 主题切换逻辑
- [ ] 6.6 useCurrency - 货币切换逻辑

## 7. 通用组件开发 (Common Components)
- [ ] 7.1 Loading 组件（Skeleton）
- [ ] 7.2 ErrorBoundary 组件
- [ ] 7.3 EmptyState 组件
- [ ] 7.4 RefreshButton 组件
- [ ] 7.5 ThemeToggle 组件
- [ ] 7.6 CurrencyToggle 组件

## 8. 筛选器组件开发 (Filter Components)
- [ ] 8.1 FilterBar 容器组件
- [ ] 8.2 ModelSelect 多选组件
- [ ] 8.3 DateRangePicker 组件
- [ ] 8.4 QuickDateSelect 快捷选项组件
- [ ] 8.5 筛选器防抖处理

## 9. 总览卡片组件开发 (Overview Cards)
- [ ] 9.1 OverviewCards 容器组件
- [ ] 9.2 KPICard 单卡片组件
- [ ] 9.3 数值格式化显示
- [ ] 9.4 环比趋势指示器（可选）
- [ ] 9.5 响应式布局

## 10. 时间趋势图表开发 (Trend Chart)
- [ ] 10.1 TrendChart 容器组件
- [ ] 10.2 分时/累计切换控件
- [ ] 10.3 指标切换控件
- [ ] 10.4 LineChart 图表实现
- [ ] 10.5 Tooltip 自定义
- [ ] 10.6 时间轴粒度自适应
- [ ] 10.7 Y轴动态缩放
- [ ] 10.8 响应式布局

## 11. 分模型图表开发 (Model Breakdown)
- [ ] 11.1 ModelBreakdown 容器组件
- [ ] 11.2 模型选择器（Top 5 默认）
- [ ] 11.3 多线折线图实现
- [ ] 11.4 堆叠面积图实现（未选模型时）
- [ ] 11.5 分时/累计切换
- [ ] 11.6 Legend 图例组件
- [ ] 11.7 响应式布局

## 12. 实时数据功能 (Realtime)
- [ ] 12.1 定时轮询逻辑
- [ ] 12.2 最后更新时间显示
- [ ] 12.3 手动刷新按钮
- [ ] 12.4 刷新状态指示

## 13. 布局与样式 (Layout & Styling)
- [ ] 13.1 根布局组件（layout.tsx）
- [ ] 13.2 主页面布局（page.tsx）
- [ ] 13.3 全局样式（globals.css）
- [ ] 13.4 暗色模式样式
- [ ] 13.5 响应式断点配置

## 14. 测试 (Testing)
- [ ] 14.1 工具函数单元测试
- [ ] 14.2 Hooks 单元测试
- [ ] 14.3 组件测试
- [ ] 14.4 API Routes 测试
- [ ] 14.5 覆盖率 90%+ 目标

## 15. 文档与部署 (Documentation & Deployment)
- [ ] 15.1 JSDoc 文档生成
- [ ] 15.2 README.md 完善
- [ ] 15.3 环境变量文档
- [ ] 15.4 部署配置（Vercel）

---

## 统计
- **总任务数**: 85
- **已完成**: 0
- **进行中**: 0
- **待开始**: 85
