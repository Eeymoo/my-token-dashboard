/**
 * API 相关类型定义
 * 遵循：指标（metrics）作为数值，维度（dimensions）作为非数值
 */

// ==================== 维度（非数值） ====================
export interface TimeDimension {
  timestamp: string // ISO 8601 格式
  date: string // YYYY-MM-DD
  hour?: number // 0-23
  day?: number // 1-31
  month?: number // 1-12
  year?: number
  week?: number // 周数
}

export interface ModelDimension {
  modelId: string
  modelName: string
  provider: string
  category: 'text' | 'image' | 'audio' | 'video'
}

export interface UserDimension {
  userId: string
  userName?: string
  teamId?: string
}

// ==================== 指标（数值） ====================
export interface TokenMetrics {
  totalTokens: number // 总 Token 数
  promptTokens: number // Prompt Token 数
  completionTokens: number // Completion Token 数
}

export interface CostMetrics {
  totalCost: number // 总花费（美元）
  promptCost: number // Prompt 花费
  completionCost: number // Completion 花费
}

export interface RequestMetrics {
  requestCount: number // 请求次数
  successCount: number // 成功请求数
  errorCount: number // 错误请求数
  avgLatency: number // 平均延迟（毫秒）
}

// ==================== 组合数据记录 ====================
export interface LogRecord {
  // 维度
  time: TimeDimension
  model: ModelDimension
  user?: UserDimension

  // 指标
  tokens: TokenMetrics
  cost: CostMetrics
  requests: RequestMetrics

  // 元数据
  logId: string
  endpoint: string
  statusCode: number
}

// ==================== API 请求参数 ====================
export interface LogQueryParams {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  models?: string[] // 模型ID筛选
  granularity?: 'hour' | 'day' | 'week' | 'month' // 聚合粒度
  cumulative?: boolean // 是否返回累计数据
  page?: number
  pageSize?: number
}

// ==================== API 响应 ====================
export interface LogQueryResponse {
  success: boolean
  data: {
    logs: LogRecord[]
    summary: {
      totalTokens: number
      totalCost: number
      totalRequests: number
      modelBreakdown: Array<{
        modelId: string
        modelName: string
        totalTokens: number
        totalCost: number
        requestCount: number
      }>
    }
    pagination: {
      page: number
      pageSize: number
      total: number
      totalPages: number
    }
  }
  error?: string
}

// ==================== 聚合数据 ====================
export interface AggregatedDataPoint {
  // 维度
  timeLabel: string // 时间标签，如 "2024-01-01", "2024-W01"
  timestamp: string // ISO 时间戳

  // 指标
  metrics: {
    totalTokens: number
    totalCost: number
    requestCount: number
  }

  // 分模型数据（可选）
  byModel?: Record<string, {
    totalTokens: number
    totalCost: number
    requestCount: number
  }>
}

// ==================== 实时数据 ====================
export interface RealtimeUpdate {
  timestamp: string
  lastHour: {
    totalTokens: number
    totalCost: number
    requestCount: number
  }
  topModels: Array<{
    modelId: string
    modelName: string
    totalTokens: number
  }>
}