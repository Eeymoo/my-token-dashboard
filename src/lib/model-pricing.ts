/**
 * LLM Metadata 模型价格同步工具。
 *
 * 提供缓存控制、远程拉取与数据库写入能力。
 *
 * @module model-pricing
 */
import axios from 'axios'
import dayjs from 'dayjs'
import { query } from './db'

const DEFAULT_BASE_URL = process.env.LLM_METADATA_BASE_URL || 'https://llm-metadata.pages.dev'
const DEFAULT_MODELS_PATH = process.env.LLM_METADATA_MODELS_PATH || '/api/newapi/models.json'
const DEFAULT_CACHE_TTL_MINUTES = Number(process.env.LLM_METADATA_CACHE_TTL_MINUTES || '360')
const PRICE_CACHE_KEY = 'llm_metadata_price_cache'
const PRICE_SOURCE_LABEL = 'llm-metadata'

/**
 * LLM Metadata 单个模型价格条目。
 *
 * @category Pricing
 */
interface PriceEntry {

  inputPrice: number | null
  outputPrice: number | null
  vendorName?: string | null
}

/**
 * LLM Metadata 价格缓存负载。
 *
 * @category Pricing
 */
interface PriceCachePayload {

  fetchedAt: string
  data: Record<string, PriceEntry>
  source: string
}

/**
 * 模型价格同步结果。
 *
 * @category Pricing
 */
interface SyncResult {

  updatedModels: number
  totalModels: number
  source: string
  fetchedAt: string
  usedCache: boolean
}

let memoryCache: PriceCachePayload | null = null

function normalizeKey(value?: string | null) {
  if (!value) return ''
  return value.trim().toLowerCase()
}

function isCacheValid(payload: PriceCachePayload | null) {
  if (!payload) return false
  if (!payload.fetchedAt) return false
  const fetchedAt = dayjs(payload.fetchedAt)
  if (!fetchedAt.isValid()) return false
  const ageMinutes = Math.abs(dayjs().diff(fetchedAt, 'minute'))
  return ageMinutes < DEFAULT_CACHE_TTL_MINUTES
}

async function loadCacheFromMetadata(): Promise<PriceCachePayload | null> {
  const rows = await query('SELECT `value` FROM sync_metadata WHERE `key` = ?', [PRICE_CACHE_KEY]) as any[]
  if (!rows.length || !rows[0].value) {
    return null
  }

  try {
    return JSON.parse(rows[0].value)
  } catch (error) {
    console.warn('解析价格缓存失败，将重新拉取:', error)
    return null
  }
}

async function saveCacheToMetadata(payload: PriceCachePayload) {
  await query(
    'INSERT INTO sync_metadata (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
    [PRICE_CACHE_KEY, JSON.stringify(payload)]
  )
}

async function fetchRemotePricePayload(): Promise<PriceCachePayload> {
  const url = new URL(DEFAULT_MODELS_PATH, DEFAULT_BASE_URL).toString()
  const response = await axios.get(url, {
    timeout: Number(process.env.LLM_METADATA_TIMEOUT || '15000'),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  })

  const rawList = Array.isArray(response.data?.data)
    ? response.data.data
    : Array.isArray(response.data)
      ? response.data
      : []

  const priceMap: Record<string, PriceEntry> = {}

  const normalizeNumber = (value: any): number | null => {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }

  rawList.forEach((item: any) => {
    const candidates = [item.model_name, item.model_name_en, item.model_id, item.modelId]
    const inputPrice = normalizeNumber(item.price_per_m_input ?? item.input_price)
    const outputPrice = normalizeNumber(item.price_per_m_output ?? item.output_price)

    if (inputPrice === null && outputPrice === null) {
      return
    }

    const entry: PriceEntry = {
      inputPrice,
      outputPrice,
      vendorName: item.vendor_name || item.provider || null,
    }

    candidates.forEach((candidate) => {
      const key = normalizeKey(candidate)
      if (!key) {
        return
      }
      priceMap[key] = entry
    })
  })

  if (!Object.keys(priceMap).length) {
    throw new Error('LLM Metadata 返回为空，无法同步价格数据')
  }

  const payload: PriceCachePayload = {
    fetchedAt: dayjs().toISOString(),
    data: priceMap,
    source: url,
  }

  memoryCache = payload
  await saveCacheToMetadata(payload)
  return payload
}

async function getPricePayload(forceRefresh = false): Promise<{ payload: PriceCachePayload; usedCache: boolean }> {
  if (!forceRefresh && isCacheValid(memoryCache)) {
    return { payload: memoryCache!, usedCache: true }
  }

  const stored = await loadCacheFromMetadata()
  if (!forceRefresh && isCacheValid(stored)) {
    memoryCache = stored
    return { payload: stored!, usedCache: true }
  }

  const payload = await fetchRemotePricePayload()
  return { payload, usedCache: false }
}

/**
 * 同步模型价格信息，写入 models 表。
 */
export async function syncModelPrices(options?: { forceRefresh?: boolean }): Promise<SyncResult> {
  const { payload, usedCache } = await getPricePayload(options?.forceRefresh ?? false)
  const rows = await query('SELECT model_id, model_name FROM models') as Array<{ model_id: string; model_name: string }>

  if (!rows.length) {
    return {
      updatedModels: 0,
      totalModels: 0,
      source: payload.source,
      fetchedAt: payload.fetchedAt,
      usedCache,
    }
  }

  const updateSql = `
    UPDATE models
    SET
      input_price_usd = ?,
      output_price_usd = ?,
      price_last_source = ?,
      price_last_synced_at = ?
    WHERE model_id = ?
  `

  const syncedAt = dayjs(payload.fetchedAt).isValid()
    ? dayjs(payload.fetchedAt).format('YYYY-MM-DD HH:mm:ss')
    : dayjs().format('YYYY-MM-DD HH:mm:ss')

  let updated = 0

  for (const row of rows) {
    const candidates = [normalizeKey(row.model_id), normalizeKey(row.model_name)]
    let priceEntry: PriceEntry | undefined

    for (const candidate of candidates) {
      if (!candidate) continue
      if (payload.data[candidate]) {
        priceEntry = payload.data[candidate]
        break
      }
    }

    if (!priceEntry) {
      continue
    }

    const result = await query(updateSql, [
      priceEntry.inputPrice,
      priceEntry.outputPrice,
      payload.source || PRICE_SOURCE_LABEL,
      syncedAt,
      row.model_id,
    ]) as any

    if (result?.affectedRows) {
      updated += result.affectedRows
    }
  }

  return {
    updatedModels: updated,
    totalModels: rows.length,
    source: payload.source,
    fetchedAt: payload.fetchedAt,
    usedCache,
  }
}
