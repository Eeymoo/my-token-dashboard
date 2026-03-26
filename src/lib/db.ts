import mysql, { RowDataPacket } from 'mysql2/promise'

type TableName = 'api_logs' | 'models' | 'aggregated_data' | 'sync_metadata'

type ColumnSchema = {
  name: string
  definition: string
  dataType: string
  columnType: string
  isNullable: 'YES' | 'NO'
  defaultValue: string | null
}

type IndexSchema = {
  name: string
  definition: string
}

const TABLE_SCHEMAS: Record<TableName, { columns: ColumnSchema[]; indexes: IndexSchema[] }> = {
  api_logs: {
    columns: [
      { name: 'id', definition: 'id INT AUTO_INCREMENT PRIMARY KEY', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: null },
      { name: 'log_id', definition: 'log_id VARCHAR(100) UNIQUE NOT NULL', dataType: 'varchar', columnType: 'varchar(100)', isNullable: 'NO', defaultValue: null },
      { name: 'timestamp', definition: 'timestamp DATETIME NOT NULL', dataType: 'datetime', columnType: 'datetime', isNullable: 'NO', defaultValue: null },
      { name: 'model_id', definition: 'model_id VARCHAR(100) NOT NULL', dataType: 'varchar', columnType: 'varchar(100)', isNullable: 'NO', defaultValue: null },
      { name: 'model_name', definition: 'model_name VARCHAR(200) NOT NULL', dataType: 'varchar', columnType: 'varchar(200)', isNullable: 'NO', defaultValue: null },
      { name: 'provider', definition: 'provider VARCHAR(100)', dataType: 'varchar', columnType: 'varchar(100)', isNullable: 'YES', defaultValue: null },
      { name: 'category', definition: 'category VARCHAR(50)', dataType: 'varchar', columnType: 'varchar(50)', isNullable: 'YES', defaultValue: null },
      { name: 'user_id', definition: 'user_id VARCHAR(100)', dataType: 'varchar', columnType: 'varchar(100)', isNullable: 'YES', defaultValue: null },
      { name: 'user_name', definition: 'user_name VARCHAR(200)', dataType: 'varchar', columnType: 'varchar(200)', isNullable: 'YES', defaultValue: null },
      { name: 'team_id', definition: 'team_id VARCHAR(100)', dataType: 'varchar', columnType: 'varchar(100)', isNullable: 'YES', defaultValue: null },
      { name: 'total_tokens', definition: 'total_tokens INT NOT NULL DEFAULT 0', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: '0' },
      { name: 'prompt_tokens', definition: 'prompt_tokens INT NOT NULL DEFAULT 0', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: '0' },
      { name: 'completion_tokens', definition: 'completion_tokens INT NOT NULL DEFAULT 0', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: '0' },
      { name: 'total_cost', definition: 'total_cost DECIMAL(10, 6) NOT NULL DEFAULT 0', dataType: 'decimal', columnType: 'decimal(10,6)', isNullable: 'NO', defaultValue: '0.000000' },
      { name: 'prompt_cost', definition: 'prompt_cost DECIMAL(10, 6) NOT NULL DEFAULT 0', dataType: 'decimal', columnType: 'decimal(10,6)', isNullable: 'NO', defaultValue: '0.000000' },
      { name: 'completion_cost', definition: 'completion_cost DECIMAL(10, 6) NOT NULL DEFAULT 0', dataType: 'decimal', columnType: 'decimal(10,6)', isNullable: 'NO', defaultValue: '0.000000' },
      { name: 'request_count', definition: 'request_count INT NOT NULL DEFAULT 1', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: '1' },
      { name: 'success_count', definition: 'success_count INT NOT NULL DEFAULT 1', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: '1' },
      { name: 'error_count', definition: 'error_count INT NOT NULL DEFAULT 0', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: '0' },
      { name: 'avg_latency', definition: 'avg_latency DECIMAL(10, 2)', dataType: 'decimal', columnType: 'decimal(10,2)', isNullable: 'YES', defaultValue: null },
      { name: 'endpoint', definition: 'endpoint VARCHAR(500)', dataType: 'varchar', columnType: 'varchar(500)', isNullable: 'YES', defaultValue: null },
      { name: 'status_code', definition: 'status_code INT', dataType: 'int', columnType: 'int', isNullable: 'YES', defaultValue: null },
      { name: 'created_at', definition: 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', dataType: 'timestamp', columnType: 'timestamp', isNullable: 'YES', defaultValue: 'CURRENT_TIMESTAMP' },
      { name: 'updated_at', definition: 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', dataType: 'timestamp', columnType: 'timestamp', isNullable: 'YES', defaultValue: 'CURRENT_TIMESTAMP' },
    ],
    indexes: [
      { name: 'idx_timestamp', definition: 'INDEX idx_timestamp (timestamp)' },
      { name: 'idx_model', definition: 'INDEX idx_model (model_id)' },
      { name: 'idx_user', definition: 'INDEX idx_user (user_id)' },
      { name: 'idx_team', definition: 'INDEX idx_team (team_id)' },
      { name: 'log_id', definition: 'UNIQUE INDEX log_id (log_id)' },
    ],
  },
  models: {
    columns: [
      { name: 'id', definition: 'id INT AUTO_INCREMENT PRIMARY KEY', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: null },
      { name: 'model_id', definition: 'model_id VARCHAR(100) UNIQUE NOT NULL', dataType: 'varchar', columnType: 'varchar(100)', isNullable: 'NO', defaultValue: null },
      { name: 'model_name', definition: 'model_name VARCHAR(200) NOT NULL', dataType: 'varchar', columnType: 'varchar(200)', isNullable: 'NO', defaultValue: null },
      { name: 'provider', definition: 'provider VARCHAR(100) NOT NULL', dataType: 'varchar', columnType: 'varchar(100)', isNullable: 'NO', defaultValue: null },
      { name: 'category', definition: 'category VARCHAR(50) NOT NULL', dataType: 'varchar', columnType: 'varchar(50)', isNullable: 'NO', defaultValue: null },
      { name: 'input_price_usd', definition: 'input_price_usd DECIMAL(12, 6)', dataType: 'decimal', columnType: 'decimal(12,6)', isNullable: 'YES', defaultValue: null },
      { name: 'output_price_usd', definition: 'output_price_usd DECIMAL(12, 6)', dataType: 'decimal', columnType: 'decimal(12,6)', isNullable: 'YES', defaultValue: null },
      { name: 'price_last_source', definition: 'price_last_source VARCHAR(100)', dataType: 'varchar', columnType: 'varchar(100)', isNullable: 'YES', defaultValue: null },
      { name: 'price_last_synced_at', definition: 'price_last_synced_at DATETIME', dataType: 'datetime', columnType: 'datetime', isNullable: 'YES', defaultValue: null },
      { name: 'description', definition: 'description TEXT', dataType: 'text', columnType: 'text', isNullable: 'YES', defaultValue: null },
      { name: 'is_active', definition: 'is_active BOOLEAN DEFAULT true', dataType: 'tinyint', columnType: 'tinyint(1)', isNullable: 'YES', defaultValue: '1' },
      { name: 'last_used', definition: 'last_used DATETIME', dataType: 'datetime', columnType: 'datetime', isNullable: 'YES', defaultValue: null },
      { name: 'created_at', definition: 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', dataType: 'timestamp', columnType: 'timestamp', isNullable: 'YES', defaultValue: 'CURRENT_TIMESTAMP' },
      { name: 'updated_at', definition: 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', dataType: 'timestamp', columnType: 'timestamp', isNullable: 'YES', defaultValue: 'CURRENT_TIMESTAMP' },
    ],
    indexes: [
      { name: 'idx_provider', definition: 'INDEX idx_provider (provider)' },
      { name: 'idx_category', definition: 'INDEX idx_category (category)' },
      { name: 'model_id', definition: 'UNIQUE INDEX model_id (model_id)' },
    ],
  },
  aggregated_data: {
    columns: [
      { name: 'id', definition: 'id INT AUTO_INCREMENT PRIMARY KEY', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: null },
      { name: 'period_type', definition: "period_type ENUM('hour', 'day', 'week', 'month') NOT NULL", dataType: 'enum', columnType: "enum('hour','day','week','month')", isNullable: 'NO', defaultValue: null },
      { name: 'period_start', definition: 'period_start DATETIME NOT NULL', dataType: 'datetime', columnType: 'datetime', isNullable: 'NO', defaultValue: null },
      { name: 'period_end', definition: 'period_end DATETIME NOT NULL', dataType: 'datetime', columnType: 'datetime', isNullable: 'NO', defaultValue: null },
      { name: 'model_id', definition: 'model_id VARCHAR(100)', dataType: 'varchar', columnType: 'varchar(100)', isNullable: 'YES', defaultValue: null },
      { name: 'total_tokens', definition: 'total_tokens INT NOT NULL DEFAULT 0', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: '0' },
      { name: 'total_cost', definition: 'total_cost DECIMAL(10, 6) NOT NULL DEFAULT 0', dataType: 'decimal', columnType: 'decimal(10,6)', isNullable: 'NO', defaultValue: '0.000000' },
      { name: 'request_count', definition: 'request_count INT NOT NULL DEFAULT 0', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: '0' },
      { name: 'success_count', definition: 'success_count INT NOT NULL DEFAULT 0', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: '0' },
      { name: 'error_count', definition: 'error_count INT NOT NULL DEFAULT 0', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: '0' },
      { name: 'avg_latency', definition: 'avg_latency DECIMAL(10, 2)', dataType: 'decimal', columnType: 'decimal(10,2)', isNullable: 'YES', defaultValue: null },
      { name: 'created_at', definition: 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', dataType: 'timestamp', columnType: 'timestamp', isNullable: 'YES', defaultValue: 'CURRENT_TIMESTAMP' },
      { name: 'updated_at', definition: 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', dataType: 'timestamp', columnType: 'timestamp', isNullable: 'YES', defaultValue: 'CURRENT_TIMESTAMP' },
    ],
    indexes: [
      { name: 'unique_period', definition: 'UNIQUE INDEX unique_period (period_type, period_start, model_id)' },
      { name: 'idx_period_type', definition: 'INDEX idx_period_type (period_type)' },
      { name: 'idx_period_start', definition: 'INDEX idx_period_start (period_start)' },
      { name: 'idx_model', definition: 'INDEX idx_model (model_id)' },
    ],
  },
  sync_metadata: {
    columns: [
      { name: 'id', definition: 'id INT AUTO_INCREMENT PRIMARY KEY', dataType: 'int', columnType: 'int', isNullable: 'NO', defaultValue: null },
      { name: 'key', definition: '`key` VARCHAR(100) UNIQUE NOT NULL', dataType: 'varchar', columnType: 'varchar(100)', isNullable: 'NO', defaultValue: null },
      { name: 'value', definition: '`value` TEXT', dataType: 'text', columnType: 'text', isNullable: 'YES', defaultValue: null },
      { name: 'updated_at', definition: 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', dataType: 'timestamp', columnType: 'timestamp', isNullable: 'YES', defaultValue: 'CURRENT_TIMESTAMP' },
    ],
    indexes: [
      { name: 'key', definition: 'UNIQUE INDEX `key` (`key`)' },
    ],
  },
}

const TABLE_OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'

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

function buildCreateTableSql(tableName: TableName) {
  const tableSchema = TABLE_SCHEMAS[tableName]

  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      ${[
        ...tableSchema.columns.map((column) => column.definition),
        ...tableSchema.indexes.map((index) => index.definition),
      ].join(',\n      ')}
    ) ${TABLE_OPTIONS}
  `
}

async function getExistingColumns(connection: mysql.PoolConnection, tableName: string) {
  const [rows] = await connection.query<(RowDataPacket & {
    COLUMN_NAME: string
    DATA_TYPE: string
    COLUMN_TYPE: string
    IS_NULLABLE: 'YES' | 'NO'
    COLUMN_DEFAULT: string | null
  })[]>(`
    SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
  `, [tableName])

  return new Map(rows.map((row) => [row.COLUMN_NAME, row]))
}

async function getExistingIndexes(connection: mysql.PoolConnection, tableName: string) {
  const [rows] = await connection.query<(RowDataPacket & {
    Key_name: string
    Non_unique: 0 | 1
  })[]>(`SHOW INDEX FROM ${tableName}`)

  return new Map(rows.map((row) => [row.Key_name, row]))
}

function normalizeDefaultValue(defaultValue: string | null) {
  if (defaultValue === null) return null
  return String(defaultValue).toUpperCase() === 'CURRENT_TIMESTAMP'
    ? 'CURRENT_TIMESTAMP'
    : String(defaultValue)
}

function isColumnSchemaMismatch(
  actualColumn: {
    DATA_TYPE: string
    COLUMN_TYPE: string
    IS_NULLABLE: 'YES' | 'NO'
    COLUMN_DEFAULT: string | null
  },
  expectedColumn: ColumnSchema
) {
  return (
    actualColumn.DATA_TYPE.toLowerCase() !== expectedColumn.dataType.toLowerCase() ||
    actualColumn.COLUMN_TYPE.toLowerCase() !== expectedColumn.columnType.toLowerCase() ||
    actualColumn.IS_NULLABLE !== expectedColumn.isNullable ||
    normalizeDefaultValue(actualColumn.COLUMN_DEFAULT) !== normalizeDefaultValue(expectedColumn.defaultValue)
  )
}

async function ensureTableColumns(
  connection: mysql.PoolConnection,
  tableName: TableName,
  columns: ColumnSchema[]
) {
  const existingColumns = await getExistingColumns(connection, tableName)

  for (const column of columns) {
    const actualColumn = existingColumns.get(column.name)

    if (!actualColumn) {
      await connection.execute(`
        ALTER TABLE ${tableName}
        ADD COLUMN ${column.definition}
      `)

      console.log(`✅ 已自动补齐 ${tableName}.${column.name} 列`)
      continue
    }

    if (!isColumnSchemaMismatch(actualColumn, column)) continue

    await connection.execute(`
      ALTER TABLE ${tableName}
      MODIFY COLUMN ${column.definition}
    `)

    console.log(`✅ 已自动修正 ${tableName}.${column.name} 列定义`)
  }
}

async function ensureTableIndexes(
  connection: mysql.PoolConnection,
  tableName: TableName,
  indexes: IndexSchema[]
) {
  const existingIndexes = await getExistingIndexes(connection, tableName)

  for (const index of indexes) {
    if (existingIndexes.has(index.name)) continue

    await connection.execute(`
      ALTER TABLE ${tableName}
      ADD ${index.definition}
    `)

    console.log(`✅ 已自动补齐 ${tableName}.${index.name} 索引`)
  }
}

async function repairDatabaseSchema(connection: mysql.PoolConnection) {
  for (const tableName of Object.keys(TABLE_SCHEMAS) as TableName[]) {
    const tableSchema = TABLE_SCHEMAS[tableName]
    await ensureTableColumns(connection, tableName, tableSchema.columns)
    await ensureTableIndexes(connection, tableName, tableSchema.indexes)
  }
}

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
    await connection.execute(buildCreateTableSql('api_logs'))
    await connection.execute(buildCreateTableSql('models'))
    await connection.execute(buildCreateTableSql('aggregated_data'))
    await connection.execute(buildCreateTableSql('sync_metadata'))
    await repairDatabaseSchema(connection)

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