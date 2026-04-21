const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
let aiConfig = {
  apiKey: '',
  apiUrl: '',
  epId: '',
  modelName: ''
};

try {
  const config = require('./config.js');
  if (config && config.aiConfig) {
    aiConfig = {
      ...aiConfig,
      ...config.aiConfig
    };
  }
} catch (error) {
  // 配置文件缺失时自动走本地总结兜底
}

const CATEGORY_RULES = [
  { name: '美食', keywords: ['吃', '喝', '咖啡', '奶茶', '火锅', '外卖', '美团', '餐厅', '早餐', '午餐', '晚餐', '甜品'] },
  { name: '电影', keywords: ['电影', '影院', '追剧', '剧集', '综艺', '纪录片'] },
  { name: '学习', keywords: ['学习', '复习', '课程', '读书', '笔记', '考试', '刷题', '作业'] },
  { name: '工作', keywords: ['工作', '需求', '项目', '开会', '汇报', '客户', '加班'] },
  { name: '运动', keywords: ['运动', '跑步', '健身', '游泳', '骑行', '瑜伽', '羽毛球', '篮球'] }
];

function normalizeText(text) {
  return String(text || '').trim();
}

function getRecordText(record) {
  if (!record) {
    return '';
  }
  if (record.recordType === 'audio') {
    return normalizeText(record.transcript || record.content);
  }
  return normalizeText(record.content);
}

