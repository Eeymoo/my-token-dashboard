import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import dayjs from 'dayjs'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') || '2026-01-01'
    const endDate = searchParams.get('endDate') || dayjs().format('YYYY-MM-DD')
    const models = searchParams.get('models')?.split(',') || []
    const granularity = searchParams.get('granularity') as 'hour' | 'day' | 'week' | 'month' | undefined
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '100')
    const offset = (page - 1) * pageSize

    // 构建查询条件
    let whereClause = 'WHERE timestamp BETWEEN ? AND ?'
    const queryParams: any[] = [startDate, endDate]

    if (models.length > 0) {
      whereClause += ' AND model_id IN (?)'
      queryParams.push(models)
    }

    // 获取总记录数
    const countResult = await query(
      `SELECT COUNT(*) as total FROM api_logs ${whereClause}`,
      queryParams
    ) as any[]

    const total = countResult[0]?.total || 0

    // 获取数据
    const dataResult = await query(
      `SELECT * FROM api_logs ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      [...queryParams, pageSize, offset]
    ) as any[]

    // 转换数据格式
    const logs = dataResult.map((row: any) => ({
      logId: row.log_id,
      timestamp: row.timestamp,
      model: {
        modelId: row.model_id,
        modelName: row.model_name,
        provider: row.provider,
        category: row.category,
      },
      user: row.user_id ? {
        userId: row.user_id,
        userName: row.user_name,
        teamId: row.team_id,
      } : undefined,
      tokens: {
        totalTokens: row.total_tokens,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
      },
      cost: {
        totalCost: row.total_cost,
        promptCost: row.prompt_cost,
        completionCost: row.completion_cost,
      },
      requests: {
        requestCount: row.request_count,
        successCount: row.success_count,
        errorCount: row.error_count,
        avgLatency: row.avg_latency,
      },
      endpoint: row.endpoint,
      statusCode: row.status_code,
    }))

    return NextResponse.json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    })

  } catch (error) {
    console.error('获取日志数据失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '获取日志数据失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    )
  }
}

// 支持 POST 请求用于手动添加日志（测试用）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证必要字段
    if (!body.timestamp || !body.modelId) {
      return NextResponse.json(
        { success: false, error: '缺少必要字段' },
        { status: 400 }
      )
    }

    const sql = `
      INSERT INTO api_logs (
        log_id, timestamp, model_id, model_name, provider, category,
        user_id, user_name, team_id, total_tokens, prompt_tokens, completion_tokens,
        total_cost, prompt_cost, completion_cost, request_count, success_count,
        error_count, avg_latency, endpoint, status_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    const params = [
      body.logId || `log_${Date.now()}_${Math.random()}`,
      body.timestamp,
      body.modelId,
      body.modelName || '未知模型',
      body.provider || 'unknown',
      body.category || 'text',
      body.userId,
      body.userName,
      body.teamId,
      body.totalTokens || 0,
      body.promptTokens || 0,
      body.completionTokens || 0,
      body.totalCost || 0,
      body.promptCost || 0,
      body.completionCost || 0,
      body.requestCount || 1,
      body.successCount || 1,
      body.errorCount || 0,
      body.avgLatency,
      body.endpoint || '/api/unknown',
      body.statusCode || 200,
    ]

    await query(sql, params)

    return NextResponse.json({
      success: true,
      message: '日志添加成功',
    })

  } catch (error) {
    console.error('添加日志失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '添加日志失败',
      },
      { status: 500 }
    )
  }
}