import mysql from 'mysql2/promise'

// 数据库连接配置
const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '3306'),
  user: process.env.DATABASE_USER || 'username',
  password: process.env.DATABASE_PASSWORD || 'password',
  database: process.env.DATABASE_NAME || 'ai_token_dashboard',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
}

// 创建连接池
const pool = mysql.createPool(dbConfig)

// 测试数据库连接
export async function testConnection() {
  let connection
  try {
    connection = await pool.getConnection()
    console.log('✅ 数据库连接成功')
    return true
  } catch (error) {
    console.error('❌ 数据库连接失败:', error)
    return false
  } finally {
    if (connection) connection.release()
  }
}

// 初始化数据库表
export async function initDatabase() {
  const connection = await pool.getConnection()

  try {
    // 创建日志表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS api_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        log_id VARCHAR(100) UNIQUE NOT NULL,
        timestamp DATETIME NOT NULL,
        model_id VARCHAR(100) NOT NULL,
        model_name VARCHAR(200) NOT NULL,
        provider VARCHAR(100),
        category VARCHAR(50),
        user_id VARCHAR(100),
        user_name VARCHAR(200),
        team_id VARCHAR(100),
        total_tokens INT NOT NULL DEFAULT 0,
        prompt_tokens INT NOT NULL DEFAULT 0,
        completion_tokens INT NOT NULL DEFAULT 0,
        total_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
        prompt_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
        completion_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
        request_count INT NOT NULL DEFAULT 1,
        success_count INT NOT NULL DEFAULT 1,
        error_count INT NOT NULL DEFAULT 0,
        avg_latency DECIMAL(10, 2),
        endpoint VARCHAR(500),
        status_code INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_timestamp (timestamp),
        INDEX idx_model (model_id),
        INDEX idx_user (user_id),
        INDEX idx_team (team_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    // 创建模型表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS models (
        id INT AUTO_INCREMENT PRIMARY KEY,
        model_id VARCHAR(100) UNIQUE NOT NULL,
        model_name VARCHAR(200) NOT NULL,
        provider VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        last_used DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_provider (provider),
        INDEX idx_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    // 创建聚合数据表（按小时/天/周/月）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS aggregated_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        period_type ENUM('hour', 'day', 'week', 'month') NOT NULL,
        period_start DATETIME NOT NULL,
        period_end DATETIME NOT NULL,
        model_id VARCHAR(100),
        total_tokens INT NOT NULL DEFAULT 0,
        total_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
        request_count INT NOT NULL DEFAULT 0,
        success_count INT NOT NULL DEFAULT 0,
        error_count INT NOT NULL DEFAULT 0,
        avg_latency DECIMAL(10, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_period (period_type, period_start, model_id),
        INDEX idx_period_type (period_type),
        INDEX idx_period_start (period_start),
        INDEX idx_model (model_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    console.log('✅ 数据库表初始化完成')
  } catch (error) {
    console.error('❌ 数据库表初始化失败:', error)
    throw error
  } finally {
    connection.release()
  }
}

// 导出连接池
export { pool }

// 通用查询函数
export async function query(sql: string, params?: any[]) {
  const connection = await pool.getConnection()
  try {
    const [results] = await connection.execute(sql, params)
    return results
  } finally {
    connection.release()
  }
}

// 插入日志记录
export async function insertLog(log: any) {
  const sql = `
    INSERT INTO api_logs (
      log_id, timestamp, model_id, model_name, provider, category,
      user_id, user_name, team_id, total_tokens, prompt_tokens, completion_tokens,
      total_cost, prompt_cost, completion_cost, request_count, success_count,
      error_count, avg_latency, endpoint, status_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      total_tokens = VALUES(total_tokens),
      total_cost = VALUES(total_cost),
      request_count = VALUES(request_count),
      updated_at = CURRENT_TIMESTAMP
  `

  const params = [
    log.logId,
    log.timestamp,
    log.modelId,
    log.modelName,
    log.provider,
    log.category,
    log.userId,
    log.userName,
    log.teamId,
    log.totalTokens,
    log.promptTokens,
    log.completionTokens,
    log.totalCost,
    log.promptCost,
    log.completionCost,
    log.requestCount,
    log.successCount,
    log.errorCount,
    log.avgLatency,
    log.endpoint,
    log.statusCode,
  ]

  return query(sql, params)
}