function cleanDailyTone(text) {
  return normalizeText(text)
    .replace(/今天/g, '')
    .replace(/上午/g, '')
    .replace(/中午/g, '')
    .replace(/下午/g, '')
    .replace(/晚上/g, '')
    .replace(/晚饭后/g, '')
    .replace(/下班后/g, '')
    .replace(/今天的/g, '')
    .replace(/，/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCategoryName(record) {
  const saved = normalizeText(record && record.category);
  if (saved) {
    return saved;
  }
  const text = getRecordText(record).toLowerCase();
  if (!text) {
    return '其他';
  }
  for (const rule of CATEGORY_RULES) {
    const hit = rule.keywords.some(keyword => text.includes(String(keyword).toLowerCase()));
    if (hit) {
      return rule.name;
    }
  }
  return '其他';
}

function summarizeCategory(records, categoryName) {
  const snippets = [];
  const seen = new Set();
  for (const record of records) {
    const text = cleanDailyTone(getRecordText(record));
    if (!text) {
      continue;
    }
    if (seen.has(text)) {
      continue;
    }
    seen.add(text);
    snippets.push(text);
    if (snippets.length >= 3) {
      break;
    }
  }
  return {
    title: categoryName,
    category: categoryName,
    points: [`共${records.length}条`, snippets.length ? snippets.join('、') : '暂无明显主题']
  };
}

function buildYearlySummary(records) {
  const grouped = {};
  records.forEach(record => {
    const name = getCategoryName(record);
    if (!grouped[name]) {
      grouped[name] = [];
    }
    grouped[name].push(record);
  });

  const ordered = Object.keys(grouped)
    .map(name => ({ name, records: grouped[name] }))
    .sort((a, b) => b.records.length - a.records.length);

  const summaryItems = ordered.map(item => summarizeCategory(item.records, item.name));
  const summaryText = summaryItems
    .map(item => `${item.title}：${item.points.join('；')}`)
    .join('\n');

  return { summaryItems, summaryText };
}

function buildAiPrompt(year, summaryItems) {
  const base = summaryItems
    .map(item => `${item.title}：${(item.points || []).join('；')}`)
    .join('\n');
  return `请把下面这份${year}年分类条目总结改写为“年度复盘风格”，避免日记口吻。

要求：
1. 仍然保持“分类：内容”的条目格式；
2. 每个分类只保留1行；
3. 不要写开场白和结尾；
4. 不要编造不存在的新事件；
5. 语气自然，不要过分夸张；
6. 严禁出现“今天/上午/中午/下午/晚上/这周”等日粒度词；
7. 用“全年/年内/上半年/下半年/Q1-Q4/整体”这类年度表达；
8. 每行优先包含：年度强度 + 重点事项 + 年度变化。
9. 不要写成日记形式，要写成条目的形式比如美食：“我吃了1000卡路里的美食 电影：“我看了部新的电影”

原始条目：
${base}

请直接输出结果：`;
}

async function refineSummaryByAI(year, summaryItems) {
  if (!aiConfig.apiKey || !aiConfig.apiUrl || !aiConfig.modelName || !aiConfig.epId) {
    return '';
  }
  const prompt = buildAiPrompt(year, summaryItems);
  const response = await axios.post(aiConfig.apiUrl, {
    model: aiConfig.modelName,
    messages: [
      {
        role: 'system',
        content: '你是条目总结助手。只输出分类条目，不输出额外解释。'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 220,
    temperature: 0.4
  }, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiConfig.apiKey}`,
      'x-volcengine-ep-id': aiConfig.epId
    },
    timeout: 60000
  });
  const text = (((response || {}).data || {}).choices || [])[0]?.message?.content || '';
  return cleanDailyTone(text);
}

async function fetchRecordsByTimestamp(openid, start, end) {
  const res = await db.collection('records')
    .where({
      _openid: openid,
      timestamp: _.gte(start).and(_.lte(end))
    })
    .limit(200)
    .get();
  return res.data || [];
}

async function fetchRecordsByYearField(openid, year) {
  const res = await db.collection('records')
    .where({
      _openid: openid,
      year: year
    })
    .limit(200)
    .get();
  return res.data || [];
}

async function fetchAllRecords(openid, maxPages = 5, pageSize = 100) {
  const list = [];
  for (let page = 0; page < maxPages; page += 1) {
    const res = await db.collection('records')
      .where({
        _openid: openid
      })
      .skip(page * pageSize)
      .limit(pageSize)
      .get();
    const data = res.data || [];
    list.push(...data);
    if (data.length < pageSize) {
      break;
    }
  }
  return list;
}

function getRecordYear(record) {
  const year = Number(record && record.year);
  if (year) {
    return year;
  }
  const timestamp = Number(record && record.timestamp);
  if (timestamp) {
    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime())) {
      return date.getFullYear();
    }
  }
  const dateText = normalizeText(record && record.date);
  const matched = dateText.match(/^(\d{4})[/-]\d{1,2}[/-]\d{1,2}$/);
  if (matched) {
    return Number(matched[1]) || 0;
  }
  return 0;
}

exports.main = async (event) => {
  try {
    const now = new Date();
    const year = Number(event.year) || now.getFullYear();
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    const deepScan = !!(event && event.deepScan);
    let records = await fetchRecordsByTimestamp(openid, start.getTime(), end.getTime());
    if (!records.length) {
      records = await fetchRecordsByYearField(openid, year);
    }
    if (!records.length && deepScan) {
      const allRecords = await fetchAllRecords(openid);
      records = allRecords.filter(record => getRecordYear(record) === year);
    }
    if (!records.length) {
      return {
        success: false,
        message: `${year}年暂无记录`
      };
    }

    const { summaryItems, summaryText } = buildYearlySummary(records);
    const useAI = event && Object.prototype.hasOwnProperty.call(event, 'useAI')
      ? !!event.useAI
      : true;
    let finalSummaryText = summaryText;
    let aiUsed = false;
    if (useAI) {
      try {
        const aiText = await refineSummaryByAI(year, summaryItems);
        if (aiText) {
          finalSummaryText = aiText;
          aiUsed = true;
        }
      } catch (error) {
        aiUsed = false;
      }
    }

    // 保存年报到数据库
    await db.collection('diaries').add({
      data: {
        type: 'yearly',
        year,
        startDate: start.toLocaleString(),
        endDate: end.toLocaleString(),
        content: finalSummaryText,
        summaryItems,
        aiUsed,
        createTime: new Date().toLocaleString()
      }
    });

    return {
      success: true,
      yearly: finalSummaryText,
      summaryText: finalSummaryText,
      summaryItems,
      aiUsed,
      deepScanUsed: deepScan,
      year
    };
  } catch (error) {
    console.error('生成年报失败:', error);
    return {
      success: false,
      message: '生成年报失败',
      error: error.message
    };
  }
};
