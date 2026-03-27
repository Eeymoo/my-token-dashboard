import { NextRequest, NextResponse } from 'next/server'
import dataSync from '@/lib/sync'

function validateApiKey(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.substring(7)
  const validToken = process.env.ADMIN_API_KEY || 'default-admin-key'

  return token === validToken
}

function serializeSyncStatus(syncStatus: Awaited<ReturnType<typeof dataSync.getSyncStatus>>) {
  return {
    isSyncing: syncStatus.isSyncing,
    phase: syncStatus.phase,
    mode: syncStatus.mode,
    currentSyncStartedAt: syncStatus.currentSyncStartedAt?.toISOString() || null,
    lastCompletedSyncTime: syncStatus.lastCompletedSyncTime?.toISOString() || null,
    lastProcessedTime: syncStatus.lastProcessedTime?.toISOString() || null,
    lastSyncDurationMs: syncStatus.lastSyncDurationMs,
    lastSyncItemCount: syncStatus.lastSyncItemCount,
    lastSyncError: syncStatus.lastSyncError,
    nextSyncTime: syncStatus.nextSyncTime?.toISOString() || null,
    syncIntervalHours: syncStatus.syncIntervalHours,
  }
}

export async function GET() {
  try {
    const initialized = await dataSync.initialize()
    if (!initialized) {
      return NextResponse.json(
        { success: false, error: '同步器初始化失败' },
        { status: 500 }
      )
    }

    const syncStatus = await dataSync.getSyncStatus()
    return NextResponse.json({
      success: true,
      data: {
        syncStatus: serializeSyncStatus(syncStatus),
      },
    })
  } catch (error) {
    console.error('获取同步状态失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '获取同步状态失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { success: false, error: '未授权访问' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const fullSync = body.fullSync === true

    const initialized = await dataSync.initialize()
    if (!initialized) {
      return NextResponse.json(
        { success: false, error: '同步器初始化失败' },
        { status: 500 }
      )
    }

    let syncStatus
    let message = '数据同步已开始'

    if (body.rebuild) {
      if (!body.startDate || !body.endDate) {
        return NextResponse.json(
          { success: false, error: '重建派生数据需要 startDate 和 endDate' },
          { status: 400 }
        )
      }

      syncStatus = await dataSync.rebuildDerivedData(body.startDate, body.endDate)
      message = syncStatus.isSyncing ? '派生数据重建已开始' : '派生数据重建已完成'
    } else {
      syncStatus = await dataSync.syncData({ fullSync })
      message = syncStatus.isSyncing ? '数据同步已开始' : '数据同步已完成'
    }

    return NextResponse.json({
      success: !syncStatus.lastSyncError,
      message,
      error: syncStatus.lastSyncError || undefined,
      data: {
        syncStatus: serializeSyncStatus(syncStatus),
      },
    }, {
      status: syncStatus.lastSyncError ? 500 : 200,
    })
  } catch (error) {
    console.error('配置同步失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '配置同步失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    )
  }
}
