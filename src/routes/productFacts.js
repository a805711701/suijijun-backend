// 产品事实路由：获取、更新
const express = require('express');
const { db } = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');

const router = express.Router();

// 获取产品事实（公开，不需要登录，因为生成内容时需要引用）
router.get('/', authOptional, async (req, res) => {
  try {
    const productFact = await db.get(
      'SELECT * FROM product_facts ORDER BY updated_at DESC LIMIT 1'
    );

    if (!productFact) {
      return res.json({ product_facts: { id: null, content: '', updated_at: null } });
    }

    res.json({ product_facts: productFact });
  } catch (err) {
    console.error('[ProductFacts] 获取产品事实失败:', err);
    res.status(500).json({ error: '获取产品事实失败' });
  }
});

// 更新产品事实（需要登录，管理员或成员都可以更新）
router.put('/', authRequired, async (req, res) => {
  try {
    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'content 不能为空' });
    }

    // 查找现有记录
    const existing = await db.get(
      'SELECT id FROM product_facts ORDER BY updated_at DESC LIMIT 1'
    );

    if (existing) {
      await db.run(
        'UPDATE product_facts SET content = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [content, existing.id]
      );
      const updated = await db.get('SELECT * FROM product_facts WHERE id = ?', [existing.id]);
      res.json({ product_facts: updated });
    } else {
      const result = await db.run(
        'INSERT INTO product_facts (content, updated_at) VALUES (?, datetime(\'now\'))',
        [content]
      );
      const newRecord = await db.get('SELECT * FROM product_facts WHERE id = ?', [result.lastInsertRowid]);
      res.status(201).json({ product_facts: newRecord });
    }
  } catch (err) {
    console.error('[ProductFacts] 更新产品事实失败:', err);
    res.status(500).json({ error: '更新产品事实失败' });
  }
});

module.exports = router;
