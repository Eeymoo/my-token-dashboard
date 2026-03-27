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

type SyncMode = 'incremental' | 'full' | 'rebuild'
type SyncPhase = 'idle' | 'fetching' | 'processing' | 'completed' | 'failed'

type SyncRuntimeState = {
  isSyncing: boolean
  phase: SyncPhase
  mode: SyncMode
  currentSyncStartedAt: Date | null
  lastCompletedSyncTime: Date | null
  lastProcessedTime: Date | null
  lastSyncDurationMs: number | null
  lastSyncItemCount: number | null
  lastSyncError: string | null
  nextSyncTime: Date | null
  syncIntervalHours: number
}

type PersistedSyncState = {
  lastCompletedSyncTime: Date | null
  lastProcessedTime: Date | null
  lastSyncDurationMs: number | null
  lastSyncItemCount: number | null
  lastSyncError: string | null
  currentSyncStartedAt: Date | null
  currentSyncMode: SyncMode
  currentSyncPhase: SyncPhase
}

// 数据同步器类
class DataSync {
  private isSyncing = false
  private lastSyncTime: Date | null = null
  private currentSyncStartedAt: Date | null = null
  private currentSyncMode: SyncMode = 'incremental'
  private currentSyncPhase: SyncPhase = 'idle'
  private lastSyncDurationMs: number | null = null
  private lastSyncItemCount: number | null = null
  private lastSyncError: string | null = null
  private lastProcessedTime: Date | null = null
  private metadataTableReady = false

  private getSyncIntervalHours() {
    return Math.max(1, parseInt(process.env.SYNC_INTERVAL_HOURS || '1'))
  }

  private parseDateValue(value: any): Date | null {
    if (!value) return null
    const parsed = dayjs(value)
    return parsed.isValid() ? parsed.toDate() : null
  }

  private parseNumberValue(value: any): number | null {
    if (value === null || value === undefined || value === '') return null
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }

  private normalizeSyncMode(value: any): SyncMode {
    return value === 'full' || value === 'rebuild' ? value : 'incremental'
  }

  private normalizeSyncPhase(value: any): SyncPhase {
    return value === 'fetching' || value === 'processing' || value === 'completed' || value === 'failed'
      ? value
      : 'idle'
  }

  private async getMetadataValue(key: string): Promise<string | null> {
    await this.ensureMetadataTable()
    const result = await query(
      'SELECT `value` FROM sync_metadata WHERE `key` = ?',
      [key]
    ) as any[]

    if (result.length === 0 || result[0].value === null || result[0].value === undefined || result[0].value === '') {
      return null
    }

    return String(result[0].value)
  }

