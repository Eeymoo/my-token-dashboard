'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import nextDynamic from 'next/dynamic'
import { Row, Col, Card, Statistic, DatePicker, Select, Space, Button, Segmented, Switch, Spin, Alert, Empty, Checkbox, Tag, message } from 'antd'
import { ReloadOutlined, DollarOutlined, BarChartOutlined, PieChartOutlined, ExclamationCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
const ReactECharts = nextDynamic(() => import('echarts-for-react'), { ssr: false })
import { useSummary, useModels, useSyncStatus, useTriggerSync } from '@/hooks/useLogs'
import './globals.css'

const { RangePicker } = DatePicker
const { Option } = Select

const timeRangeMap = {
  day: { label: '最近24小时', days: 1 },
  week: { label: '最近一周', days: 7 },
  month: { label: '最近一月', days: 30 },
  quarter: { label: '最近一季度', days: 90 },
  year: { label: '最近一年', days: 365 },
}

const chartColors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#2f4554']

type ChartMetric = 'tokens' | 'cost' | 'requests'
type ChartMode = 'time' | 'cumulative'

export default function Home() {
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'quarter' | 'year'>('quarter')
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [timeTrendMode, setTimeTrendMode] = useState<ChartMode>('time')
  const [timeTrendMetric, setTimeTrendMetric] = useState<ChartMetric>('tokens')
  const [modelChartMode, setModelChartMode] = useState<ChartMode>('time')
  const [currency, setCurrency] = useState<'USD' | 'CNY'>('USD')
  const [darkMode, setDarkMode] = useState(false)
  // TODO(feat): [CHECKLIST 16.4/16.5] 管理分模型图表的堆叠开关及默认值，后续与卡片 extra 区域的 UI 绑定。
  const [stacked, setStacked] = useState(true)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)

  useEffect(() => {
    const endDate = dayjs()
    const startDate = endDate.subtract(timeRangeMap[timeRange].days, 'day')
    setDateRange([startDate, endDate])
  }, [timeRange])

  const startDate = dateRange?.[0]?.format('YYYY-MM-DD') || '2026-01-01'
  const endDate = dateRange?.[1]?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD')

  const {
    data: summaryData,
    isLoading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary
  } = useSummary(startDate, endDate, selectedModels)

  const {
    data: modelsData,
    isLoading: modelsLoading
  } = useModels()

  const {
    data: syncStatusData,
    refetch: refetchSyncStatus,
  } = useSyncStatus(true)

  const triggerSync = useTriggerSync()

  const summary = summaryData?.data?.summary || {
    totalTokens: 0,
    totalCost: 0,
    totalRequests: 0,
    successRequests: 0,
    errorRequests: 0,
    avgLatency: 0,
  }

  const timeSeriesData = summaryData?.data?.timeSeries || []
  const modelTimeSeries = summaryData?.data?.modelTimeSeries || []
  const syncStatus = syncStatusData?.data?.syncStatus || summaryData?.data?.syncStatus
  const lastUpdated = syncStatus?.lastCompletedSyncTime ? dayjs(syncStatus.lastCompletedSyncTime) : null
  const nextSyncTime = syncStatus?.nextSyncTime ? dayjs(syncStatus.nextSyncTime) : null
  const currentSyncStartedAt = syncStatus?.currentSyncStartedAt ? dayjs(syncStatus.currentSyncStartedAt) : null

  const formatNumber = (num: number) => {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const formatCurrency = (amount: number) => {
    const symbol = currency === 'USD' ? '$' : '¥'
    const rate = currency === 'USD' ? 1 : 7.2
    return `${symbol}${(amount * rate).toFixed(2)}`
  }

  const timeTrendMetricLabel = timeTrendMetric === 'tokens' ? 'Token数' : timeTrendMetric === 'cost' ? `花费 (${currency})` : '请求数'
  const nextSyncLabel = nextSyncTime?.isValid() ? nextSyncTime.format('HH:mm') : '--:--'
  const lastUpdatedLabel = lastUpdated?.isValid() ? lastUpdated.format('YYYY-MM-DD HH:mm:ss') : '暂无同步记录'
  const currentSyncStartedLabel = currentSyncStartedAt?.isValid() ? currentSyncStartedAt.format('YYYY-MM-DD HH:mm:ss') : '--'

  const formatDuration = (durationMs?: number | null) => {
    if (!durationMs || durationMs <= 0) return '--'
    const totalSeconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    if (minutes <= 0) return `${seconds} 秒`
    return `${minutes} 分 ${seconds} 秒`
  }

  const syncPhaseLabel = syncStatus?.phase === 'fetching'
    ? (syncStatus.mode === 'full' ? '全量同步中' : '同步中')
    : syncStatus?.phase === 'processing'
      ? (syncStatus.mode === 'rebuild' ? '重建处理中' : '后台处理中')
      : syncStatus?.phase === 'partial'
        ? '部分完成'
        : syncStatus?.phase === 'failed'
          ? '同步失败'
          : '空闲'

  const syncTagColor = syncStatus?.phase === 'failed'
    ? 'error'
    : syncStatus?.phase === 'partial'
      ? 'warning'
      : syncStatus?.isSyncing
        ? 'processing'
        : 'success'

  // TODO(feat): [CHECKLIST 16.3/16.4] 将 modelTimeSeries 转换成图表可用的分时/累计数据集。
  const modelChartData = useMemo(() => {
    if (modelTimeSeries.length === 0) {
      return {
        hours: [] as string[],
        models: [] as string[],
        rows: [] as Array<Record<string, string | number>>,
        modelNameMap: new Map<string, string>(),
      }
    }

    const hourSet = new Set<string>()
    const modelNameMap = new Map<string, string>()
    const hourModelValueMap = new Map<string, Map<string, number>>()

    modelTimeSeries.forEach((item) => {
      hourSet.add(item.hour)
      modelNameMap.set(item.modelId, item.modelName)

      if (!hourModelValueMap.has(item.hour)) {
        hourModelValueMap.set(item.hour, new Map<string, number>())
      }

      const metricValue =
        timeTrendMetric === 'tokens'
          ? item.totalTokens
          : timeTrendMetric === 'cost'
            ? (currency === 'USD' ? item.totalCost : item.totalCost * 7.2)
            : item.requestCount

      hourModelValueMap.get(item.hour)!.set(item.modelId, metricValue)
    })

    const hours = Array.from(hourSet).sort((a, b) => dayjs(a).valueOf() - dayjs(b).valueOf())
    const models = Array.from(modelNameMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'))
      .map(([modelId]) => modelId)

    const cumulativeTotals = new Map<string, number>()

    const rows = hours.map((hour) => {
      const values = hourModelValueMap.get(hour) || new Map<string, number>()
      const row: Record<string, string | number> = {
        hour,
        hourLabel: dayjs(hour).format('MM-DD HH:mm'),
      }

      models.forEach((modelId) => {
        const currentValue = values.get(modelId) || 0
        const nextValue = modelChartMode === 'cumulative'
          ? (cumulativeTotals.get(modelId) || 0) + currentValue
          : currentValue

        if (modelChartMode === 'cumulative') {
          cumulativeTotals.set(modelId, nextValue)
        }

        row[modelId] = nextValue
      })

      return row
    })

    return { hours, models, rows, modelNameMap }
  }, [currency, modelChartMode, modelTimeSeries, timeTrendMetric])

  // TODO(feat): [CHECKLIST 16.5/16.6] 基于堆叠开关与时间轴需求生成 ECharts 配置。
  const modelUsageChartOption = useMemo(() => {
    if (modelChartData.rows.length === 0) {
      return null
    }

    return {
      color: chartColors,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value: number) => formatNumber(value),
      },
      legend: {
        type: 'scroll',
        top: 0,
      },
      grid: {
        left: 16,
        right: 16,
        top: 48,
        bottom: 16,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: modelChartData.rows.map((row) => row.hourLabel),
        axisLabel: {
          rotate: modelChartData.rows.length > 16 ? 45 : 0,
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) => formatNumber(value),
        },
      },
      series: modelChartData.models.map((modelId, index) => ({
        name: modelChartData.modelNameMap.get(modelId) || modelId,
        type: 'bar',
        stack: stacked ? 'total' : undefined,
        emphasis: { focus: 'series' },
        barMaxWidth: stacked ? 36 : 20,
        itemStyle: { color: chartColors[index % chartColors.length] },
        data: modelChartData.rows.map((row) => Number(row[modelId] || 0)),
      })),
    }
  }, [modelChartData, stacked])

  const timeTrendChartOption = useMemo(() => {
    if (timeSeriesData.length === 0) {
      return null
    }

    const points = timeSeriesData.reduce<Array<{ label: string, value: number }>>((acc, item: any) => {
      const rawValue = Number(
        timeTrendMetric === 'tokens'
          ? item.totalTokens || 0
          : timeTrendMetric === 'cost'
            ? item.totalCost || 0
            : item.requestCount || 0
      )
      const value = timeTrendMetric === 'cost' && currency === 'CNY' ? rawValue * 7.2 : rawValue
      const previousValue = acc[acc.length - 1]?.value || 0

      acc.push({
        label: item.date,
        value: timeTrendMode === 'cumulative' ? previousValue + value : value,
      })

      return acc
    }, [])

    return {
      color: ['#8884d8'],
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: number) => timeTrendMetric === 'cost' ? formatCurrency(currency === 'USD' ? value : value / 7.2) : formatNumber(value),
      },
      grid: {
        left: 16,
        right: 16,
        top: 24,
        bottom: 16,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: points.map((item) => item.label),
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) => timeTrendMetric === 'cost' ? formatCurrency(currency === 'USD' ? value : value / 7.2) : formatNumber(value),
        },
      },
      series: [{
        name: timeTrendMetricLabel,
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: points.map((item) => item.value),
      }],
    }
  }, [currency, timeSeriesData, timeTrendMetric, timeTrendMetricLabel, timeTrendMode])

  useEffect(() => {
    if (syncStatus?.isSyncing) {
      refetchSummary()
    }
  }, [refetchSummary, syncStatus?.isSyncing, syncStatus?.phase])

  const handleRefresh = () => {
    refetchSummary()
    refetchSyncStatus()
  }

  const handleTriggerSync = async (fullSync = false) => {
    try {
      const response = await triggerSync.mutateAsync({ fullSync })
      message.success(response.message || '同步已触发')
      refetchSummary()
      refetchSyncStatus()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '触发同步失败')
    }
  }

  if (summaryError) {
    return (
      <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 ${darkMode ? 'dark' : ''}`}>
        <div className="container mx-auto px-4 py-8">
          <Alert
            message="数据加载失败"
            description={
              <div>
                <p>无法从服务器获取数据，请检查：</p>
                <ul className="list-disc ml-4 mt-2">
                  <li>数据库连接是否正常</li>
                  <li>API 服务是否运行</li>
                  <li>网络连接是否正常</li>
                </ul>
                <Button
                  type="primary"
                  onClick={handleRefresh}
                  className="mt-4"
                >
                  重试
                </Button>
              </div>
            }
            type="error"
            showIcon
            icon={<ExclamationCircleOutlined />}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 ${darkMode ? 'dark' : ''}`}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">AI Token 看板</h1>
            <p className="text-gray-600 dark:text-gray-400">统计和管理用户在 New API 平台的 Token 使用情况</p>
            <p className="text-sm text-gray-500 mt-1">数据范围: {startDate} 至 {endDate}</p>
          </div>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={summaryLoading}
            >
              刷新数据
            </Button>
            <Button
              type="primary"
              onClick={() => handleTriggerSync(false)}
              loading={triggerSync.isPending || Boolean(syncStatus?.isSyncing)}
            >
              {syncStatus?.isSyncing ? '同步进行中' : '立即同步'}
            </Button>
            <Button
              onClick={() => handleTriggerSync(true)}
              loading={triggerSync.isPending && syncStatus?.mode === 'full'}
              disabled={Boolean(syncStatus?.isSyncing)}
            >
              全量同步
            </Button>
            <Button icon={<ClockCircleOutlined />} disabled>
              {syncStatus?.isSyncing ? syncPhaseLabel : `等待下次同步（${nextSyncLabel}）`}
            </Button>
            <Switch
              checkedChildren="暗色"
              unCheckedChildren="亮色"
              checked={darkMode}
              onChange={setDarkMode}
            />
          </Space>
        </div>

        <Card className="mb-6" title="同步状态">
          <Space direction="vertical" size="small">
            <Space>
              <Tag color={syncTagColor}>{syncPhaseLabel}</Tag>
              <span className="text-sm text-gray-500">模式：{syncStatus?.mode || 'incremental'}</span>
            </Space>
            <div className="text-sm text-gray-600 dark:text-gray-300">开始时间：{currentSyncStartedLabel}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">最后完成：{lastUpdatedLabel}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">整体用时：{formatDuration(syncStatus?.lastSyncDurationMs)}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">处理条数：{syncStatus?.lastSyncItemCount ?? '--'}</div>
            {syncStatus?.progress ? (
              <div className="text-sm text-gray-600 dark:text-gray-300">
                分页进度：第 {syncStatus.progress.currentPage ?? '--'} 页 / {syncStatus.progress.totalPages ?? '--'} 页，已完成 {syncStatus.progress.syncedPages} 页，已同步 {syncStatus.progress.syncedItems} 条
              </div>
            ) : null}
            {syncStatus?.phase === 'partial' && syncStatus.lastSyncWarning ? (
              <Alert
                type="warning"
                showIcon
                message="最近一次同步部分完成"
                description={[
                  syncStatus.lastSyncWarning,
                  syncStatus.failedPages?.length
                    ? `失败分页：${syncStatus.failedPages.map((item) => `${item.page}（重试 ${item.attempts} 次）`).join('，')}`
                    : null,
                ].filter(Boolean).join('；')}
              />
            ) : null}
            {syncStatus?.lastSyncError ? (
              <Alert
                type="error"
                showIcon
                message="最近一次同步失败"
                description={syncStatus.lastSyncError}
              />
            ) : null}
            {syncStatus?.progress?.lastPageError && syncStatus.phase !== 'failed' ? (
              <Alert
                type="info"
                showIcon
                message="最近分页提示"
                description={syncStatus.progress.lastPageError}
              />
            ) : null}
          </Space>
        </Card>

        <Card className="mb-6" title="筛选器">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 dark:text-gray-300">时间范围</label>
                <Segmented
                  options={Object.entries(timeRangeMap).map(([value, config]) => ({
                    label: config.label,
                    value,
                  }))}
                  value={timeRange}
                  onChange={(value) => setTimeRange(value as any)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-300">自定义日期范围</label>
                <RangePicker
                  value={dateRange}
                  onChange={(dates) => {
                    if (dates) {
                      setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])
                      setTimeRange('custom' as any)
                    }
                  }}
                />
              </div>
            </Col>
            <Col span={12}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 dark:text-gray-300">模型选择</label>
                <Select
                  mode="multiple"
                  style={{ width: '100%' }}
                  placeholder="选择模型"
                  value={selectedModels}
                  onChange={setSelectedModels}
                  loading={modelsLoading}
                >
                  {modelsData?.data?.map((model: any) => (
                    <Option key={model.modelId} value={model.modelId}>
                      {model.modelName}
                    </Option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-300">货币单位</label>
                <Segmented
                  options={[
                    { label: '美元 ($)', value: 'USD' },
                    { label: '人民币 (¥)', value: 'CNY' },
                  ]}
                  value={currency}
                  onChange={(value) => setCurrency(value as any)}
                />
              </div>
            </Col>
          </Row>
        </Card>

        {summaryLoading ? (
          <Row gutter={[16, 16]} className="mb-6">
            {[1, 2, 3].map((i) => (
              <Col xs={24} sm={8} key={i}>
                <Card>
                  <Spin />
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <Row gutter={[16, 16]} className="mb-6">
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="总 Token 消耗"
                  value={summary.totalTokens}
                  formatter={(value) => formatNumber(value as number)}
                  prefix={<BarChartOutlined />}
                  valueStyle={{ color: '#3f8600' }}
                />
                <div className="mt-2 text-sm text-gray-500">数据已更新</div>
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="总花费"
                  value={summary.totalCost}
                  formatter={(value) => formatCurrency(value as number)}
                  prefix={<DollarOutlined />}
                  valueStyle={{ color: '#cf1322' }}
                />
                <div className="mt-2 text-sm text-gray-500">数据已更新</div>
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="总请求数"
                  value={summary.totalRequests}
                  formatter={(value) => formatNumber(value as number)}
                  prefix={<PieChartOutlined />}
                  valueStyle={{ color: '#1890ff' }}
                />
                <div className="mt-2 text-sm text-gray-500">数据已更新</div>
              </Card>
            </Col>
          </Row>
        )}

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card
              title="时间趋势分析"
              extra={
                <Space>
                  <Segmented
                    size="small"
                    options={[
                      { label: '分时', value: 'time' },
                      { label: '累计', value: 'cumulative' },
                    ]}
                    value={timeTrendMode}
                    onChange={(value) => setTimeTrendMode(value as ChartMode)}
                  />
                  <Segmented
                    size="small"
                    options={[
                      { label: 'Token', value: 'tokens' },
                      { label: '花费', value: 'cost' },
                      { label: '请求数', value: 'requests' },
                    ]}
                    value={timeTrendMetric}
                    onChange={(value) => setTimeTrendMetric(value as ChartMetric)}
                  />
                </Space>
              }
            >
              {summaryLoading || !timeTrendChartOption ? (
                <div className="h-80 flex items-center justify-center">
                  {summaryLoading ? <Spin size="large" /> : <Empty description="暂无数据" />}
                </div>
              ) : (
                <div className="h-80">
                  <ReactECharts option={timeTrendChartOption} style={{ height: '100%', width: '100%' }} notMerge lazyUpdate />
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card
              title="分模型使用量分析"
              extra={
                <Space size="middle">
                  <Segmented
                    size="small"
                    options={[
                      { label: '分时', value: 'time' },
                      { label: '累计', value: 'cumulative' },
                    ]}
                    value={modelChartMode}
                    onChange={(value) => setModelChartMode(value as ChartMode)}
                  />
                  <Checkbox checked={stacked} onChange={(event) => setStacked(event.target.checked)}>
                    堆叠
                  </Checkbox>
                </Space>
              }
            >
              {summaryLoading || !modelUsageChartOption ? (
                <div className="h-80 flex items-center justify-center">
                  {summaryLoading ? <Spin size="large" /> : <Empty description="暂无数据" />}
                </div>
              ) : (
                <div className="h-80">
                  <ReactECharts option={modelUsageChartOption} style={{ height: '100%', width: '100%' }} notMerge lazyUpdate />
                </div>
              )}
            </Card>
          </Col>
        </Row>

        <div className="mt-6 text-center text-gray-500 text-sm dark:text-gray-400">
          <p>最后更新时间: {lastUpdatedLabel}</p>
          <p>上次同步整体用时: {formatDuration(syncStatus?.lastSyncDurationMs)}</p>
        </div>
      </div>
    </div>
  )
}
