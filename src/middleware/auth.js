// JWT 鉴权中间件
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'suijijun-default-secret-change-in-production';

// 生成 JWT token
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// 验证 token，提取用户信息
function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

// 管理员权限校验
function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

// 可选鉴权（有token就提取，没有也放行）
function authOptional(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // token无效就忽略，继续作为访客
    }
  }
  next();
}

module.exports = {
  generateToken,
  authRequired,
  adminRequired,
  authOptional,
  JWT_SECRET
};