  private async setMetadataValues(entries: Array<[string, string | null]>) {
    if (entries.length === 0) return

    await this.ensureMetadataTable()
    const placeholders = entries.map(() => '(?, ?)').join(', ')
    const params = entries.flatMap(([key, value]) => [key, value])

    await query(
      `INSERT INTO sync_metadata (\`key\`, \`value\`) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
      params
    )
  }

  private async hydrateSyncState() {
    const [
      lastCompletedSyncTime,
      lastProcessedTime,
      lastSyncDurationMs,
      lastSyncItemCount,
      lastSyncError,
      currentSyncStartedAt,
      currentSyncMode,
      currentSyncPhase,
    ] = await Promise.all([
      this.getMetadataValue('last_completed_sync_time'),
      this.getMetadataValue('last_processed_time'),
      this.getMetadataValue('last_sync_duration_ms'),
      this.getMetadataValue('last_sync_item_count'),
      this.getMetadataValue('last_sync_error'),
      this.getMetadataValue('current_sync_started_at'),
      this.getMetadataValue('current_sync_mode'),
      this.getMetadataValue('current_sync_phase'),
    ])

    this.lastSyncTime = this.parseDateValue(lastCompletedSyncTime)
    this.lastProcessedTime = this.parseDateValue(lastProcessedTime)
    this.lastSyncDurationMs = this.parseNumberValue(lastSyncDurationMs)
    this.lastSyncItemCount = this.parseNumberValue(lastSyncItemCount)
    this.lastSyncError = lastSyncError
    this.currentSyncStartedAt = this.parseDateValue(currentSyncStartedAt)
    this.currentSyncMode = this.normalizeSyncMode(currentSyncMode)
    this.currentSyncPhase = this.normalizeSyncPhase(currentSyncPhase)
    this.isSyncing = this.currentSyncPhase === 'fetching' || this.currentSyncPhase === 'processing'
  }

  private async markSyncStarted(mode: SyncMode) {
    const startedAt = new Date()
    const startedAtValue = dayjs(startedAt).format('YYYY-MM-DD HH:mm:ss')

    this.isSyncing = true
    this.currentSyncMode = mode
    this.currentSyncPhase = 'fetching'
    this.currentSyncStartedAt = startedAt
    this.lastSyncError = null

    await this.setMetadataValues([
      ['current_sync_started_at', startedAtValue],
      ['current_sync_mode', mode],
      ['current_sync_phase', 'fetching'],
      ['last_sync_error', null],
    ])

    return startedAt
  }

  private async markSyncPhase(phase: Extract<SyncPhase, 'fetching' | 'processing'>) {
    this.currentSyncPhase = phase
    await this.setMetadataValues([
      ['current_sync_phase', phase],
    ])
  }

  private async markSyncCompleted(completedAt: Date, durationMs: number, itemCount: number) {
    const completedAtValue = dayjs(completedAt).format('YYYY-MM-DD HH:mm:ss')
    const nextSyncValue = dayjs(completedAt).add(this.getSyncIntervalHours(), 'hour').format('YYYY-MM-DD HH:mm:ss')

    this.isSyncing = false
    this.lastSyncTime = completedAt
    this.lastSyncDurationMs = durationMs
    this.lastSyncItemCount = itemCount
    this.lastSyncError = null
    this.currentSyncPhase = 'completed'
    this.currentSyncStartedAt = null

    await this.setMetadataValues([
      ['last_sync_time', completedAtValue],
      ['last_completed_sync_time', completedAtValue],
      ['next_sync_time', nextSyncValue],
      ['sync_interval_hours', String(this.getSyncIntervalHours())],
      ['last_sync_duration_ms', String(durationMs)],
      ['last_sync_item_count', String(itemCount)],
      ['last_sync_error', null],
      ['current_sync_started_at', null],
      ['current_sync_phase', 'completed'],
      ['current_sync_mode', this.currentSyncMode],
    ])
  }

  private async markSyncFailed(error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'

    this.isSyncing = false
    this.lastSyncError = message
    this.currentSyncPhase = 'failed'
    this.currentSyncStartedAt = null

    await this.setMetadataValues([
      ['last_sync_error', message],
      ['current_sync_started_at', null],
      ['current_sync_phase', 'failed'],
      ['current_sync_mode', this.currentSyncMode],
    ])
  }

  async initialize() {
    console.log('🔄 初始化数据同步器...')

    const dbConnected = await testConnection()
    if (!dbConnected) {
      console.error('❌ 数据库连接失败，无法初始化同步器')
      return false
    }

    try {
      await initDatabase()
      await this.ensureMetadataTable()
      await this.hydrateSyncState()
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
      return this.getSyncStatus()
    }

    const mode: SyncMode = options?.fullSync === true ? 'full' : 'incremental'
    const startedAt = await this.markSyncStarted(mode)
    let totalSynced = 0

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

      await this.markSyncPhase('fetching')

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
          throw new Error('API 响应失败或格式异常')
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

      await this.markSyncPhase('processing')

      if (totalSynced > 0) {
        await this.processSyncedRange(syncWindow)
      }

      const completedAt = new Date()
      const duration = completedAt.getTime() - startedAt.getTime()
      await this.markSyncCompleted(completedAt, duration, totalSynced)
      console.log(`✅ 数据同步完成，共同步 ${totalSynced} 条记录，耗时 ${duration}ms`)

      return this.getSyncStatus()
    } catch (error) {
      console.error('❌ 数据同步失败:', error)
      await this.markSyncFailed(error)
      return this.getSyncStatus()
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
    await this.markSyncPhase('processing')
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

  private async getLastCompletedSyncTime(): Promise<Date | null> {
    try {
      const value = await this.getMetadataValue('last_completed_sync_time')
      return this.parseDateValue(value)
    } catch (error) {
      console.warn('获取最后完成同步时间失败:', error)
      return null
    }
  }

  private async getLastProcessedTime(): Promise<Date | null> {
    try {
      const value = await this.getMetadataValue('last_processed_time')
      return this.parseDateValue(value)
    } catch (error) {
      console.warn('获取最后处理时间失败:', error)
      return null
    }
  }

  private async updateProcessingTime(time: string) {
    this.lastProcessedTime = this.parseDateValue(time)
    await this.setMetadataValues([
      ['last_processed_time', time],
    ])
  }

  private async updateSyncMetadata(completedAt: Date) {
    await this.markSyncCompleted(completedAt, this.lastSyncDurationMs || 0, this.lastSyncItemCount || 0)
  }

  async getSyncStatus(): Promise<SyncRuntimeState> {
    if (!this.lastSyncTime && !this.lastProcessedTime && this.lastSyncDurationMs === null && this.lastSyncItemCount === null && !this.lastSyncError && !this.currentSyncStartedAt) {
      await this.hydrateSyncState()
    }

    const lastCompletedSyncTime = this.lastSyncTime || await this.getLastCompletedSyncTime()
    const lastProcessedTime = this.lastProcessedTime || await this.getLastProcessedTime()
    const nextSyncTime = this.getNextSyncTime(lastCompletedSyncTime)

    return {
      isSyncing: this.isSyncing,
      phase: this.currentSyncPhase,
      mode: this.currentSyncMode,
      currentSyncStartedAt: this.currentSyncStartedAt,
      lastCompletedSyncTime,
      lastProcessedTime,
      lastSyncDurationMs: this.lastSyncDurationMs,
      lastSyncItemCount: this.lastSyncItemCount,
      lastSyncError: this.lastSyncError,
      nextSyncTime,
      syncIntervalHours: this.getSyncIntervalHours(),
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

  async rebuildDerivedData(startDate: string, endDate: string) {
    if (this.isSyncing) {
      console.log('⚠️  同步已在运行中，跳过本次重建')
      return this.getSyncStatus()
    }

    const startedAt = await this.markSyncStarted('rebuild')
    const syncWindow: SyncWindow = {
      start: `${startDate} 00:00:00`,
      end: `${endDate} 23:59:59`,
    }

    try {
      await this.processSyncedRange(syncWindow)
      const completedAt = new Date()
      const duration = completedAt.getTime() - startedAt.getTime()
      const rows = await query(
        `SELECT COUNT(*) as count FROM api_logs
         WHERE timestamp BETWEEN STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s') AND STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s')`,
        [syncWindow.start, syncWindow.end]
      ) as any[]
      const itemCount = Number(rows[0]?.count) || 0

      await this.markSyncCompleted(completedAt, duration, itemCount)
      return this.getSyncStatus()
    } catch (error) {
      console.error('❌ 重建派生数据失败:', error)
      await this.markSyncFailed(error)
      return this.getSyncStatus()
    }
  }

  // 启动定时同步
  startScheduledSync() {
    const intervalHours = this.getSyncIntervalHours()

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
