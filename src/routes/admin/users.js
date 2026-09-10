// 用户管理路由（管理员）：创建、列表、更新、启用/禁用、删除
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../../db');
const { authRequired, adminRequired } = require('../../middleware/auth');

const router = express.Router();

// 所有用户管理接口都需要管理员权限
router.use(authRequired, adminRequired);

// 获取用户列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 50, role, status } = req.query;
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    const params = [];

    if (role) {
      whereClause += ' WHERE role = ?';
      params.push(role);
    }
    if (status) {
      whereClause += whereClause ? ' AND status = ?' : ' WHERE status = ?';
      params.push(status);
    }

    const users = await db.query(
      `SELECT u.id, u.username, u.role, u.status, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM generations g WHERE g.user_id = u.id) as generation_count,
              (SELECT MAX(created_at) FROM generations g WHERE g.user_id = u.id) as last_generation_at
       FROM users u${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    // 计算最后活跃时间（取最后登录和最后生成的较大值）
    for (const u of users) {
      const loginTime = u.last_login_at ? new Date(u.last_login_at).getTime() : 0;
      const genTime = u.last_generation_at ? new Date(u.last_generation_at).getTime() : 0;
      u.last_active_at = loginTime >= genTime ? u.last_login_at : u.last_generation_at;
    }

    const countResult = await db.get(
      `SELECT COUNT(*) as count FROM users${whereClause}`,
      params
    );

    res.json({
      users,
      total: countResult.count,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (err) {
    console.error('[Admin Users] 获取用户列表失败:', err);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 创建用户
router.post('/', async (req, res) => {
  try {
    const { username, password, role = 'member' } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于6位' });
    }

    // 检查用户名是否已存在
    const existingUser = await db.get(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    if (existingUser) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, password, role, status) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, role, 'active']
    );

    const newUser = await db.get(
      'SELECT id, username, role, status, created_at FROM users WHERE id = ?',
      [result.lastInsertRowid]
    );

    res.status(201).json({ user: newUser });
  } catch (err) {
    console.error('[Admin Users] 创建用户失败:', err);
    res.status(500).json({ error: '创建用户失败' });
  }
});

// 更新用户（重置密码、修改角色）
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password, role } = req.body;

    const user = await db.get('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: '密码长度不能少于6位' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
    }

    if (role) {
      await db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    }

    const updatedUser = await db.get(
      'SELECT id, username, role, status, created_at, last_login_at FROM users WHERE id = ?',
      [id]
    );

    res.json({ user: updatedUser });
  } catch (err) {
    console.error('[Admin Users] 更新用户失败:', err);
    res.status(500).json({ error: '更新用户失败' });
  }
});

// 启用/禁用用户
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'disabled'].includes(status)) {
      return res.status(400).json({ error: '状态值无效' });
    }

    const user = await db.get('SELECT id, username FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 不允许禁用最后一个管理员
    if (status === 'disabled' && user.role === 'admin') {
      const adminCount = await db.get(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND status = 'active'"
      );
      if (adminCount.count <= 1) {
        return res.status(400).json({ error: '不能禁用最后一个管理员' });
      }
    }

    await db.run('UPDATE users SET status = ? WHERE id = ?', [status, id]);

    res.json({
      success: true,
      user: { id: parseInt(id), status }
    });
  } catch (err) {
    console.error('[Admin Users] 更新用户状态失败:', err);
    res.status(500).json({ error: '更新用户状态失败' });
  }
});

// 删除用户
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await db.get('SELECT id, username, role FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 不允许删除最后一个管理员
    if (user.role === 'admin') {
      const adminCount = await db.get(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND status = 'active'"
      );
      if (adminCount.count <= 1) {
        return res.status(400).json({ error: '不能删除最后一个管理员' });
      }
    }

    await db.run('DELETE FROM users WHERE id = ?', [id]);

    res.json({ success: true });
  } catch (err) {
    console.error('[Admin Users] 删除用户失败:', err);
    res.status(500).json({ error: '删除用户失败' });
  }
});

module.exports = router;
