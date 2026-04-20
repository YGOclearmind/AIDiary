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

function getRecordText(record) {
  if (!record) {
    return '';
  }
  if (record.recordType === 'audio') {
    return normalizeText(record.transcript || record.content);
  }
  return normalizeText(record.content);
}

// 调用AI API生成年报
async function generateYearlyWithAI(records, year) {
  // 提取记录内容
  const recordContents = records.map(record => {
    const text = getRecordText(record);
    return text ? `- ${text}` : '';
  }).filter(Boolean).join('\n');
  
  if (!recordContents) {
    return `${year}年无有效记录`;
  }
  
  // 构建提示词
  const prompt = `请用自然流畅的"碎碎念"风格，将下面的流水账记录整理成分类清晰的年度总结。

严格要求：
1. 语言自然流畅，适当使用口语表达，避免过于正式
2. 适当使用语气词（哇、嘿、哈、诶等）和感叹词，不要过度
3. 按类别分组，每个类别用 emoji 表情作为标识，类别名称简洁明了
4. 每个类别下的条目简洁明了，每条不超过25字
5. 可以适当加入简短的个人感受，增加趣味性
6. 不要写成日记形式，要写成条目的形式
7. 直接开始分类总结，不要有引言或开场白
8. 不同类别之间必须空一行，确保分类清晰
9. 必须按照以下格式输出：
   
   🍽️ 类别名称
   - 条目1
   - 条目2
   
   💼 类别名称
   - 条目1
   - 条目2
   
   🏃 类别名称
   - 条目1
   - 条目2

年份：${year}

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
          content: '你是一个专业的年报撰写助手，擅长将一年的零散记录整理成有条理、有风格的年度总结。'
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
    const yearlyContent = response.data.choices[0].message.content;
    return yearlyContent;
  } catch (error) {
    console.error('AI API调用失败:', error);
    // 降级处理：使用简单的总结
    const simpleSummary = recordContents.split('\n').map(line => line.replace(/^- /, '• ')).join('\n');
    return `${year}年总结：\n\n${simpleSummary}`;
  }
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

async function fetchAllRecords(openid, maxPages = 20, pageSize = 100) {
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

// 增加云函数超时时间
exports.config = {
  timeout: 60000
};

exports.main = async (event) => {
  try {
    const now = new Date();
    const year = Number(event.year) || now.getFullYear();
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    let records = await fetchRecordsByTimestamp(openid, start.getTime(), end.getTime());
    if (!records.length) {
      records = await fetchRecordsByYearField(openid, year);
    }
    if (!records.length) {
      const allRecords = await fetchAllRecords(openid);
      records = allRecords.filter(record => getRecordYear(record) === year);
    }
    if (!records.length) {
      return {
        success: false,
        message: `${year}年暂无记录`
      };
    }

    // 使用AI生成年报
    const yearlyContent = await generateYearlyWithAI(records, year);

    // 保存年报到数据库
    await db.collection('diaries').add({
      data: {
        type: 'yearly',
        year,
        startDate: start.toLocaleString(),
        endDate: end.toLocaleString(),
        content: yearlyContent,
        createTime: new Date().toLocaleString()
      }
    });

    return {
      success: true,
      yearly: yearlyContent,
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
