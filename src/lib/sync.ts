import cron from 'node-cron'
import { fetchLogs } from './api-client'
import { insertLog, query, initDatabase, testConnection } from './db'
import dayjs from 'dayjs'

// 数据同步器类
class DataSync {
  private isSyncing = false
  private lastSyncTime: Date | null = null

  // 初始化同步器
  async initialize() {
    console.log('🔄 初始化数据同步器...')

    // 测试数据库连接
    const dbConnected = await testConnection()
    if (!dbConnected) {
      console.error('❌ 数据库连接失败，无法初始化同步器')
      return false
    }

    // 初始化数据库表
    try {
      await initDatabase()
    } catch (error) {
      console.error('❌ 数据库表初始化失败:', error)
      return false
    }

    console.log('✅ 数据同步器初始化完成')
    return true
  }

  // 执行一次数据同步
  async syncData() {
    if (this.isSyncing) {
      console.log('⚠️  同步已在运行中，跳过本次同步')
      return
    }

    this.isSyncing = true
    const startTime = Date.now()

    try {
      console.log('🔄 开始数据同步...')

      // 获取上次同步的时间（如果没有，则从2026-01-01开始）
      const lastSync = await this.getLastSyncTime()
      const startDate = lastSync || '2026-01-01'
      const endDate = dayjs().format('YYYY-MM-DD')

      console.log(`📅 同步时间范围: ${startDate} 至 ${endDate}`)

      // 从 API 获取数据
      // 这里需要根据实际 API 分页获取所有数据
      let page = 1
      const pageSize = 100
      let totalSynced = 0

      while (true) {
        console.log(`📄 获取第 ${page} 页数据...`)

        const response = await fetchLogs({
          startDate,
          endDate,
          page,
          pageSize,
        })

        if (!response.success || !response.data?.logs?.length) {
          console.log('✅ 数据获取完成')
          break
        }

        const logs = response.data.logs
        console.log(`📥 获取到 ${logs.length} 条日志`)

        // 处理并存储日志
        for (const log of logs) {
          try {
            // 转换日志格式以适应数据库
            const dbLog = this.transformLogToDbFormat(log)
            await insertLog(dbLog)
            totalSynced++
          } catch (error) {
            console.error('❌ 插入日志失败:', error)
          }
        }

        // 检查是否还有更多数据
        const pagination = response.data.pagination
        if (!pagination || page >= pagination.totalPages) {
          break
        }

        page++
        // 避免请求过于频繁
        await this.delay(1000)
      }

      // 更新最后同步时间
      await this.updateLastSyncTime(endDate)

      const duration = Date.now() - startTime
      console.log(`✅ 数据同步完成，共同步 ${totalSynced} 条记录，耗时 ${duration}ms`)

      // 触发数据聚合
      await this.aggregateData()

    } catch (error) {
      console.error('❌ 数据同步失败:', error)
    } finally {
      this.isSyncing = false
      this.lastSyncTime = new Date()
    }
  }

  // 将日志转换为数据库格式
  private transformLogToDbFormat(log: any) {
    const modelId = log.model?.modelId || log.model_id || log.model || log.model_name || 'unknown'
    const modelName = log.model?.modelName || log.model_name || log.modelName || modelId || '未知模型'
    const provider = log.model?.provider || log.provider || 'unknown'
    const category = log.model?.category || log.category || 'text'
    const userId = log.user?.userId || log.user_id || log.userId
    const userName = log.user?.userName || log.username || log.user_name || log.userName
    const teamId = log.user?.teamId || log.team_id || log.teamId

    const fallbackTotalTokens =
      (Number(log.prompt_tokens ?? log.promptTokens ?? 0) || 0) +
      (Number(log.completion_tokens ?? log.completionTokens ?? 0) || 0)

    const totalTokens = Number(
      log.tokens?.totalTokens ??
      log.total_tokens ??
      log.totalTokens ??
      log.usage ??
      fallbackTotalTokens
    ) || 0

    const promptTokens = Number(
      log.tokens?.promptTokens ??
      log.prompt_tokens ??
      log.promptTokens ??
      0
    ) || 0

    const completionTokens = Number(
      log.tokens?.completionTokens ??
      log.completion_tokens ??
      log.completionTokens ??
      0
    ) || 0

    const totalCost = Number(
      log.cost?.totalCost ??
      log.total_cost ??
      log.totalCost ??
      log.quota ??
      0
    ) || 0

    const promptCost = Number(
      log.cost?.promptCost ??
      log.prompt_cost ??
      log.promptCost ??
      0
    ) || 0

    const completionCost = Number(
      log.cost?.completionCost ??
      log.completion_cost ??
      log.completionCost ??
      0
    ) || 0

    const requestCount = Number(
      log.requests?.requestCount ??
      log.request_count ??
      log.requestCount ??
      1
    ) || 1

    const successCount = Number(
      log.requests?.successCount ??
      log.success_count ??
      log.successCount ??
      ((log.code || log.status_code || log.statusCode || 200) < 400 ? requestCount : 0)
    ) || 0

    const errorCount = Number(
      log.requests?.errorCount ??
      log.error_count ??
      log.errorCount ??
      ((log.code || log.status_code || log.statusCode || 200) >= 400 ? requestCount : 0)
    ) || 0

    const avgLatency = log.requests?.avgLatency ?? log.latency ?? log.avg_latency ?? log.avgLatency ?? null

    return {
      logId: log.logId || log.id || log.log_id || `log_${Date.now()}_${Math.random()}`,
      timestamp: log.timestamp || log.created_at || log.createdAt || new Date().toISOString(),
      modelId,
      modelName,
      provider,
      category,
      userId,
      userName,
      teamId,
      totalTokens,
      promptTokens,
      completionTokens,
      totalCost,
      promptCost,
      completionCost,
      requestCount,
      successCount,
      errorCount,
      avgLatency,
      endpoint: log.endpoint || log.path || '/api/unknown',
      statusCode: log.statusCode || log.status_code || log.code || 200,
    }
  }

