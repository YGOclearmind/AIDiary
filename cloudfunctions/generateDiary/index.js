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
    if (!grouped[title]) {
      grouped[title] = [];
    }
    if (detail && !grouped[title].includes(detail)) {
      grouped[title].push(detail);
    }
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

// 调用AI API生成条目总结
async function generateDiaryWithAI(records, date) {
  // 提取记录内容
  const recordContents = records.map(record => {
    const text = getRecordText(record);
    return text ? `- ${text}` : '';
  }).filter(Boolean).join('\n');
  
  if (!recordContents) {
    return '今日无有效记录';
  }
  
  // 构建提示词
  const prompt = `请用自然流畅的"碎碎念"风格，将下面的流水账记录整理成分类清晰的条目总结。

要求：
1. 语言自然流畅，适当使用口语表达，避免过于正式
2. 适当使用语气词（哇、嘿、哈、诶等）和感叹词，不要过度
3. 按类别分组，每个类别用 emoji 表情作为标识，类别名称简洁明了
4. 每个类别下的条目简洁明了，每条不超过25字
5. 可以适当加入简短的个人感受，增加趣味性
6. 不要写成日记形式，要写成条目的形式
7. 直接开始分类总结，不要有引言或开场白
8. 不要写成日记形式，要写成条目的形式比如美食：“我吃了1000卡路里的美食 电影：“我看了部新的电影”
9. 不同类别之间必须换行，确保分类清晰，一定要换行

日期：${date}

流水账记录：
${recordContents}

总结（碎碎念风格，分类清晰）：`;
  
  try {
    // 调用AI API
    const response = await axios.post(apiUrl, {
      model: modelName,
      messages: [
        {
          role: 'system',
          content: '你是一个专业的日记撰写助手，擅长将零散的记录整理成有条理、有情感的日记。'
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
    const diaryContent = response.data.choices[0].message.content;
    return diaryContent;
  } catch (error) {
    console.error('AI API调用失败:', error);
    // 降级处理：使用简单的总结
    const simpleSummary = recordContents.split('\n').map(line => line.replace(/^- /, '• ')).join('\n');
    return `今日碎碎念：\n\n${simpleSummary}\n\n今天就酱紫啦~`;
  }
}

// 增加云函数超时时间
exports.config = {
  timeout: 60000
};

exports.main = async (event, context) => {
  try {
    const { date, startTimestamp, endTimestamp } = event;
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

      if (records.data.length === 0 && date) {
        records = await db.collection('records')
          .where({
            date: date,
            _openid: openid
          })
          .get();
      }
    } else {
      records = await db.collection('records')
        .where({ 
          date: date,
          _openid: openid
        })
        .get();
    }

    if (records.data.length === 0) {
      return {
        success: false,
        message: '当天无记录'
      };
    }

    // 使用AI生成条目总结
    const summaryContent = await generateDiaryWithAI(records.data, date);
    const summaryItems = parseAiTextToSummaryItems(summaryContent);
    const summaryText = toSummaryText(summaryItems, summaryContent);

    // 保存总结到数据库
    await db.collection('diaries').add({
      data: {
        type: 'daily',
        date: date,
        content: summaryText,
        summaryItems: summaryItems,
        createTime: new Date().toLocaleString()
      }
    });

    return {
      success: true,
      diary: summaryText,
      summaryText,
      summaryItems
    };
  } catch (error) {
    console.error('生成条目总结失败:', error);
    return {
      success: false,
      message: '生成条目总结失败',
      error: error.message
    };
  }
};
