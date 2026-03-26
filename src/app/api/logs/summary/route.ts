import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  try {
    const searchParams = _request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') || '2026-01-01'
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0]
    const models = (searchParams.get('models') || '')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean)

    // 构建查询条件
    let whereClause = 'WHERE timestamp BETWEEN ? AND ?'
    const queryParams: any[] = [`${startDate} 00:00:00`, `${endDate} 23:59:59`]

    if (models.length > 0) {
      const placeholders = models.map(() => '?').join(', ')
      whereClause += ` AND model_id IN (${placeholders})`
      queryParams.push(...models)
    }

    // 获取总览数据
    const summaryResult = await query(
      `SELECT
        SUM(total_tokens) as totalTokens,
        SUM(total_cost) as totalCost,
        SUM(request_count) as totalRequests,
        SUM(success_count) as successRequests,
        SUM(error_count) as errorRequests,
        AVG(avg_latency) as avgLatency
       FROM api_logs ${whereClause}`,
      queryParams
    ) as any[]

    const summary = summaryResult[0] || {
      totalTokens: 0,
      totalCost: 0,
      totalRequests: 0,
      successRequests: 0,
      errorRequests: 0,
      avgLatency: 0,
    }

    // 获取分模型数据
    const breakdownResult = await query(
      `SELECT
        model_id,
        model_name,
        SUM(total_tokens) as totalTokens,
        SUM(total_cost) as totalCost,
        SUM(request_count) as requestCount
       FROM api_logs ${whereClause}
       GROUP BY model_id, model_name
       ORDER BY totalTokens DESC
       LIMIT 20`,
      queryParams
    ) as any[]

    const modelBreakdown = breakdownResult.map((row: any) => ({
      modelId: row.model_id,
      modelName: row.model_name,
      totalTokens: row.totalTokens || 0,
      totalCost: row.totalCost || 0,
      requestCount: row.requestCount || 0,
    }))

    // 获取时间序列数据（按天）
    const timeSeriesResult = await query(
      `SELECT
        DATE(timestamp) as date,
        SUM(total_tokens) as totalTokens,
        SUM(total_cost) as totalCost,
        SUM(request_count) as requestCount
       FROM api_logs ${whereClause}
       GROUP BY DATE(timestamp)
       ORDER BY date`,
      queryParams
    ) as any[]

    const timeSeries = timeSeriesResult.map((row: any) => ({
      date: row.date,
      totalTokens: row.totalTokens || 0,
      totalCost: row.totalCost || 0,
      requestCount: row.requestCount || 0,
    }))

    // 获取分模型按小时时间序列
    const modelTimeSeriesResult = await query(
    // TODO(test): 为 modelTimeSeries 查询补充 API 测试
    // TODO(docs): README/API 文档同步说明 modelTimeSeries 字段
      `SELECT
        DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') as hour,
        model_id,
        model_name,
        SUM(total_tokens) as totalTokens,
        SUM(total_cost) as totalCost,
        SUM(request_count) as requestCount
       FROM api_logs ${whereClause}
       GROUP BY hour, model_id, model_name
       ORDER BY hour ASC`,
      queryParams
    ) as any[]

    const modelTimeSeries = modelTimeSeriesResult.map((row: any) => ({
      hour: row.hour,
      modelId: row.model_id,
      modelName: row.model_name || row.model_id,
      totalTokens: Number(row.totalTokens) || 0,
      totalCost: Number(row.totalCost) || 0,
      requestCount: Number(row.requestCount) || 0,
    }))

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalTokens: Number(summary.totalTokens) || 0,
          totalCost: Number(summary.totalCost) || 0,
          totalRequests: Number(summary.totalRequests) || 0,
          successRequests: Number(summary.successRequests) || 0,
          errorRequests: Number(summary.errorRequests) || 0,
          avgLatency: Number(summary.avgLatency) || 0,
        },
        modelBreakdown,
        timeSeries,
        modelTimeSeries,
      },
    })
  } catch (error) {
    console.error('获取汇总数据失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '获取汇总数据失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    )
  }
}
