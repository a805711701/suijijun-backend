// 数据库层：PostgreSQL
// 需要配置环境变量 DATABASE_URL 才能连接数据库

const { Pool } = require('pg');

let pool;
let dbType = 'postgresql';

// 通用查询接口
const dbInterface = {
  // 执行查询，返回所有行
  async query(sql, params = []) {
    const result = await pool.query(convertSqlPlaceholders(sql), params);
    return result.rows;
  },

  // 执行查询，返回第一行
  async get(sql, params = []) {
    const result = await pool.query(convertSqlPlaceholders(sql), params);
    return result.rows[0] || null;
  },

  // 执行写入（INSERT/UPDATE/DELETE）
  async run(sql, params = []) {
    let finalSql = convertSqlPlaceholders(sql);
    // PostgreSQL 的 INSERT 默认不返回新行，自动加 RETURNING id 以获取 lastInsertRowid
    if (/^\s*INSERT\s+/i.test(finalSql) && !/RETURNING/i.test(finalSql)) {
      finalSql = finalSql.replace(/;\s*$/, '') + ' RETURNING id';
    }
    const result = await pool.query(finalSql, params);
    return {
      lastInsertRowid: result.rows[0]?.id,
      changes: result.rowCount
    };
  },

  // 执行多条SQL（建表用）
  async exec(sql) {
    await pool.query(sql);
  },

  getType() {
    return dbType;
  }
};

// 将 ? 占位符转换为 PostgreSQL 的 $1, $2, ...
function convertSqlPlaceholders(sql) {
  let count = 0;
  return sql.replace(/\?/g, () => {
    count++;
    return `$${count}`;
  });
}

// 初始化数据库
async function initDB() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('[DB] 错误：未配置 DATABASE_URL 环境变量');
    console.error('[DB] 请在 Render 环境变量中添加 DATABASE_URL');
    throw new Error('DATABASE_URL is not configured');
  }

  console.log('[DB] 使用 PostgreSQL 数据库');

  pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false // Render PostgreSQL 需要 SSL
    }
  });

  // 测试连接
  try {
    const client = await pool.connect();
    console.log('[DB] 数据库连接成功');
    client.release();
  } catch (err) {
    console.error('[DB] 数据库连接失败:', err.message);
    throw err;
  }

  await createTables();
  await seedDefaultData();

  console.log('[DB] 数据库初始化完成');
  return dbInterface;
}

// 创建表结构
async function createTables() {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS generations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      mode TEXT NOT NULL,
      task_type TEXT,
      input_content TEXT,
      output_content TEXT,
      title TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS materials (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT,
      content TEXT,
      source TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_facts (
      id SERIAL PRIMARY KEY,
      content TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_id);
    CREATE INDEX IF NOT EXISTS idx_generations_mode ON generations(mode);
    CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
  `;

  await dbInterface.exec(sql);
}

// 初始化默认数据
async function seedDefaultData() {
  const bcrypt = require('bcryptjs');

  // 默认管理员
  const adminUsername = process.env.ADMIN_USERNAME || 'admin1';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const existingAdmin = await dbInterface.get(
    'SELECT id FROM users WHERE username = $1',
    [adminUsername]
  );

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await dbInterface.run(
      'INSERT INTO users (username, password, role, status) VALUES ($1, $2, $3, $4)',
      [adminUsername, hashedPassword, 'admin', 'active']
    );
    console.log(`[DB] 已创建默认管理员: ${adminUsername}/${adminPassword}`);
  }

  // 默认产品事实（空记录）
  const productFact = await dbInterface.get('SELECT id FROM product_facts LIMIT 1');
  if (!productFact) {
    await dbInterface.run('INSERT INTO product_facts (content) VALUES ($1)', ['']);
  }

  // 默认素材库分类
  const defaultCategories = ['真实用户评论', '爆文案例', '搜索词数据'];
  for (const category of defaultCategories) {
    const existing = await dbInterface.get(
      'SELECT id FROM materials WHERE category = $1 LIMIT 1',
      [category]
    );
    if (!existing) {
      await dbInterface.run(
        'INSERT INTO materials (category, title, content, source) VALUES ($1, $2, $3, $4)',
        [category, '默认分类', '', 'system']
      );
    }
  }
}

module.exports = { initDB, db: dbInterface };
