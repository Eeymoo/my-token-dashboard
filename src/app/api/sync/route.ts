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

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { success: false, error: '未授权访问' },
      { status: 401 }
    )
  }

  try {
    const force = request.nextUrl.searchParams.get('force') === 'true'
    const fullSync = request.nextUrl.searchParams.get('fullSync') === 'true'
    const rebuild = request.nextUrl.searchParams.get('rebuild') === 'true'
    const startDate = request.nextUrl.searchParams.get('startDate')
    const endDate = request.nextUrl.searchParams.get('endDate')

    if (rebuild) {
      if (!startDate || !endDate) {
        return NextResponse.json(
          { success: false, error: '重建派生数据需要 startDate 和 endDate' },
          { status: 400 }
        )
      }

      dataSync.rebuildDerivedData(startDate, endDate).catch((error) => {
        console.error('重建派生数据失败:', error)
      })

      return NextResponse.json({
        success: true,
        message: '后台重建任务已开始',
        isSyncing: dataSync.getIsSyncingPublic(),
        lastSyncTime: dataSync.getLastSyncTimePublic(),
      })
    }

    if (force || !dataSync.getIsSyncingPublic()) {
      dataSync.syncData({ fullSync }).catch(error => {
        console.error('同步执行失败:', error)
      })

      return NextResponse.json({
        success: true,
        message: '数据同步已开始',
        isSyncing: true,
        lastSyncTime: dataSync.getLastSyncTimePublic(),
      })
    }

    return NextResponse.json({
      success: true,
      message: '同步已在运行中',
      isSyncing: true,
      lastSyncTime: dataSync.getLastSyncTimePublic(),
    })
  } catch (error) {
    console.error('触发同步失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '触发同步失败',
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
    const immediate = body.immediate !== false
    const fullSync = body.fullSync === true

    const initialized = await dataSync.initialize()
    if (!initialized) {
      return NextResponse.json(
        { success: false, error: '同步器初始化失败' },
        { status: 500 }
      )
    }

    if (body.rebuild) {
      if (!body.startDate || !body.endDate) {
        return NextResponse.json(
          { success: false, error: '重建派生数据需要 startDate 和 endDate' },
          { status: 400 }
        )
      }

      await dataSync.rebuildDerivedData(body.startDate, body.endDate)

      return NextResponse.json({
        success: true,
        message: '派生数据重建已完成',
        isSyncing: false,
        lastSyncTime: dataSync.getLastSyncTimePublic(),
      })
    }

    if (immediate) {
      await dataSync.syncData({ fullSync })

      return NextResponse.json({
        success: true,
        message: '数据同步已完成',
        isSyncing: false,
        lastSyncTime: dataSync.getLastSyncTimePublic(),
      })
    }

    dataSync.startScheduledSync()

    return NextResponse.json({
      success: true,
      message: '定时同步已启动',
      isSyncing: false,
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
