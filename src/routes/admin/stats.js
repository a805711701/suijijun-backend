// 管理后台统计路由
const express = require('express');
const { db } = require('../../db');
const { authRequired, adminRequired } = require('../../middleware/auth');

const router = express.Router();

router.use(authRequired, adminRequired);

// 获取综合统计数据
router.get('/', async (req, res) => {
  try {
    // 用户统计
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    const activeUserCount = await db.get(
      "SELECT COUNT(*) as count FROM users WHERE status = 'active'"
    );
    const adminCount = await db.get(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'"
    );

    // 生成记录统计
    const generationCount = await db.get('SELECT COUNT(*) as count FROM generations');
    const todayGenerationCount = await db.get(
      "SELECT COUNT(*) as count FROM generations WHERE date(created_at) = date('now')"
    );

    // 按模式统计
    const modeStats = await db.query(
      'SELECT mode, COUNT(*) as count FROM generations GROUP BY mode ORDER BY count DESC'
    );

    // 素材库统计
    const materialCount = await db.get('SELECT COUNT(*) as count FROM materials');
    const materialCategoryStats = await db.query(
      'SELECT category, COUNT(*) as count FROM materials GROUP BY category ORDER BY count DESC'
    );

    // 最近7天生成趋势
    const weeklyTrend = await db.query(
      `SELECT date(created_at) as date, COUNT(*) as count
       FROM generations
       WHERE created_at >= date('now', '-7 days')
       GROUP BY date(created_at)
       ORDER BY date ASC`
    );

    // 最近生成记录（前10条）
    const recentGenerations = await db.query(
      `SELECT g.id, g.mode, g.task_type, g.title, g.created_at, u.username as creator_name
       FROM generations g
       LEFT JOIN users u ON g.user_id = u.id
       ORDER BY g.created_at DESC
       LIMIT 10`
    );

    // 最近用户（前10个）
    const recentUsers = await db.query(
      `SELECT id, username, role, status, created_at, last_login_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 10`
    );

    res.json({
      users: {
        total: userCount.count,
        active: activeUserCount.count,
        admins: adminCount.count
      },
      generations: {
        total: generationCount.count,
        today: todayGenerationCount.count,
        byMode: modeStats,
        weeklyTrend,
        recent: recentGenerations
      },
      materials: {
        total: materialCount.count,
        byCategory: materialCategoryStats
      },
      recentUsers
    });
  } catch (err) {
    console.error('[Admin Stats] 获取统计数据失败:', err);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

module.exports = router;
