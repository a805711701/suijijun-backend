// 生成记录路由：创建、列表、详情、删除、去重检测
const express = require('express');
const { db } = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');

const router = express.Router();

// 创建生成记录（需要登录）
router.post('/', authRequired, async (req, res) => {
  try {
    const { mode, task_type, input_content, output_content, title } = req.body;

    if (!mode || !input_content || !output_content) {
      return res.status(400).json({ error: 'mode、input_content、output_content 不能为空' });
    }

    const result = await db.run(
      `INSERT INTO generations (user_id, mode, task_type, input_content, output_content, title)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, mode, task_type || null, input_content, output_content, title || null]
    );

    const newRecord = await db.get(
      'SELECT * FROM generations WHERE id = ?',
      [result.lastInsertRowid]
    );

    res.status(201).json({ generation: newRecord });
  } catch (err) {
    console.error('[Generations] 创建生成记录失败:', err);
    res.status(500).json({ error: '创建生成记录失败' });
  }
});

// 获取生成记录列表（需要登录，所有团队成员共享可见）
router.get('/', authRequired, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      mode,
      task_type,
      search,
      user_id
    } = req.query;

    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];

    // 所有登录用户都能看到全部团队生成记录
    // 可选按 user_id 筛选
    if (user_id) {
      conditions.push('g.user_id = ?');
      params.push(user_id);
    }

    if (mode) {
      conditions.push('g.mode = ?');
      params.push(mode);
    }

    if (task_type) {
      conditions.push('g.task_type = ?');
      params.push(task_type);
    }

    if (search) {
      conditions.push('(g.title LIKE ? OR g.input_content LIKE ? OR g.output_content LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const generations = await db.query(
      `SELECT g.*, u.username as creator_name
       FROM generations g
       LEFT JOIN users u ON g.user_id = u.id
       ${whereClause}
       ORDER BY g.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    const countResult = await db.get(
      `SELECT COUNT(*) as count FROM generations g${whereClause}`,
      params
    );

    res.json({
      generations,
      total: countResult.count,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (err) {
    console.error('[Generations] 获取生成记录列表失败:', err);
    res.status(500).json({ error: '获取生成记录列表失败' });
  }
});

// 获取单条生成记录详情
router.get('/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params;

    const record = await db.get(
      `SELECT g.*, u.username as creator_name
       FROM generations g
       LEFT JOIN users u ON g.user_id = u.id
       WHERE g.id = ?`,
      [id]
    );

    if (!record) {
      return res.status(404).json({ error: '记录不存在' });
    }

    // 所有团队成员都可以查看生成记录详情
    res.json({ generation: record });
  } catch (err) {
    console.error('[Generations] 获取生成记录详情失败:', err);
    res.status(500).json({ error: '获取生成记录详情失败' });
  }
});

// 删除生成记录
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params;

    const record = await db.get('SELECT * FROM generations WHERE id = ?', [id]);
    if (!record) {
      return res.status(404).json({ error: '记录不存在' });
    }

    // 普通成员只能删自己的，管理员可以删全部
    if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权删除此记录' });
    }

    await db.run('DELETE FROM generations WHERE id = ?', [id]);

    res.json({ success: true });
  } catch (err) {
    console.error('[Generations] 删除生成记录失败:', err);
    res.status(500).json({ error: '删除生成记录失败' });
  }
});

// 去重检测（检查相同输入是否已生成过）
router.post('/check-duplicate', authOptional, async (req, res) => {
  try {
    const { input_content, mode } = req.body;

    if (!input_content) {
      return res.json({ isDuplicate: false });
    }

    const conditions = ['input_content = ?'];
    const params = [input_content];

    if (mode) {
      conditions.push('mode = ?');
      params.push(mode);
    }

    const existing = await db.get(
      `SELECT id, title, created_at FROM generations WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 1`,
      params
    );

    res.json({
      isDuplicate: !!existing,
      existing: existing || null
    });
  } catch (err) {
    console.error('[Generations] 去重检测失败:', err);
    res.status(500).json({ error: '去重检测失败' });
  }
});

module.exports = router;

