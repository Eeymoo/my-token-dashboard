import cron from 'node-cron'
import { fetchLogs } from './api-client'
import { insertLog, query, initDatabase, testConnection } from './db'
import dayjs from 'dayjs'

// 数据同步器类
class DataSync {
  private isSyncing = false
  private lastSyncTime: Date | null = null
  private metadataTableReady = false
  private scheduledTask: cron.ScheduledTask | null = null

  private getSyncIntervalHours() {
    return Math.max(1, parseInt(process.env.SYNC_INTERVAL_HOURS || '1'))
  }

  private getNextSyncTime(baseTime: Date | null = this.lastSyncTime) {
    if (!baseTime) return null
    return dayjs(baseTime).add(this.getSyncIntervalHours(), 'hour').toDate()
  }

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
      await this.ensureMetadataTable()
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
    const completedAt = new Date()

    try {
      console.log('🔄 开始数据同步...')

      // 获取上次同步的时间（如果没有，则从2026-01-01开始）
      const lastSync = await this.getLastSyncTime()
      const startDate = lastSync ? dayjs(lastSync).format('YYYY-MM-DD') : '2026-01-01'
      const endDate = dayjs(completedAt).format('YYYY-MM-DD')

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

        if (!response?.success) {
          console.log('⚠️ API 响应失败或格式异常，停止同步')
          break
        }

        const logs = response.data.logs || []

        if (logs.length === 0) {
          console.log('✅ 数据获取完成')
          break
        }

        console.log(`📥 获取到 ${logs.length} 条日志`)

        // 处理并存储日志
        for (const log of logs) {
          try {
            const dbLog = this.transformLogToDbFormat(log)
            await insertLog(dbLog)
            totalSynced++
          } catch (error) {
            console.error('❌ 插入日志失败:', error)
          }
        }

        const currentPage = Number(response.data.pagination.page || page)
        const totalPages = Number(response.data.pagination.totalPages || 0)

        if (!totalPages || currentPage >= totalPages) {
          break
        }

        page = currentPage + 1
        await this.delay(1000)
      }

      await this.updateSyncMetadata(completedAt)

      const duration = Date.now() - startTime
      console.log(`✅ 数据同步完成，共同步 ${totalSynced} 条记录，耗时 ${duration}ms`)

