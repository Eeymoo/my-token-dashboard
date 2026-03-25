import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(_request: NextRequest) {
  try {
    // 首先尝试从 models 表获取
    let modelsResult

    try {
      modelsResult = await query(`
        SELECT model_id, model_name, provider, category, description, is_active
        FROM models
        WHERE is_active = true
        ORDER BY model_name
      `) as any[]
    } catch (error) {
      // 如果 models 表不存在或查询失败，从日志中提取
      console.log('models 表查询失败，从日志中提取模型列表:', error)
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

    const models = modelsResult.map((row: any) => ({
      modelId: row.model_id,
      modelName: row.model_name,
      provider: row.provider || 'unknown',
      category: row.category || 'text',
      description: row.description,
      isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    }))

    // 如果没有模型数据，返回默认模型列表
    if (models.length === 0) {
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

    const sql = `
      INSERT INTO models (model_id, model_name, provider, category, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        model_name = VALUES(model_name),
        provider = VALUES(provider),
        category = VALUES(category),
        description = VALUES(description),
        is_active = VALUES(is_active),
        updated_at = CURRENT_TIMESTAMP
    `

    const params = [
      body.modelId,
      body.modelName,
      body.provider || 'unknown',
      body.category || 'text',
      body.description || null,
      body.isActive !== undefined ? body.isActive : true,
    ]

    await query(sql, params)

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