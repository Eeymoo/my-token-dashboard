import { NextRequest, NextResponse } from 'next/server'
import dataSync from '@/lib/sync'

// 简单的 API 密钥验证
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
  // 验证 API 密钥
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { success: false, error: '未授权访问' },
      { status: 401 }
    )
  }

  try {
    const force = request.nextUrl.searchParams.get('force') === 'true'

    // 如果强制同步或没有正在进行的同步，则执行同步
    if (force || !dataSync.isSyncing) {
      // 异步执行同步，不等待完成
      dataSync.syncData().catch(error => {
        console.error('同步执行失败:', error)
      })

      return NextResponse.json({
        success: true,
        message: '数据同步已开始',
        isSyncing: true,
        lastSyncTime: dataSync.lastSyncTime,
      })
    } else {
      return NextResponse.json({
        success: true,
        message: '同步已在运行中',
        isSyncing: true,
        lastSyncTime: dataSync.lastSyncTime,
      })
    }

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
  // 验证 API 密钥
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { success: false, error: '未授权访问' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const immediate = body.immediate !== false // 默认立即执行

    // 初始化同步器
    const initialized = await dataSync.initialize()
    if (!initialized) {
      return NextResponse.json(
        { success: false, error: '同步器初始化失败' },
        { status: 500 }
      )
    }

    if (immediate) {
      // 立即执行同步
      await dataSync.syncData()

      return NextResponse.json({
        success: true,
        message: '数据同步已完成',
        isSyncing: false,
        lastSyncTime: dataSync.lastSyncTime,
      })
    } else {
      // 启动定时同步
      dataSync.startScheduledSync()

      return NextResponse.json({
        success: true,
        message: '定时同步已启动',
        isSyncing: false,
      })
    }

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