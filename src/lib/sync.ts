import cron from 'node-cron'
import { fetchLogs } from './api-client'
import { insertLogs, query, initDatabase, testConnection } from './db'
import dayjs from 'dayjs'
import { syncModelPrices } from './model-pricing'

// 数据同步器类
class DataSync {
  private isSyncing = false
  private lastSyncTime: Date | null = null
  private metadataTableReady = false
  private scheduledTask: cron.ScheduledTask | null = null

  private getSyncCronExpression() {
    return process.env.SYNC_CRON || '0 * * * *'
  }

  private getWindowConcurrency() {
    const parsed = Number(process.env.SYNC_WINDOW_CONCURRENCY || '3')
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 3
  }

  private getRecentWindowDays() {
    const parsed = Number(process.env.SYNC_RECENT_WINDOW_DAYS || '7')
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 7
  }

  private getNextSyncTime() {
    return this.lastSyncTime
      ? dayjs(this.lastSyncTime).add(1, 'minute').toDate()
      : null
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

      const windows = this.buildDailySyncWindows(startDate, endDate)
      console.log(`🪟 本次同步拆分为 ${windows.length} 个时间窗口`)

      const pageSize = 100
      const requestType = 0
      const windowConcurrency = this.getWindowConcurrency()
      const recentWindowDays = this.getRecentWindowDays()
      const recentCutoffDate = dayjs(endDate).subtract(recentWindowDays - 1, 'day').format('YYYY-MM-DD')
      const prioritizedWindows = this.prioritizeRecentWindows(windows, recentCutoffDate)

      const totalSynced = await this.syncWindowsWithConcurrency(
        prioritizedWindows,
        windowConcurrency,
        pageSize,
        requestType
      )

      await this.updateSyncMetadata(completedAt)

      const duration = Date.now() - startTime
      console.log(`✅ 数据同步完成，共同步 ${totalSynced} 条记录，耗时 ${duration}ms`)

      void this.runPostSyncTasks().catch((error) => {
        console.error('❌ 同步后处理失败:', error)
      })
    } catch (error) {
      console.error('❌ 数据同步失败:', error)
    } finally {
      this.isSyncing = false
    }
  }

  private async syncWindowsWithConcurrency(
    windows: Array<{ startDate: string; endDate: string }>,
    concurrency: number,
    pageSize: number,
    requestType: number
  ) {
    let totalSynced = 0
    let currentIndex = 0

    const worker = async () => {
      let workerSynced = 0

      while (currentIndex < windows.length) {
        const window = windows[currentIndex++]
        if (!window) break

        workerSynced += await this.syncSingleWindow(window, pageSize, requestType)
      }

      return workerSynced
    }

    const workers = Array.from(
      { length: Math.min(concurrency, windows.length || 1) },
      () => worker()
    )

    const results = await Promise.all(workers)

    for (const count of results) {
      totalSynced += count
    }

    return totalSynced
  }

  private async syncSingleWindow(
    window: { startDate: string; endDate: string },
    pageSize: number,
    requestType: number
  ) {
    console.log(`🗓️ 同步窗口: ${window.startDate} 至 ${window.endDate}`)

    let page = 1
    let synced = 0

    while (true) {
      console.log(`📄 [${window.startDate}] 获取第 ${page} 页数据...`)

      const response = await fetchLogs({
        startDate: window.startDate,
        endDate: window.endDate,
        page,
        pageSize,
        type: requestType,
      })

      if (!response?.success) {
        console.log(`⚠️ API 响应失败或格式异常，停止窗口 ${window.startDate} 同步`)
        break
      }

      const logs = response.data.logs || []

      if (logs.length === 0) {
        console.log(`✅ 窗口 ${window.startDate} 数据获取完成`)
        break
      }

      console.log(`📥 窗口 ${window.startDate} 获取到 ${logs.length} 条日志`)

      const dbLogs = logs.map((log) => this.transformLogToDbFormat(log))
      await insertLogs(dbLogs)
      synced += dbLogs.length

      const currentPage = Number(response.data.pagination.page || page)
      const totalPages = Number(response.data.pagination.totalPages || 0)

      if (!totalPages || currentPage >= totalPages || logs.length < pageSize) {
        break
      }

      page = currentPage + 1
    }

    return synced
  }

  private prioritizeRecentWindows(
    windows: Array<{ startDate: string; endDate: string }>,
    recentCutoffDate: string
  ) {
    const recentWindows = windows.filter((window) => window.startDate >= recentCutoffDate)
    const olderWindows = windows.filter((window) => window.startDate < recentCutoffDate)

    return [...recentWindows.reverse(), ...olderWindows.reverse()]
  }

  private buildDailySyncWindows(startDate: string, endDate: string) {
    const windows: Array<{ startDate: string; endDate: string }> = []

    let cursor = dayjs(startDate)
    const end = dayjs(endDate)

    while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
      const date = cursor.format('YYYY-MM-DD')
      windows.push({ startDate: date, endDate: date })
      cursor = cursor.add(1, 'day')
    }

    return windows
  }

  private async runPostSyncTasks() {
    try {
      await this.ensureMetadataTable()
      await this.aggregateData()
    } catch (aggError) {
      console.error('❌ 数据聚合失败:', aggError)
    }

    try {
      const priceResult = await syncModelPrices()
      console.log(
        '💰 模型价格同步完成:',
        `更新 ${priceResult.updatedModels}/${priceResult.totalModels}, 来源 ${priceResult.source}, fetchedAt ${priceResult.fetchedAt}, cache=${priceResult.usedCache}`
      )
    } catch (priceError) {
      console.error('❌ 模型价格同步失败，保留旧价格:', priceError)
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
    const nextSyncTime = this.getNextSyncTime()
    const nextSyncValue = nextSyncTime ? dayjs(nextSyncTime).format('YYYY-MM-DD HH:mm:ss') : null

    try {
      await this.ensureMetadataTable()
      await query(
        `INSERT INTO sync_metadata (
          \`key\`, \`value\`
        ) VALUES
          ('last_sync_time', ?),
          ('last_completed_sync_time', ?),
          ('next_sync_time', ?),
          ('sync_cron', ?)
        ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
        [completedAtValue, completedAtValue, nextSyncValue, this.getSyncCronExpression()]
      )
      this.lastSyncTime = completedAt
    } catch (error) {
      console.error('更新同步时间失败:', error)
    }
  }

  async getSyncStatus() {
    const lastCompletedSyncTime = await this.getLastCompletedSyncTime()
    this.lastSyncTime = lastCompletedSyncTime
    const nextSyncTime = this.getNextSyncTime()

    return {
      isSyncing: this.isSyncing,
      lastCompletedSyncTime,
      nextSyncTime,
      syncCron: this.getSyncCronExpression(),
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
                  '%Y-%m-01 00:00:00'

    const periodStartExpression = periodType === 'week'
      ? "DATE_SUB(DATE(timestamp), INTERVAL WEEKDAY(timestamp) DAY)"
      : "STR_TO_DATE(DATE_FORMAT(timestamp, ?), '%Y-%m-%d %H:%i:%s')"

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
          ${periodStartExpression} as period_start,
          model_id,
          SUM(total_tokens) as total_tokens,
          SUM(total_cost) as total_cost,
          SUM(request_count) as request_count,
          SUM(success_count) as success_count,
          SUM(error_count) as error_count,
          AVG(avg_latency) as avg_latency
        FROM api_logs
        WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        GROUP BY ${periodStartExpression}, model_id
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

    const params = periodType === 'week'
      ? [periodType, format]
      : [periodType, format, format, format]

    await query(sql, params)
    console.log(`✅ ${periodType}聚合完成`)
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
    const cronExpression = this.getSyncCronExpression()

    if (!cron.validate(cronExpression)) {
      console.log(`⏸️  无效的定时同步 cron 表达式: ${cronExpression}`)
      this.stopScheduledSync()
      return
    }

    if (this.scheduledTask) {
      console.log('ℹ️ 定时同步任务已存在，跳过重复启动')
      return
    }

    console.log(`⏰ 设置定时同步: ${cronExpression}`)

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
    console.log('⏹️ 已停止定时同步任务')
  }
}

const dataSync = new DataSync()

export default dataSync
