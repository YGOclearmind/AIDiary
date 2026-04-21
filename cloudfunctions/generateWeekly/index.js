const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 从配置文件读取AI API信息
const config = require('./config.js');
const { apiKey, apiUrl, epId, modelName } = config.aiConfig;

function normalizeText(text) {
  return String(text || '').trim();
}

function normalizeCategoryName(raw, fallback) {
  const text = normalizeText(raw)
    .replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, '')
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]+$/, '');
  if (!text) {
    return fallback || '其他';
  }
  if (text.includes('游戏')) {
    return '游戏';
  }
  if (text.includes('休闲') || text.includes('娱乐')) {
    return '游戏';
  }
  if (text.includes('状态') || text.includes('心情') || text.includes('情绪')) {
    return '其他';
  }
  return text;
}

function looksLikeSubTitle(segment) {
  const clean = normalizeText(segment);
  if (!clean) {
    return false;
  }
  if (/[，。！？?!.]/.test(clean)) {
    return false;
  }
  if (clean.length > 12) {
    return false;
  }
  return /(状态|日常|游戏|娱乐|学习|工作|美食|电影|运动|社交|健康)/.test(clean);
}

function appendGrouped(grouped, title, detail) {
  const name = normalizeCategoryName(title, '其他');
  const content = normalizeText(detail);
  if (!content) {
    return;
  }
  if (!grouped[name]) {
    grouped[name] = [];
  }
  if (!grouped[name].includes(content)) {
    grouped[name].push(content);
  }
}

function splitAndAppend(grouped, baseTitle, rawDetail) {
  const detail = normalizeText(rawDetail);
  if (!detail) {
    return;
  }
  const segments = detail.split(/[；;]+/).map(item => normalizeText(item)).filter(Boolean);
  if (segments.length <= 1) {
    appendGrouped(grouped, baseTitle, detail);
    return;
  }
  let currentTitle = normalizeCategoryName(baseTitle, '其他');
  for (const seg of segments) {
    const inline = seg.match(/^(.{1,12}?)(?:\s*[:：]\s*)(.+)$/);
    if (inline) {
      currentTitle = normalizeCategoryName(inline[1], currentTitle);
      appendGrouped(grouped, currentTitle, inline[2]);
      continue;
    }
    const cleaned = seg.replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, '').trim();
    if (looksLikeSubTitle(cleaned)) {
      currentTitle = normalizeCategoryName(cleaned, currentTitle);
      continue;
    }
    appendGrouped(grouped, currentTitle, seg);
  }
}

function parseAiTextToSummaryItems(text) {
  const source = normalizeText(text);
  if (!source) {
    return [];
  }
  const KNOWN_TITLES = ['美食', '电影', '学习', '工作', '运动', '休闲娱乐', '精神状态', '健康', '社交', '其他'];
  const normalizeTitle = (raw) => normalizeText(raw)
    .replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, '')
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]+$/, '')
    .trim();
  const lines = source
    .split('\n')
    .map(line => normalizeText(line))
    .filter(Boolean);
  const grouped = {};
  for (const line of lines) {
    const clean = line.replace(/^[•\-]\s*/, '').trim();
    const match = clean.match(/^(.{1,24}?)(?:\s*[:：]\s*|\s*[-—－]\s+)(.+)$/);
    let title = '其他';
    let detail = clean;
    if (match) {
      title = normalizeTitle(match[1]) || '其他';
      detail = normalizeText(match[2]);
    } else {
      const hit = KNOWN_TITLES.find(item => clean.includes(item));
      if (hit) {
        title = hit;
        detail = normalizeText(clean.replace(hit, '').replace(/^[:：\-\s]+/, '')) || clean;
      }
    }
    splitAndAppend(grouped, title, detail);
  }
  return Object.keys(grouped).map(title => ({
    title,
    category: title,
    points: grouped[title]
  })).filter(item => item.points.length > 0);
}