      try {
        await this.ensureMetadataTable()
        await this.aggregateData()
      } catch (aggError) {
        console.error('❌ 数据聚合失败:', aggError)
      }
    } catch (error) {
      console.error('❌ 数据同步失败:', error)
    } finally {
      this.isSyncing = false
    }
  }


  private async ensureMetadataTable() {
    if (this.metadataTableReady) return

    await query(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        id INT AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(100) UNIQUE NOT NULL,
        \`value\` TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `)

    this.metadataTableReady = true
  }

  // 将日志转换为数据库格式
  private transformLogToDbFormat(log: any) {
    const toNullableString = (value: any, fallback: string | null = null) => {
      if (value === null || value === undefined) return fallback
      const str = String(value).trim()
      return str.length > 0 ? str : fallback
    }

    const toNumberOr = (value: any, fallback: number) => {
      const num = Number(value)
      return Number.isFinite(num) ? num : fallback
    }

    const modelId = toNullableString(log.model?.modelId || log.model_id || log.model || log.model_name, 'unknown')!
    const modelName = toNullableString(log.model?.modelName || log.model_name || log.modelName || modelId, '未知模型')!
    const provider = toNullableString(log.model?.provider || log.provider, 'unknown')!
    const category = toNullableString(log.model?.category || log.category, 'text')!
    const userId = toNullableString(log.user?.userId || log.user_id || log.userId)
    const userName = toNullableString(log.user?.userName || log.username || log.user_name || log.userName)
    const teamId = toNullableString(log.user?.teamId || log.team_id || log.teamId)

    const fallbackTotalTokens =
      toNumberOr(log.prompt_tokens ?? log.promptTokens, 0) +
      toNumberOr(log.completion_tokens ?? log.completionTokens, 0)

    const totalTokens = toNumberOr(
      log.tokens?.totalTokens ??
      log.total_tokens ??
      log.totalTokens ??
      log.usage ??
      fallbackTotalTokens,
      0
    )

    const promptTokens = toNumberOr(
      log.tokens?.promptTokens ??
      log.prompt_tokens ??
      log.promptTokens,
      0
    )

    const completionTokens = toNumberOr(
      log.tokens?.completionTokens ??
      log.completion_tokens ??
      log.completedTokens ??
      log.completionTokens,
      0
    )

    const totalCost = toNumberOr(
      log.cost?.totalCost ??
      log.total_cost ??
      log.totalCost,
      0
    )

    const promptCost = toNumberOr(
      log.cost?.promptCost ??
      log.prompt_cost ??
      log.promptCost,
      0
    )

    const completionCost = toNumberOr(
      log.cost?.completionCost ??
      log.completion_cost ??
      log.completionCost,
      0
    )

    const requestCount = Math.max(1, toNumberOr(
      log.requests?.requestCount ??
      log.request_count ??
      log.requestCount,
      1
    ))

    const successCount = toNumberOr(
      log.requests?.successCount ??
      log.success_count ??
      log.successCount ??
      ((log.code || log.status_code || log.statusCode || 200) < 400 ? requestCount : 0),
      0
    )

    const errorCount = toNumberOr(
      log.requests?.errorCount ??
      log.error_count ??
      log.errorCount ??
      ((log.code || log.status_code || log.statusCode || 200) >= 400 ? requestCount : 0),
      0
    )

    const avgLatencyRaw = log.requests?.avgLatency ?? log.latency ?? log.avg_latency ?? log.avgLatency ?? log.use_time
    const avgLatency = Number.isFinite(Number(avgLatencyRaw)) ? Number(avgLatencyRaw) : null

    const timestampSource = typeof log.created_at === 'number'
      ? dayjs.unix(log.created_at).toISOString()
      : toNullableString(log.timestamp || log.created_at || log.createdAt)

    const timestamp = dayjs(timestampSource || new Date().toISOString()).format('YYYY-MM-DD HH:mm:ss')

    const endpoint = (() => {
      const direct = toNullableString(log.endpoint || log.path)
      if (direct) return direct
      if (typeof log.other === 'string') {
        try {
          const parsed = JSON.parse(log.other)
          return toNullableString(parsed.request_path, '/api/unknown')!
        } catch {
          return '/api/unknown'
        }
      }
      return '/api/unknown'
    })()

    return {
      logId: toNullableString(log.logId || log.id || log.log_id || log.request_id, `log_${Date.now()}_${Math.random()}`)!,
      timestamp,
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
      endpoint,
      statusCode: toNumberOr(log.statusCode || log.status_code || log.code, 200),
    }
  }

  // 获取上次同步时间
  private async getLastSyncTime(): Promise<string | null> {
    try {
      await this.ensureMetadataTable()
      const result = await query(
        "SELECT `value` FROM sync_metadata WHERE `key` = 'last_sync_time'"
      ) as any[]

      if (result.length > 0) {
        return result[0].value
      }

      return null
    } catch (error) {
      console.warn('获取上次同步时间失败，使用默认时间:', error)
      return null
    }
  }

  private async getLastCompletedSyncTime(): Promise<Date | null> {
    try {
      await this.ensureMetadataTable()
      const result = await query(
        "SELECT `value` FROM sync_metadata WHERE `key` = 'last_completed_sync_time'"
      ) as any[]

      if (result.length === 0 || !result[0].value) {
        return null
      }

      const parsed = dayjs(result[0].value)
      return parsed.isValid() ? parsed.toDate() : null
    } catch (error) {
      console.warn('获取最后完成同步时间失败:', error)
      return null
    }
  }

  private async updateSyncMetadata(completedAt: Date) {
    const completedAtValue = dayjs(completedAt).format('YYYY-MM-DD HH:mm:ss')
    const nextSyncValue = dayjs(completedAt).add(this.getSyncIntervalHours(), 'hour').format('YYYY-MM-DD HH:mm:ss')

    try {
      await this.ensureMetadataTable()
      await query(
        `INSERT INTO sync_metadata (
          \`key\`, \`value\`
        ) VALUES
          ('last_sync_time', ?),
          ('last_completed_sync_time', ?),
          ('next_sync_time', ?),
          ('sync_interval_hours', ?)
        ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
        [completedAtValue, completedAtValue, nextSyncValue, String(this.getSyncIntervalHours())]
      )
      this.lastSyncTime = completedAt
    } catch (error) {
      console.error('更新同步时间失败:', error)
    }
  }

  async getSyncStatus() {
    const lastCompletedSyncTime = await this.getLastCompletedSyncTime()
    const nextSyncTime = this.getNextSyncTime(lastCompletedSyncTime)

    return {
      isSyncing: this.isSyncing,
      lastCompletedSyncTime,
      nextSyncTime,
      syncIntervalHours: this.getSyncIntervalHours(),
    }
  }

  // 聚合数据（按小时/天/周/月）
  async aggregateData() {
    console.log('🧮 开始数据聚合...')

    try {
      await query("SET SESSION sql_mode = REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', '')")

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

    const format = periodType === 'hour' ? '%Y-%m-%d %H:00:00' :
                  periodType === 'day' ? '%Y-%m-%d 00:00:00' :
                  periodType === 'week' ? '%Y-%u 00:00:00' :
                  '%Y-%m-01 00:00:00'

    const sql = `
      INSERT INTO aggregated_data (
        period_type, period_start, period_end, model_id,
        total_tokens, total_cost, request_count, success_count, error_count, avg_latency
      )
      SELECT
        ? as period_type,
        grouped.period_start,
        DATE_FORMAT(DATE_ADD(grouped.period_start, INTERVAL 1 ${periodMap[periodType]}), ?) as period_end,
        grouped.model_id,
        grouped.total_tokens,
        grouped.total_cost,
        grouped.request_count,
        grouped.success_count,
        grouped.error_count,
        grouped.avg_latency
      FROM (
        SELECT
          STR_TO_DATE(DATE_FORMAT(timestamp, ?), '%Y-%m-%d %H:%i:%s') as period_start,
          model_id,
          SUM(total_tokens) as total_tokens,
          SUM(total_cost) as total_cost,
          SUM(request_count) as request_count,
          SUM(success_count) as success_count,
          SUM(error_count) as error_count,
          AVG(avg_latency) as avg_latency
        FROM api_logs
        WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        GROUP BY STR_TO_DATE(DATE_FORMAT(timestamp, ?), '%Y-%m-%d %H:%i:%s'), model_id
      ) grouped
      ON DUPLICATE KEY UPDATE
        total_tokens = VALUES(total_tokens),
        total_cost = VALUES(total_cost),
        request_count = VALUES(request_count),
        success_count = VALUES(success_count),
        error_count = VALUES(error_count),
        avg_latency = VALUES(avg_latency),
        updated_at = CURRENT_TIMESTAMP
    `

    await query(sql, [periodType, format, format, format])
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

  async hydrateLastSyncTime() {
    if (this.lastSyncTime) {
      return this.lastSyncTime
    }

    this.lastSyncTime = await this.getLastCompletedSyncTime()
    return this.lastSyncTime
  }

  // 获取同步状态
  getIsSyncingPublic(): boolean {
    return this.isSyncing
  }

  // 启动定时同步
  startScheduledSync() {
    const intervalHours = this.getSyncIntervalHours()

    if (intervalHours <= 0) {
      console.log('⏸️  定时同步已禁用')
      this.stopScheduledSync()
      return
    }

    if (this.scheduledTask) {
      console.log('ℹ️ 定时同步任务已存在，跳过重复启动')
      return
    }

    // 转换为 cron 表达式（每小时运行一次）
    const cronExpression = `0 */${intervalHours} * * *`

    console.log(`⏰ 设置定时同步: ${cronExpression} (每 ${intervalHours} 小时)`)

    this.scheduledTask = cron.schedule(cronExpression, () => {
      console.log('⏰ 定时同步任务触发')
      this.syncData().catch(error => {
        console.error('定时同步执行失败:', error)
      })
    })

    // 立即执行一次同步
    console.log('🚀 立即执行首次同步...')
    this.syncData().catch(error => {
      console.error('首次定时同步执行失败:', error)
    })
  }

  stopScheduledSync() {
    if (!this.scheduledTask) {
      return
    }

    this.scheduledTask.stop()
    this.scheduledTask = null
  }
}

// 导出单例实例
const dataSync = new DataSync()
export default dataSync