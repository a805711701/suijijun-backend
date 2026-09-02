// 素材库路由：列表、新增、更新分类、删除
const express = require('express');
const { db } = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');

const router = express.Router();

// 获取素材库列表（登录用户可看全部，按分类筛选）
router.get('/', authOptional, async (req, res) => {
  try {
    const { category, search, page = 1, pageSize = 100 } = req.query;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    const params = [];

    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }

    if (search) {
      conditions.push('(title LIKE ? OR content LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const materials = await db.query(
      `SELECT m.*, u.username as creator_name
       FROM materials m
       LEFT JOIN users u ON m.created_by = u.id
       ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    const countResult = await db.get(
      `SELECT COUNT(*) as count FROM materials${whereClause}`,
      params
    );

    // 获取所有分类
    const categories = await db.query(
      'SELECT DISTINCT category FROM materials ORDER BY category'
    );

    res.json({
      materials,
      total: countResult.count,
      categories: categories.map(c => c.category),
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (err) {
    console.error('[Materials] 获取素材库列表失败:', err);
    res.status(500).json({ error: '获取素材库列表失败' });
  }
});

// 新增素材（需要登录）
router.post('/', authRequired, async (req, res) => {
  try {
    const { category, title, content, source } = req.body;

    if (!category || !content) {
      return res.status(400).json({ error: 'category 和 content 不能为空' });
    }

    const result = await db.run(
      `INSERT INTO materials (category, title, content, source, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [category, title || null, content, source || 'manual', req.user.id]
    );

    const newMaterial = await db.get(
      'SELECT * FROM materials WHERE id = ?',
      [result.lastInsertRowid]
    );

    res.status(201).json({ material: newMaterial });
  } catch (err) {
    console.error('[Materials] 新增素材失败:', err);
    res.status(500).json({ error: '新增素材失败' });
  }
});

// 更新指定分类的全部内容（批量替换，用于素材库整体更新）
router.put('/category/:category', authRequired, async (req, res) => {
  try {
    const { category } = req.params;
    const { items } = req.body; // items: [{title, content, source}]

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items 必须是数组' });
    }

    // 删除该分类下所有旧数据
    await db.run('DELETE FROM materials WHERE category = ?', [category]);

    // 插入新数据
    const insertedIds = [];
    for (const item of items) {
      const result = await db.run(
        `INSERT INTO materials (category, title, content, source, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [category, item.title || null, item.content, item.source || 'manual', req.user.id]
      );
      insertedIds.push(result.lastInsertRowid);
    }

    const newMaterials = await db.query(
      'SELECT * FROM materials WHERE category = ? ORDER BY created_at DESC',
      [category]
    );

    res.json({ materials: newMaterials, count: newMaterials.length });
  } catch (err) {
    console.error('[Materials] 更新分类内容失败:', err);
    res.status(500).json({ error: '更新分类内容失败' });
  }
});

// 更新单条素材
router.put('/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { category, title, content } = req.body;

    const material = await db.get('SELECT * FROM materials WHERE id = ?', [id]);
    if (!material) {
      return res.status(404).json({ error: '素材不存在' });
    }

    // 普通成员只能改自己的，管理员可以改全部
    if (req.user.role !== 'admin' && material.created_by !== req.user.id) {
      return res.status(403).json({ error: '无权修改此素材' });
    }

    await db.run(
      'UPDATE materials SET category = ?, title = ?, content = ? WHERE id = ?',
      [category || material.category, title !== undefined ? title : material.title, content || material.content, id]
    );

    const updatedMaterial = await db.get('SELECT * FROM materials WHERE id = ?', [id]);
    res.json({ material: updatedMaterial });
  } catch (err) {
    console.error('[Materials] 更新素材失败:', err);
    res.status(500).json({ error: '更新素材失败' });
  }
});

// 删除素材
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params;

    const material = await db.get('SELECT * FROM materials WHERE id = ?', [id]);
    if (!material) {
      return res.status(404).json({ error: '素材不存在' });
    }

    // 普通成员只能删自己的，管理员可以删全部
    if (req.user.role !== 'admin' && material.created_by !== req.user.id) {
      return res.status(403).json({ error: '无权删除此素材' });
    }

    await db.run('DELETE FROM materials WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Materials] 删除素材失败:', err);
    res.status(500).json({ error: '删除素材失败' });
  }
});

module.exports = router;
