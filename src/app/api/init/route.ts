import { NextRequest, NextResponse } from 'next/server'
import dataSync from '@/lib/sync'

export async function GET(request: NextRequest) {
  try {
    // 检查是否已经初始化
    const initialized = await dataSync.initialize()

    if (!initialized) {
      return NextResponse.json(
        { success: false, error: '初始化失败' },
        { status: 500 }
      )
    }

    // 启动定时同步
    dataSync.startScheduledSync()

    return NextResponse.json({
      success: true,
      message: '系统初始化完成，定时同步已启动',
      lastSyncTime: dataSync.lastSyncTime,
    })

  } catch (error) {
    console.error('初始化失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '初始化失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    )
  }
}