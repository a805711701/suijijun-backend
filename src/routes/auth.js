// 认证路由：登录、获取当前用户、检查是否有用户
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { generateToken, authRequired } = require('../middleware/auth');

const router = express.Router();

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const user = await db.get(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ error: '账号已被禁用，请联系管理员' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 更新最后登录时间
    await db.run(
      'UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?',
      [user.id]
    );

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status
      }
    });
  } catch (err) {
    console.error('[Auth] 登录失败:', err);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

// 获取当前用户信息
router.get('/me', authRequired, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, username, role, status, created_at, last_login_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ user });
  } catch (err) {
    console.error('[Auth] 获取用户信息失败:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 检查系统是否已有用户（用于首次启动判断）
router.get('/has-users', async (req, res) => {
  try {
    const result = await db.get('SELECT COUNT(*) as count FROM users');
    res.json({ hasUsers: result.count > 0, count: result.count });
  } catch (err) {
    console.error('[Auth] 检查用户失败:', err);
    res.status(500).json({ error: '检查用户失败' });
  }
});

module.exports = router;
