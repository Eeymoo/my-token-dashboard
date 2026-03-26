import axios from 'axios'
import type { LogQueryParams, LogQueryResponse } from '@/types/api'

// 创建 axios 实例
const apiClient = axios.create({
  baseURL: process.env.NEW_API_BASE_URL || 'https://new-api.onemue.cn/',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.NEW_API_KEY || 'xmCgDsePJkpnrhsFmbp2SnqhiS8i'}`,
    'New-Api-User': process.env.NEW_API_USER || '',
  },
})

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // 可以在这里添加请求日志
    console.log(`🚀 请求: ${config.method?.toUpperCase()} ${config.url}`)
    return config
  },
  (error) => {
    console.error('❌ 请求错误:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ 响应: ${response.status} ${response.config.url}`)
    return response
  },
  (error) => {
    console.error('❌ 响应错误:', {
      url: error.config?.url,
      status: error.response?.status,
      message: error.message,
    })
    return Promise.reject(error)
  }
)

function normalizeLogResponse(raw: any, params: LogQueryParams): LogQueryResponse {
  const payload = raw || {}
  const data = payload.data || {}
  const paginationSource = data.pagination || {}
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data.logs) ? data.logs : []

  const page = Number(
    paginationSource.page ??
    paginationSource.current ??
    data.page ??
    data.current ??
    params.page ??
    1
  ) || 1

  const pageSize = Number(
    paginationSource.pageSize ??
    paginationSource.page_size ??
    data.pageSize ??
    data.page_size ??
    params.pageSize ??
    100
  ) || 100

  const total = Number(
    paginationSource.total ??
    data.total ??
    paginationSource.count ??
    data.count ??
    items.length
  ) || 0

  const totalPages = Number(
    paginationSource.totalPages ??
    paginationSource.total_pages ??
    paginationSource.pages ??
    data.total_pages ??
    Math.ceil(total / (pageSize || 1))
  ) || Math.max(1, Math.ceil(total / (pageSize || 1)))

  const success = typeof payload.success === 'boolean'
    ? payload.success
    : payload.code === 0 || payload.code === undefined

  return {
    success,
    data: {
      logs: items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
      summary: (
        data.summary || {
          totalTokens: 0,
          totalCost: 0,
          totalRequests: total,
          modelBreakdown: [],
        }
      ),
    },
    error: payload.error,
  }
}

// 获取日志数据
export async function fetchLogs(params: LogQueryParams): Promise<LogQueryResponse> {
  try {
    const response = await apiClient.get('/api/log/', {
      params: {
        page: params.page || 1,
        page_size: params.pageSize || 100,
        type: params.type,
        start_timestamp: params.startDate ? `${params.startDate} 00:00:00` : undefined,
        end_timestamp: params.endDate ? `${params.endDate} 23:59:59` : undefined,
        model_name: params.models?.length ? params.models.join(',') : undefined,
      },
    })

    return normalizeLogResponse(response.data, params)
  } catch (error) {
    console.error('获取日志数据失败:', error)
    throw error
  }
}

// 获取模型列表
export async function fetchModels() {
  try {
    // 这里需要根据 API 文档确定获取模型列表的端点
    // 假设没有专门的模型列表接口，从日志中提取
    // 暂时返回硬编码的模型列表
    // 未来可以根据实际 API 响应调整

    // 从日志中提取模型信息（示例逻辑）
    // 实际应根据 API 响应调整
    const models = [
      { modelId: 'gpt-4', modelName: 'GPT-4', provider: 'OpenAI', category: 'text' },
      { modelId: 'claude-3', modelName: 'Claude 3', provider: 'Anthropic', category: 'text' },
      { modelId: 'gemini-pro', modelName: 'Gemini Pro', provider: 'Google', category: 'text' },
      { modelId: 'llama-2', modelName: 'Llama 2', provider: 'Meta', category: 'text' },
      { modelId: 'dall-e-3', modelName: 'DALL-E 3', provider: 'OpenAI', category: 'image' },
    ]

    return {
      success: true,
      data: models,
    }
  } catch (error) {
    console.error('获取模型列表失败:', error)
    throw error
  }
}

// 获取汇总数据
export async function fetchSummary(_startDate: string, _endDate: string, _models?: string[]) {
  try {
    // 根据 API 文档调整
    // 暂时返回模拟数据
    // 未来需要根据实际 API 响应进行数据聚合

    // 这里需要根据实际响应进行数据聚合
    // 暂时返回模拟数据
    return {
      success: true,
      data: {
        totalTokens: 1234567,
        totalCost: 1234.56,
        totalRequests: 12345,
        modelBreakdown: [
          { modelId: 'gpt-4', modelName: 'GPT-4', totalTokens: 500000, totalCost: 500.0, requestCount: 5000 },
          { modelId: 'claude-3', modelName: 'Claude 3', totalTokens: 400000, totalCost: 400.0, requestCount: 4000 },
          { modelId: 'gemini-pro', modelName: 'Gemini Pro', totalTokens: 300000, totalCost: 300.0, requestCount: 3000 },
        ],
      },
    }
  } catch (error) {
    console.error('获取汇总数据失败:', error)
    throw error
  }
}

// 测试 API 连接
export async function testApiConnection() {
  try {
    const response = await apiClient.get('/api/log/', {
      params: {
        page_size: 1,
      },
    })
    console.log('✅ API 连接成功:', response.status)
    return { success: true, status: response.status }
  } catch (error: any) {
    console.error('❌ API 连接失败:', error.message)
    return { success: false, error: error.message }
  }
}

export default apiClient