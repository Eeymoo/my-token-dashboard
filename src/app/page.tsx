'use client'

import { useState, useEffect } from 'react'
import { Row, Col, Card, Statistic, DatePicker, Select, Space, Button, Segmented, Switch, Spin, Alert, Empty } from 'antd'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { ReloadOutlined, DollarOutlined, BarChartOutlined, PieChartOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useSummary, useModels, useSync } from '@/hooks/useLogs'
import './globals.css'

const { RangePicker } = DatePicker
const { Option } = Select

// 时间范围映射
const timeRangeMap = {
  day: { label: '最近24小时', days: 1 },
  week: { label: '最近一周', days: 7 },
  month: { label: '最近一月', days: 30 },
  quarter: { label: '最近一季度', days: 90 },
  year: { label: '最近一年', days: 365 },
}

export default function Home() {
  // 状态管理
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'quarter' | 'year'>('quarter')
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [chartMode, setChartMode] = useState<'time' | 'cumulative'>('time')
  const [metric, setMetric] = useState<'tokens' | 'cost' | 'requests'>('tokens')
  const [currency, setCurrency] = useState<'USD' | 'CNY'>('USD')
  const [darkMode, setDarkMode] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(dayjs())
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)

  // 计算日期范围
  useEffect(() => {
    const endDate = dayjs()
    const startDate = endDate.subtract(timeRangeMap[timeRange].days, 'day')
    setDateRange([startDate, endDate])
  }, [timeRange])

  // API 数据获取
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
    mutate: triggerSync,
    isPending: syncPending
  } = useSync()

  // 数据处理
  const summary = summaryData?.data?.summary || {
    totalTokens: 0,
    totalCost: 0,
    totalRequests: 0,
    successRequests: 0,
    errorRequests: 0,
    avgLatency: 0,
  }

  const timeSeriesData = summaryData?.data?.timeSeries || []
  const modelBreakdown = summaryData?.data?.modelBreakdown || []

  // 格式化函数
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

  const handleRefresh = () => {
    refetchSummary()
    setLastUpdated(dayjs())
  }

  const handleManualSync = () => {
    triggerSync(true, {
      onSuccess: () => {
        console.log('同步成功')
        handleRefresh()
      },
      onError: (error) => {
        console.error('同步失败:', error)
      },
    })
  }

  // 错误处理
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
        {/* 头部标题和操作 */}
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
              icon={<ReloadOutlined spin />}
              onClick={handleManualSync}
              loading={syncPending}
            >
              同步数据
            </Button>
            <Switch
              checkedChildren="暗色"
              unCheckedChildren="亮色"
              checked={darkMode}
              onChange={setDarkMode}
            />
          </Space>
        </div>

        {/* 筛选器 */}
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

        {/* 总览卡片 */}
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

        {/* 图表区域 */}
        <Row gutter={[16, 16]}>
          {/* 时间趋势分析 */}
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
                    value={chartMode}
                    onChange={(value) => setChartMode(value as any)}
                  />
                  <Segmented
                    size="small"
                    options={[
                      { label: 'Token', value: 'tokens' },
                      { label: '花费', value: 'cost' },
                      { label: '请求数', value: 'requests' },
                    ]}
                    value={metric}
                    onChange={(value) => setMetric(value as any)}
                  />
                </Space>
              }
            >
              {summaryLoading || timeSeriesData.length === 0 ? (
                <div className="h-80 flex items-center justify-center">
                  {summaryLoading ? <Spin size="large" /> : <Empty description="暂无数据" />}
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeSeriesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => formatNumber(value)}
                      />
                      <Tooltip
                        formatter={(value) => [formatNumber(value as number), metric === 'tokens' ? 'Token数' : metric === 'cost' ? '花费' : '请求数']}
                        labelFormatter={(label) => `日期: ${label}`}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey={metric === 'tokens' ? 'totalTokens' : metric === 'cost' ? 'totalCost' : 'requestCount'}
                        stroke="#8884d8"
                        strokeWidth={2}
                        dot={false}
                        name={metric === 'tokens' ? 'Token数' : metric === 'cost' ? '花费' : '请求数'}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </Col>

          {/* 分模型使用量分析 */}
          <Col xs={24} lg={12}>
            <Card
              title="分模型使用量分析"
              extra={
                <Segmented
                  size="small"
                  options={[
                    { label: '分时', value: 'time' },
                    { label: '累计', value: 'cumulative' },
                  ]}
                  value={chartMode}
                  onChange={(value) => setChartMode(value as any)}
                />
              }
            >
              {summaryLoading || modelBreakdown.length === 0 ? (
                <div className="h-80 flex items-center justify-center">
                  {summaryLoading ? <Spin size="large" /> : <Empty description="暂无数据" />}
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={modelBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="modelName" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => formatNumber(value)} />
                      <Tooltip formatter={(value) => [formatNumber(value as number), 'Token数']} />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="totalTokens"
                        stackId="1"
                        stroke="#8884d8"
                        fill="#8884d8"
                        name="Token数"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* 底部信息 */}
        <div className="mt-6 text-center text-gray-500 text-sm dark:text-gray-400">
          <p>最后更新时间: {lastUpdated.format('YYYY-MM-DD HH:mm:ss')}</p>
          <p className="mt-2">数据范围: {startDate} 至今 • 使用 Next.js + Ant Design + Recharts 构建</p>
        </div>
      </div>
    </div>
  )
}