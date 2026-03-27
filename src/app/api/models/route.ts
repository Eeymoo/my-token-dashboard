import { NextRequest, NextResponse } from 'next/server'
import { query, upsertAllModelMetadata } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const includeAll = request.nextUrl.searchParams.get('all') === 'true'
    let modelsResult

    try {
      modelsResult = await query(`
        SELECT
          mc.model_id,
          mc.model_name,
          v.vendor_name AS provider,
          mc.category,
          mc.description,
          mc.is_active
        FROM model_catalog mc
        JOIN vendors v ON v.vendor_id = mc.vendor_id
        ${includeAll ? '' : `WHERE mc.is_active = true AND EXISTS (
          SELECT 1
          FROM api_logs al
          WHERE al.model_id = mc.model_id
        )`}
        ORDER BY mc.model_name
      `) as any[]
    } catch (error) {
      console.log('model_catalog 表查询失败，回退到 models 表:', error)

      try {
        modelsResult = await query(`
          SELECT model_id, model_name, provider, category, description, is_active
          FROM models
          ${includeAll ? '' : `WHERE is_active = true AND EXISTS (
            SELECT 1
            FROM api_logs al
            WHERE al.model_id = models.model_id
          )`}
          ORDER BY model_name
        `) as any[]
      } catch (legacyError) {
        console.log('models 表查询失败，从日志中提取模型列表:', legacyError)
        modelsResult = await query(`
          SELECT
            DISTINCT model_id,
            model_name,
            provider,
            category
          FROM api_logs
          WHERE model_id IS NOT NULL AND model_id != 'unknown'
          ORDER BY model_name
        `) as any[]
      }
    }

    const models = modelsResult.map((row: any) => ({
      modelId: row.model_id,
      modelName: row.model_name,
      provider: row.provider || 'unknown',
      category: row.category || 'text',
      description: row.description,
      isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    }))

    // 如果没有模型数据，返回默认模型列表
    if (models.length === 0 && includeAll) {
      models.push(
        { modelId: 'gpt-4', modelName: 'GPT-4', provider: 'OpenAI', category: 'text', description: 'OpenAI的GPT-4模型，强大的文本生成能力', isActive: true },
        { modelId: 'claude-3', modelName: 'Claude 3', provider: 'Anthropic', category: 'text', description: 'Anthropic的Claude 3模型，优秀的对话和推理能力', isActive: true },
        { modelId: 'gemini-pro', modelName: 'Gemini Pro', provider: 'Google', category: 'text', description: 'Google的Gemini Pro模型，多模态AI模型', isActive: true },
        { modelId: 'llama-2', modelName: 'Llama 2', provider: 'Meta', category: 'text', description: 'Meta的Llama 2开源大语言模型', isActive: true },
        { modelId: 'dall-e-3', modelName: 'DALL-E 3', provider: 'OpenAI', category: 'image', description: 'OpenAI的DALL-E 3图像生成模型', isActive: true },
      )
    }

    return NextResponse.json({
      success: true,
      data: models,
    })

  } catch (error) {
    console.error('获取模型列表失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '获取模型列表失败',
        details: error instanceof Error ? error.message : '未知错误',
        data: [], // 返回空数组而不是失败
      },
      { status: 500 }
    )
  }
}

// 支持 POST 请求用于添加/更新模型
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.modelId || !body.modelName) {
      return NextResponse.json(
        { success: false, error: '缺少必要字段 modelId 和 modelName' },
        { status: 400 }
      )
    }

    await upsertAllModelMetadata({
      modelId: body.modelId,
      modelName: body.modelName,
      provider: body.provider || 'unknown',
      category: body.category || 'text',
      description: body.description || null,
      isActive: body.isActive !== undefined ? body.isActive : true,
    })

    return NextResponse.json({
      success: true,
      message: '模型保存成功',
    })

  } catch (error) {
    console.error('保存模型失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '保存模型失败',
      },
      { status: 500 }
    )
  }
}