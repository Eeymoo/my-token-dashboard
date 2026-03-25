import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import type { LogQueryParams, LogQueryResponse } from '@/types/api'

// API 基础配置
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''

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
export function useSummary(startDate: string, endDate: string, models?: string[]) {
  return useQuery({
    queryKey: ['summary', startDate, endDate, models],
    queryFn: async () => {
      const response = await axios.get('/api/logs/summary', {
        params: {
          startDate,
          endDate,
          models: models?.join(','),
        },
      })
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

// 手动触发同步
export function useSync() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (force?: boolean) => {
      const response = await axios.get('/api/sync', {
        params: { force },
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_KEY || 'default-admin-key'}`,
        },
      })
      return response.data
    },
    onSuccess: () => {
      // 使相关查询失效，重新获取数据
      queryClient.invalidateQueries({ queryKey: ['logs'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
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