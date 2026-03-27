import cron from 'node-cron'
import { fetchLogs } from './api-client'
import { insertLog, query, initDatabase, testConnection, upsertAggregatedRange } from './db'
import dayjs from 'dayjs'

const AGGREGATION_PERIODS = ['hour', 'day', 'week', 'month'] as const
const RECENT_SYNC_MINUTES = 30

type AggregationPeriod = typeof AGGREGATION_PERIODS[number]

type SyncWindow = {
  start: string
  end: string
}

type SyncOptions = {
  fullSync?: boolean
}

// 数据同步器类
class DataSync {
  private isSyncing = false
  private lastSyncTime: Date | null = null
  private metadataTableReady = false

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
  async syncData(options?: SyncOptions) {
    if (this.isSyncing) {
      console.log('⚠️  同步已在运行中，跳过本次同步')
      return
    }

    this.isSyncing = true
    const startTime = Date.now()

    try {
      console.log('🔄 开始数据同步...')

      const lastSync = await this.getLastSyncTime()
      const fullSync = options?.fullSync === true
      const isInitialSync = !lastSync
      const syncStart = (isInitialSync || fullSync)
        ? dayjs('2026-01-01 00:00:00')
        : dayjs().subtract(RECENT_SYNC_MINUTES, 'minute')
      const syncEnd = dayjs()
      const startDate = syncStart.format('YYYY-MM-DD')
      const endDate = syncEnd.format('YYYY-MM-DD')
      const syncWindow: SyncWindow = {
        start: syncStart.format('YYYY-MM-DD HH:mm:ss'),
        end: syncEnd.format('YYYY-MM-DD HH:mm:ss'),
      }

      console.log(`📅 同步时间范围: ${syncWindow.start} 至 ${syncWindow.end}`)

      let page = 1
      const pageSize = 100
      let totalSynced = 0

      while (true) {
        console.log(`📄 获取第 ${page} 页数据...`)

        const response = await fetchLogs({
          startDate,
          endDate,
          startTimestamp: syncWindow.start,
          endTimestamp: syncWindow.end,
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

      await this.updateLastSyncTime(syncEnd.format('YYYY-MM-DD HH:mm:ss'))

      const duration = Date.now() - startTime
      console.log(`✅ 数据同步完成，共同步 ${totalSynced} 条记录，耗时 ${duration}ms`)

      if (totalSynced > 0) {
        this.processSyncedRange(syncWindow).catch((error) => {
          console.error('❌ 后台计算失败:', error)
        })
      }
    } catch (error) {
      console.error('❌ 数据同步失败:', error)
    } finally {
      this.isSyncing = false
      this.lastSyncTime = new Date()
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

  private async processSyncedRange(syncWindow: SyncWindow) {
    console.log(`🧮 开始后台处理: ${syncWindow.start} - ${syncWindow.end}`)

    await this.ensureMetadataTable()
    await this.backfillCosts(syncWindow)
    await this.aggregateData(syncWindow)
    await this.updateProcessingTime(syncWindow.end)

    console.log('✅ 后台处理完成')
  }

  private async backfillCosts(syncWindow: SyncWindow) {
    await query(
      `UPDATE api_logs
       SET prompt_cost = 0,
           completion_cost = 0,
           total_cost = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE timestamp BETWEEN STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s') AND STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s')`,
      [syncWindow.start, syncWindow.end]
    )
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
      totalCost: 0,
      promptCost: 0,
      completionCost: 0,
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

  private async updateProcessingTime(time: string) {
    await query(
      "INSERT INTO sync_metadata (`key`, `value`) VALUES ('last_processed_time', ?) ON DUPLICATE KEY UPDATE `value` = ?",
      [time, time]
    )
  }

  // 更新最后同步时间
  private async updateLastSyncTime(time: string) {
    try {
      await this.ensureMetadataTable()
      await query(
        "INSERT INTO sync_metadata (`key`, `value`) VALUES ('last_sync_time', ?) " +
        "ON DUPLICATE KEY UPDATE `value` = ?",
        [time, time]
      )
    } catch (error) {
      console.error('更新同步时间失败:', error)
    }
  }

  // 聚合数据（按小时/天/周/月）
  async aggregateData(syncWindow: SyncWindow) {
    console.log('🧮 开始数据聚合...')

    try {
      await query("SET SESSION sql_mode = REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', '')")

      for (const period of AGGREGATION_PERIODS) {
        await this.aggregateByPeriod(period, syncWindow)
      }

      console.log('✅ 数据聚合完成')
    } catch (error) {
      console.error('❌ 数据聚合失败:', error)
    }
  }

  // 按时间段聚合
  private async aggregateByPeriod(periodType: AggregationPeriod, syncWindow: SyncWindow) {
    const rangeStart = this.getPeriodBoundary(syncWindow.start, periodType, false)
    const rangeEnd = this.getPeriodBoundary(syncWindow.end, periodType, true)

    await upsertAggregatedRange(periodType, rangeStart, rangeEnd)
    console.log(`✅ ${periodType}聚合完成`)
  }

  private getPeriodBoundary(value: string, periodType: AggregationPeriod, endOfPeriod: boolean) {
    const date = dayjs(value)

    if (periodType === 'hour') {
      return (endOfPeriod ? date.endOf('hour') : date.startOf('hour')).format('YYYY-MM-DD HH:mm:ss')
    }

    if (periodType === 'day') {
      return (endOfPeriod ? date.endOf('day') : date.startOf('day')).format('YYYY-MM-DD HH:mm:ss')
    }

    if (periodType === 'week') {
      const weekStart = date.day(0).startOf('day')
      const weekEnd = weekStart.add(6, 'day').endOf('day')
      return (endOfPeriod ? weekEnd : weekStart).format('YYYY-MM-DD HH:mm:ss')
    }

    return (endOfPeriod ? date.endOf('month') : date.startOf('month')).format('YYYY-MM-DD HH:mm:ss')
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

  async rebuildDerivedData(startDate: string, endDate: string) {
    const syncWindow: SyncWindow = {
      start: `${startDate} 00:00:00`,
      end: `${endDate} 23:59:59`,
    }

    await this.processSyncedRange(syncWindow)
  }

  // 启动定时同步
  startScheduledSync() {
    const intervalHours = parseInt(process.env.SYNC_INTERVAL_HOURS || '1')

    if (intervalHours <= 0) {
      console.log('⏸️  定时同步已禁用')
      return
    }

    const cronExpression = `0 */${intervalHours} * * *`

    console.log(`⏰ 设置定时同步: ${cronExpression} (每 ${intervalHours} 小时)`)

    cron.schedule(cronExpression, () => {
      console.log('⏰ 定时同步任务触发')
      this.syncData()
    })

    console.log('🚀 立即执行首次同步...')
    this.syncData()
  }
}

// 导出单例实例
const dataSync = new DataSync()
export default dataSync