function toSummaryText(items, fallback) {
  if (!Array.isArray(items) || !items.length) {
    return normalizeText(fallback);
  }
  return items.map(item => `${item.title}：${item.points.join('；')}`).join('\n');
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

// 调用AI API生成周报
async function generateWeeklyWithAI(records, startDate, endDate) {
  // 提取记录内容
  const recordContents = records.map(record => {
    const text = getRecordText(record);
    return text ? `- ${text}` : '';
  }).filter(Boolean).join('\n');
  
  if (!recordContents) {
    return '本周无有效记录';
  }
  
  // 构建提示词
  const prompt = `请用自然流畅的"碎碎念"风格，将下面的流水账记录整理成分类清晰的周总结。

严格要求：
1. 语言自然流畅，适当使用口语表达，避免过于正式
2. 适当使用语气词（哇、嘿、哈、诶等）和感叹词，不要过度
3. 按类别分组，每个类别用 emoji 表情作为标识，类别名称简洁明了
4. 每个类别下的条目简洁明了，每条不超过25字
5. 可以适当加入简短的个人感受，增加趣味性
6. 不要写成日记形式，要写成条目的形式比如美食：“我吃了1000卡路里的美食 电影：“我看了部新的电影”
7. 直接开始分类总结，不要有引言或开场白
8. 不同类别之间必须换行，确保分类清晰

时间范围：${startDate} 至 ${endDate}

流水账记录：
${recordContents}

总结（碎碎念风格，分类清晰，必须按指定格式输出）：`;
  
  try {
    // 调用AI API
    const response = await axios.post(apiUrl, {
      model: modelName,
      messages: [
        {
          role: 'system',
          content: '你是一个专业的周报撰写助手，擅长将一周的零散记录整理成有条理、有风格的周总结。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'x-volcengine-ep-id': epId
      },
      timeout: 60000
    });
    
    // 提取AI生成的内容
    const weeklyContent = response.data.choices[0].message.content;
    return weeklyContent;
  } catch (error) {
    console.error('AI API调用失败:', error);
    // 降级处理：使用简单的总结
    const simpleSummary = recordContents.split('\n').map(line => line.replace(/^- /, '• ')).join('\n');
    return `本周总结：\n\n${simpleSummary}`;
  }
}

// 增加云函数超时时间
exports.config = {
  timeout: 60000
};

exports.main = async (event, context) => {
  try {
    const { startDate, endDate, startTimestamp, endTimestamp } = event;
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    let records;
    if (startTimestamp && endTimestamp) {
      records = await db.collection('records')
        .where({
          _openid: openid,
          timestamp: _.gte(startTimestamp).and(_.lte(endTimestamp))
        })
        .get();
    } else if (startDate && endDate) {
      records = await db.collection('records')
        .where({
          _openid: openid,
          createTime: _.gte(startDate).and(_.lte(endDate))
        })
        .get();
    } else {
      return {
        success: false,
        message: '缺少时间范围'
      };
    }

    if (records.data.length === 0) {
      return {
        success: false,
        message: '本周无记录'
      };
    }

    // 使用AI生成周报
    const weeklyContent = await generateWeeklyWithAI(records.data, startDate, endDate);
    const summaryItems = parseAiTextToSummaryItems(weeklyContent);
    const summaryText = toSummaryText(summaryItems, weeklyContent);

    // 保存周报到数据库
    await db.collection('diaries').add({
      data: {
        type: 'weekly',
        startDate: startDate,
        endDate: endDate,
        content: summaryText,
        summaryItems: summaryItems,
        createTime: new Date().toLocaleString()
      }
    });

    return {
      success: true,
      weekly: summaryText,
      summaryText,
      summaryItems
    };
  } catch (error) {
    console.error('生成周报失败:', error);
    return {
      success: false,
      message: '生成周报失败',
      error: error.message
    };
  }
};
