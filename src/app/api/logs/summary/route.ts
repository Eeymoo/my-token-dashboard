import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') || '2026-01-01'
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0]
    const models = (searchParams.get('models') || '')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean)

    const summaryParams: any[] = ['day', `${startDate} 00:00:00`, `${endDate} 23:59:59`]
    let summaryFilter = 'WHERE period_type = ? AND period_start BETWEEN ? AND ?'

    if (models.length > 0) {
      const placeholders = models.map(() => '?').join(', ')
      summaryFilter += ` AND model_id IN (${placeholders})`
      summaryParams.push(...models)
    }

    const summaryResult = await query(
      `SELECT
        SUM(total_tokens) as totalTokens,
        SUM(total_cost) as totalCost,
        SUM(request_count) as totalRequests,
        SUM(success_count) as successRequests,
        SUM(error_count) as errorRequests,
        AVG(avg_latency) as avgLatency
       FROM aggregated_data ${summaryFilter}`,
      summaryParams
    ) as any[]

    const summary = summaryResult[0] || {
      totalTokens: 0,
      totalCost: 0,
      totalRequests: 0,
      successRequests: 0,
      errorRequests: 0,
      avgLatency: 0,
    }

    const breakdownParams: any[] = [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
    let breakdownFilter = 'WHERE timestamp BETWEEN ? AND ?'

    if (models.length > 0) {
      const placeholders = models.map(() => '?').join(', ')
      breakdownFilter += ` AND model_id IN (${placeholders})`
      breakdownParams.push(...models)
    }

    const breakdownResult = await query(
      `SELECT
        model_id,
        MAX(model_name) as model_name,
        SUM(total_tokens) as totalTokens,
        SUM(total_cost) as totalCost,
        SUM(request_count) as requestCount
       FROM api_logs ${breakdownFilter}
       GROUP BY model_id
       ORDER BY totalTokens DESC
       LIMIT 20`,
      breakdownParams
    ) as any[]

    const modelBreakdown = breakdownResult.map((row: any) => ({
      modelId: row.model_id,
      modelName: row.model_name,
      totalTokens: Number(row.totalTokens) || 0,
      totalCost: Number(row.totalCost) || 0,
      requestCount: Number(row.requestCount) || 0,
    }))

    const timeSeriesResult = await query(
      `SELECT
        DATE(period_start) as date,
        SUM(total_tokens) as totalTokens,
        SUM(total_cost) as totalCost,
        SUM(request_count) as requestCount
       FROM aggregated_data ${summaryFilter}
       GROUP BY DATE(period_start)
       ORDER BY date`,
      summaryParams
    ) as any[]

    const timeSeries = timeSeriesResult.map((row: any) => ({
      date: row.date,
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
