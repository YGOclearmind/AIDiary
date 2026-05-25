const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const config = require('./config.js');
const { apiKey, apiUrl, epId, modelName } = config.aiConfig;

const VALID_CATEGORIES = ['美食', '电影', '工作', '阅读', '运动', '健康', '关系', '学习', '休闲娱乐', '其他'];

const CATEGORY_RULES = [
  { name: '美食', keywords: ['美食', '吃', '火锅', '奶茶', '咖啡', '甜品', '外卖', '早餐', '午餐', '晚餐', '零食', '蛋糕', '烧烤', '烤肉', '炸鸡', '汉堡', '披萨', '拉面', '麻辣烫', '饺子'] },
  { name: '电影', keywords: ['电影', '影院', '看剧', '追剧', '剧', '综艺', '纪录片'] },
  { name: '工作', keywords: ['工作', '加班', '会议', '项目', '报告', '任务', '汇报', '上班', '同事', '领导'] },
  { name: '阅读', keywords: ['读书', '阅读', '书', '小说', '文章', '读', '章节'] },
  { name: '运动', keywords: ['跑步', '运动', '健身', '游泳', '散步', '锻炼', '公里', '瑜伽'] },
  { name: '健康', keywords: ['健康', '医院', '体检', '睡眠', '饮食', '药'] },
  { name: '关系', keywords: ['朋友', '家人', '聊天', '约会', '聚会', '陪伴'] },
  { name: '学习', keywords: ['学习', '课程', '考试', '练习', '笔记', '复习'] },
  { name: '休闲娱乐', keywords: ['游戏', '打游戏', '开黑', '刷视频', '短视频', '抖音', 'B站', '微博', '逛街', '旅游', '放松', '娱乐'] }
];

// 本地关键词匹配兜底
function inferCategoryLocal(text) {
  const source = String(text || '').toLowerCase();
  if (!source) return '其他';
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => source.includes(k))) return rule.name;
  }
  return '其他';
}

// AI 分类
async function inferCategoryWithAI(text) {
  const prompt = `请判断以下内容属于哪个分类，只返回分类名称，不要返回其他任何内容。

可选分类：${VALID_CATEGORIES.join('、')}

内容：${text}

分类：`;

  const response = await axios.post(apiUrl, {
    model: modelName,
    messages: [
      {
        role: 'system',
        content: '你是一个文本分类助手，只返回分类名称，不要解释。'
      },
      { role: 'user', content: prompt }
    ],
    max_tokens: 20,
    temperature: 0
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'x-volcengine-ep-id': epId
    },
    timeout: 10000
  });

  const result = String(response.data.choices[0].message.content).trim();
  // 校验返回值是否在合法分类中
  const matched = VALID_CATEGORIES.find(c => result.includes(c));
  return matched || null;
}

exports.config = {
  timeout: 15000
};

exports.main = async (event) => {
  const { text } = event;
  if (!text || !String(text).trim()) {
    return { success: true, category: '其他', aiUsed: false };
  }

  try {
    const category = await inferCategoryWithAI(text);
    if (category) {
      return { success: true, category, aiUsed: true };
    }
  } catch (error) {
    console.error('AI分类失败，降级到本地规则:', error);
  }

  // AI 失败时降级到本地关键词匹配
  const category = inferCategoryLocal(text);
  return { success: true, category, aiUsed: false };
};
