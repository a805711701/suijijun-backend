// 飞书多维表格同步路由
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const auth = require('../middleware/auth');

// 飞书配置（从环境变量读取）
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_APP_TOKEN = process.env.FEISHU_APP_TOKEN || 'Pj2Uboe9taNICBsRPZWcEwkunyd';

// 需要同步的表配置
const TABLES_TO_SYNC = [
  {
    tableId: 'tblthla1dFDp05z1',
    name: '群聊记录同步',
    category: '爆文案例',
    titleField: '笔记标题',
    contentFields: ['笔记正文', '视频文案', '文案拆解及改写', '标题拆解及改写'],
    metaFields: ['笔记链接', '点赞数', '评论数', '收藏数', '分享数', '素人/博主/品牌', '发布时间']
  },
  {
    tableId: 'tblHeOj48YH5w5YQ',
    name: 'xhs笔记内容',
    category: '爆文案例',
    titleField: '笔记标题',
    contentFields: ['笔记内容', '口播脚本'],
    metaFields: ['笔记链接', '博主昵称', '点赞量', '收藏量', '评论量', '分享量', '发布时间', '笔记话题']
  },
  {
    tableId: 'tblbZlooSja4PL8x',
    name: 'xhs用户评论',
    category: '真实用户评论',
    titleField: '评论内容',
    contentFields: ['评论内容', '一级评论内容', '引用的评论内容'],
    metaFields: ['用户名称', '点赞量', '评论时间', '笔记链接', 'IP地址']
  },
  {
    tableId: 'tblQ1ftDUAKbxWCi',
    name: 'dy视频内容',
    category: '抖音视频',
    titleField: '文本',
    contentFields: ['文本'],
    metaFields: []
  },
  {
    tableId: 'tbl0QQK4j299tQiG',
    name: 'dy用户评论',
    category: '真实用户评论',
    titleField: '文本',
    contentFields: ['文本'],
    metaFields: []
  }
];

// 获取飞书 tenant_access_token
async function getTenantToken() {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    })
  });
  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`获取飞书token失败: ${data.msg}`);
  }
  return data.tenant_access_token;
}

// 读取飞书表格所有记录（自动分页）
async function fetchAllRecords(token, tableId) {
  const allRecords = [];
  let pageToken = null;

  do {
    let url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${tableId}/records?page_size=100`;
    if (pageToken) url += `&page_token=${pageToken}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(`读取飞书记录失败: ${data.msg}`);
    }

    if (data.data && data.data.items) {
      allRecords.push(...data.data.items);
    }

    pageToken = data.data && data.data.page_token ? data.data.page_token : null;
  } while (pageToken);

  return allRecords;
}

// 提取字段值（处理飞书各种字段类型）
function extractFieldValue(field) {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (Array.isArray(field)) {
    return field.map(item => {
      if (typeof item === 'string') return item;
      if (item.text) return item.text;
      if (item.name) return item.name;
      if (item.link) return item.link;
      return JSON.stringify(item);
    }).join(', ');
  }
  if (typeof field === 'object') {
    if (field.text) return field.text;
    if (field.link) return field.link;
    if (field.name) return field.name;
    return JSON.stringify(field);
  }
  return String(field);
}

// 构建素材内容
function buildContent(fields, contentFields, metaFields) {
  const parts = [];

  // 正文内容
  for (const fieldName of contentFields) {
    const value = extractFieldValue(fields[fieldName]);
    if (value && value.trim()) {
      parts.push(`【${fieldName}】\n${value.trim()}`);
    }
  }

  // 元信息
  const metaParts = [];
  for (const fieldName of metaFields) {
    const value = extractFieldValue(fields[fieldName]);
    if (value && value.trim()) {
      metaParts.push(`${fieldName}: ${value.trim()}`);
    }
  }
  if (metaParts.length > 0) {
    parts.push(`【数据信息】\n${metaParts.join(' | ')}`);
  }

  return parts.join('\n\n');
}

// 同步单个表
async function syncTable(token, tableConfig, userId) {
  const records = await fetchAllRecords(token, tableConfig.tableId);
  let added = 0;
  let skipped = 0;

  for (const record of records) {
    const recordId = record.record_id;
    const fields = record.fields || {};

    // 生成唯一 source 标识，用于去重
    const source = `feishu:${tableConfig.tableId}:${recordId}`;

    // 检查是否已同步过
    const existing = await db.get(
      'SELECT id FROM materials WHERE source = ?',
      [source]
    );
    if (existing) {
      skipped++;
      continue;
    }

    // 提取标题
    let title = extractFieldValue(fields[tableConfig.titleField]);
    if (!title || !title.trim()) {
      title = `${tableConfig.name} - ${recordId}`;
    }
    // 标题截断
    if (title.length > 100) {
      title = title.substring(0, 100) + '...';
    }

    // 构建内容
    const content = buildContent(fields, tableConfig.contentFields, tableConfig.metaFields);

    // 插入数据库
    await db.run(
      `INSERT INTO materials (category, title, content, source, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [tableConfig.category, title, content, source, userId]
    );
    added++;
  }

  return { table: tableConfig.name, total: records.length, added, skipped };
}

// POST /api/feishu/sync - 手动触发飞书同步
router.post('/sync', auth, async (req, res) => {
  try {
    if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
      return res.status(400).json({ error: '飞书应用未配置，请在环境变量中设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET' });
    }

    const token = await getTenantToken();
    const results = [];

    for (const tableConfig of TABLES_TO_SYNC) {
      try {
        const result = await syncTable(token, tableConfig, req.user.id);
        results.push(result);
      } catch (err) {
        results.push({ table: tableConfig.name, error: err.message });
      }
    }

    // 统计总数
    const totalAdded = results.reduce((sum, r) => sum + (r.added || 0), 0);
    const totalSkipped = results.reduce((sum, r) => sum + (r.skipped || 0), 0);

    res.json({
      success: true,
      message: `同步完成：新增 ${totalAdded} 条，跳过 ${totalSkipped} 条已存在`,
      totalAdded,
      totalSkipped,
      details: results
    });
  } catch (err) {
    console.error('[飞书同步] 失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/feishu/status - 获取飞书同步状态
router.get('/status', auth, async (req, res) => {
  try {
    // 统计各分类的素材数量
    const stats = await db.query(
      `SELECT category, COUNT(*) as count 
       FROM materials 
       WHERE source LIKE 'feishu:%' 
       GROUP BY category`
    );

    const total = await db.get(
      `SELECT COUNT(*) as count FROM materials WHERE source LIKE 'feishu:%'`
    );

    res.json({
      configured: !!(FEISHU_APP_ID && FEISHU_APP_SECRET),
      totalFeishuMaterials: total?.count || 0,
      byCategory: stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
