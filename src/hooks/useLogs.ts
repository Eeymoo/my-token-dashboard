import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import type { LogQueryParams, LogQueryResponse, SummaryResponse } from '@/types/api'

// 获取日志数据
export function useLogs(params: LogQueryParams) {
  return useQuery({
    queryKey: ['logs', params],
    queryFn: async () => {
      const response = await axios.get<LogQueryResponse>('/api/logs', {
        params: {
          startDate: params.startDate,
          endDate: params.endDate,
          models: params.models?.join(','),
          page: params.page || 1,
          pageSize: params.pageSize || 100,
        },
      })
      return response.data
    },
    staleTime: 5 * 60 * 1000, // 5分钟
    enabled: !!params.startDate && !!params.endDate,
  })
}

// 获取汇总数据
// TODO(feat): [CHECKLIST 16.1/16.3] 解析后端新增的 modelTimeSeries 字段并提供友好的前端消费接口。
export function useSummary(startDate: string, endDate: string, models?: string[]) {
  return useQuery({
    queryKey: ['summary', startDate, endDate, models],
    queryFn: async () => {
      const response = await axios.get<SummaryResponse>('/api/logs/summary', {
        params: {
          startDate,
          endDate,
          models: models?.join(','),
        },
      })
      // TODO(feat): [CHECKLIST 16.3] 在此处整理 modelTimeSeries、timeSeries 等字段，预计算分时/累计数据和默认排序。
      return response.data
    },
    staleTime: 1 * 60 * 1000, // 1分钟
    enabled: !!startDate && !!endDate,
  })
}

// 获取模型列表
export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const response = await axios.get('/api/models')
      return response.data
    },
    staleTime: 10 * 60 * 1000, // 10分钟
  })
}

// 添加日志（测试用）
export function useAddLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (logData: any) => {
      const response = await axios.post('/api/logs', logData)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })
}

// 获取时间粒度
export function useTimeGranularity(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['granularity', startDate, endDate],
    queryFn: async () => {
      // 前端计算粒度，不需要 API 调用
      const start = new Date(startDate)
      const end = new Date(endDate)
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

      if (diffDays <= 7) return 'hour'
      if (diffDays <= 90) return 'day'
      if (diffDays <= 365) return 'week'
      return 'month'
    },
    enabled: !!startDate && !!endDate,
  })
}