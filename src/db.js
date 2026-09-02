// 数据库抽象层：自动检测 DATABASE_URL 环境变量
// 有 DATABASE_URL → PostgreSQL，无 → SQLite（本地开发/简单部署）

const path = require('path');
const fs = require('fs');

let db;
let dbType = 'sqlite';

// 通用查询接口，统一异步 API
const dbInterface = {
  // 执行查询，返回所有行
  async query(sql, params = []) {
    if (dbType === 'sqlite') {
      const stmt = db.prepare(convertSqlPlaceholders(sql, 'sqlite'));
      return stmt.all(...params);
    } else {
      const result = await db.query(convertSqlPlaceholders(sql, 'pg'), params);
      return result.rows;
    }
  },

  // 执行查询，返回第一行
  async get(sql, params = []) {
    if (dbType === 'sqlite') {
      const stmt = db.prepare(convertSqlPlaceholders(sql, 'sqlite'));
      return stmt.get(...params);
    } else {
      const result = await db.query(convertSqlPlaceholders(sql, 'pg'), params);
      return result.rows[0] || null;
    }
  },

  // 执行写入（INSERT/UPDATE/DELETE），返回变更信息
  async run(sql, params = []) {
    if (dbType === 'sqlite') {
      const stmt = db.prepare(convertSqlPlaceholders(sql, 'sqlite'));
      const result = stmt.run(...params);
      return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
    } else {
      const result = await db.query(convertSqlPlaceholders(sql, 'pg'), params);
      return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount };
    }
  },

  // 执行多条SQL（建表用）
  async exec(sql) {
    if (dbType === 'sqlite') {
      db.exec(sql);
    } else {
      await db.query(sql);
    }
  },

  getType() {
    return dbType;
  }
};

// 将 ? 占位符转换为对应数据库的格式
function convertSqlPlaceholders(sql, target) {
  if (target === 'sqlite') {
    return sql; // SQLite 原生支持 ?
  }
  // PostgreSQL: 将 ? 转换为 $1, $2, ...
  let count = 0;
  return sql.replace(/\?/g, () => {
    count++;
    return `$${count}`;
  });
}

// 初始化数据库
async function initDB() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    // PostgreSQL 模式
    console.log('[DB] 使用 PostgreSQL 数据库');
    const { Pool } = require('pg');
    db = new Pool({ connectionString: databaseUrl });
    dbType = 'pg';
  } else {
    // SQLite 模式
    console.log('[DB] 使用 SQLite 数据库');
    const Database = require('better-sqlite3');
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'app.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    dbType = 'sqlite';
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      mode TEXT NOT NULL,
      task_type TEXT,
      input_content TEXT,
      output_content TEXT,
      title TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT,
      content TEXT,
      source TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS product_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
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
    'SELECT id FROM users WHERE username = ?',
    [adminUsername]
  );

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await dbInterface.run(
      'INSERT INTO users (username, password, role, status) VALUES (?, ?, ?, ?)',
      [adminUsername, hashedPassword, 'admin', 'active']
    );
    console.log(`[DB] 已创建默认管理员: ${adminUsername}/${adminPassword}`);
  }

  // 默认产品事实（空记录）
  const productFact = await dbInterface.get('SELECT id FROM product_facts LIMIT 1');
  if (!productFact) {
    await dbInterface.run('INSERT INTO product_facts (content) VALUES (?)', ['']);
  }

  // 默认素材库分类
  const defaultCategories = ['真实用户评论', '爆文案例', '搜索词数据'];
  for (const category of defaultCategories) {
    const existing = await dbInterface.get(
      'SELECT id FROM materials WHERE category = ? LIMIT 1',
      [category]
    );
    if (!existing) {
      await dbInterface.run(
        'INSERT INTO materials (category, title, content, source) VALUES (?, ?, ?, ?)',
        [category, '默认分类', '', 'system']
      );
    }
  }
}

module.exports = { initDB, db: dbInterface };
