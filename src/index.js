// 随机君小红书内容操盘手 - Node.js 后端服务
const express = require('express');
const cors = require('cors');
const { initDB } = require('./db');

// 路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/admin/users');
const generationRoutes = require('./routes/generations');
const materialRoutes = require('./routes/materials');
const productFactRoutes = require('./routes/productFacts');
const statsRoutes = require('./routes/admin/stats');
const feishuRoutes = require('./routes/feishu');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors()); // 允许所有来源跨域访问
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 健康检查（不需要鉴权）
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'suijijun-backend', time: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'suijijun-backend', time: new Date().toISOString() });
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api/generations', generationRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/product-facts', productFactRoutes);
app.use('/api/admin/stats', statsRoutes);
app.use('/api/feishu', feishuRoutes);

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在', path: req.url });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

// 启动服务（先初始化数据库）
async function startServer() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log('========================================');
      console.log('  随机君后端服务已启动');
      console.log(`  端口: ${PORT}`);
      console.log(`  健康检查: http://localhost:${PORT}/health`);
      console.log('========================================');
    });
  } catch (err) {
    console.error('启动失败:', err);
    process.exit(1);
  }
}

startServer();