  // 获取上次同步时间
  private async getLastSyncTime(): Promise<string | null> {
    try {
      const result = await query(
        "SELECT value FROM sync_metadata WHERE key = 'last_sync_time'"
      ) as any[]

      if (result.length > 0) {
        return result[0].value
      }

      // 如果表不存在，创建它
      await query(`
        CREATE TABLE IF NOT EXISTS sync_metadata (
          id INT AUTO_INCREMENT PRIMARY KEY,
          key VARCHAR(100) UNIQUE NOT NULL,
          value TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `)

      return null
    } catch (error) {
      console.warn('获取上次同步时间失败，使用默认时间:', error)
      return null
    }
  }

  // 更新最后同步时间
  private async updateLastSyncTime(time: string) {
    try {
      await query(
        "INSERT INTO sync_metadata (key, value) VALUES ('last_sync_time', ?) " +
        "ON DUPLICATE KEY UPDATE value = ?",
        [time, time]
      )
    } catch (error) {
      console.error('更新同步时间失败:', error)
    }
  }

  // 聚合数据（按小时/天/周/月）
  async aggregateData() {
    console.log('🧮 开始数据聚合...')

    try {
      // 按小时聚合
      await this.aggregateByPeriod('hour')

      // 按天聚合
      await this.aggregateByPeriod('day')

      // 按周聚合
      await this.aggregateByPeriod('week')

      // 按月聚合
      await this.aggregateByPeriod('month')

      console.log('✅ 数据聚合完成')
    } catch (error) {
      console.error('❌ 数据聚合失败:', error)
    }
  }

  // 按时间段聚合
  private async aggregateByPeriod(periodType: 'hour' | 'day' | 'week' | 'month') {
    const periodMap = {
      hour: 'HOUR',
      day: 'DAY',
      week: 'WEEK',
      month: 'MONTH',
    }

    const sql = `
      INSERT INTO aggregated_data (
        period_type, period_start, period_end, model_id,
        total_tokens, total_cost, request_count, success_count, error_count, avg_latency
      )
      SELECT
        ? as period_type,
        DATE_FORMAT(timestamp, ?) as period_start,
        DATE_FORMAT(DATE_ADD(timestamp, INTERVAL 1 ${periodMap[periodType]}), ?) as period_end,
        model_id,
        SUM(total_tokens) as total_tokens,
        SUM(total_cost) as total_cost,
        SUM(request_count) as request_count,
        SUM(success_count) as success_count,
        SUM(error_count) as error_count,
        AVG(avg_latency) as avg_latency
      FROM api_logs
      WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 90 DAY)
      GROUP BY period_start, model_id
      ON DUPLICATE KEY UPDATE
        total_tokens = VALUES(total_tokens),
        total_cost = VALUES(total_cost),
        request_count = VALUES(request_count),
        success_count = VALUES(success_count),
        error_count = VALUES(error_count),
        avg_latency = VALUES(avg_latency),
        updated_at = CURRENT_TIMESTAMP
    `

    const format = periodType === 'hour' ? '%Y-%m-%d %H:00:00' :
                  periodType === 'day' ? '%Y-%m-%d 00:00:00' :
                  periodType === 'week' ? '%Y-%u 00:00:00' :
                  '%Y-%m-01 00:00:00'

    await query(sql, [periodType, format, format])
    console.log(`✅ ${periodType}聚合完成`)
  }

  // 延迟函数
  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // 获取最后同步时间
  getLastSyncTimePublic(): Date | null {
    return this.lastSyncTime
  }

  // 获取同步状态
  getIsSyncingPublic(): boolean {
    return this.isSyncing
  }

  // 启动定时同步
  startScheduledSync() {
    const intervalHours = parseInt(process.env.SYNC_INTERVAL_HOURS || '1')

    if (intervalHours <= 0) {
      console.log('⏸️  定时同步已禁用')
      return
    }

    // 转换为 cron 表达式（每小时运行一次）
    const cronExpression = `0 */${intervalHours} * * *`

    console.log(`⏰ 设置定时同步: ${cronExpression} (每 ${intervalHours} 小时)`)

    cron.schedule(cronExpression, () => {
      console.log('⏰ 定时同步任务触发')
      this.syncData()
    })

    // 立即执行一次同步
    console.log('🚀 立即执行首次同步...')
    this.syncData()
  }
}

// 导出单例实例
const dataSync = new DataSync()
export default dataSync