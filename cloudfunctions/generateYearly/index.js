const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const DEFAULT_CATEGORIES = [
  { code: 'food', name: '美食', keywords: ['吃', '喝', '咖啡', '奶茶', '火锅', '外卖', '美团', '餐厅', '早餐', '晚餐', '午餐', '甜品'] },
  { code: 'movie', name: '电影', keywords: ['电影', '影院', '剧', '综艺', '追剧', '票房', '纪录片'] },
  { code: 'study', name: '学习', keywords: ['学习', '复习', '课程', '读书', '笔记', '考试', '刷题', '作业'] },
  { code: 'work', name: '工作', keywords: ['工作', '开会', '需求', '项目', '客户', '加班', '汇报', '职场'] },
  { code: 'sport', name: '运动', keywords: ['运动', '跑步', '健身', '游泳', '骑行', '瑜伽', '羽毛球', '篮球'] },
  { code: 'other', name: '其他', keywords: [] }
];

const STOP_WORDS = ['今天', '感觉', '有点', '真的', '一个', '一下', '这个', '那个', '然后', '还是', '就是'];

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

function matchCategoryName(text, categories) {
  const lowerText = normalizeText(text).toLowerCase();
  for (const category of categories) {
    if (category.code === 'other') {
      continue;
    }
    const hit = (category.keywords || []).some(keyword => lowerText.includes(String(keyword).toLowerCase()));
    if (hit) {
      return category.name;
    }
  }
  return '其他';
}

function resolveCategoryName(record, categories) {
  const savedCategory = normalizeText(record && record.category);
  if (savedCategory) {
    const exists = categories.some(category => category.name === savedCategory);
    if (exists) {
      return savedCategory;
    }
  }
  const text = getRecordText(record);
  return matchCategoryName(text, categories);
}

function getRecordMonth(record) {
  const timestamp = Number(record && record.timestamp);
  if (timestamp) {
    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime())) {
      return date.getMonth() + 1;
    }
  }
  const dateText = normalizeText(record && record.date);
  const matched = dateText.match(/^(\d{4})[/-](\d{1,2})[/-]\d{1,2}$/);
  if (matched) {
    return Number(matched[2]) || 0;
  }
  return 0;
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

function getRecordQuarter(record) {
  const month = getRecordMonth(record);
  if (!month) {
    return 0;
  }
  return Math.ceil(month / 3);
}

function compactSentence(text, limit) {
  const source = normalizeText(text).replace(/\s+/g, '');
  if (!source) {
    return '';
  }
  if (source.length <= limit) {
    return source;
  }
  return `${source.slice(0, limit)}...`;
}

function extractTopTopics(records, limit) {
  const scoreMap = {};
  records.forEach(record => {
    const text = getRecordText(record);
    if (!text) {
      return;
    }
    const chunks = text
      .split(/[，,。；;！!？?\n、]/)
      .map(item => normalizeText(item))
      .filter(item => item.length >= 2 && item.length <= 12);
    chunks.forEach(chunk => {
      if (STOP_WORDS.includes(chunk)) {
        return;
      }
      scoreMap[chunk] = (scoreMap[chunk] || 0) + 1;
    });
  });
  const sorted = Object.keys(scoreMap).sort((a, b) => {
    const scoreDiff = scoreMap[b] - scoreMap[a];
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return b.length - a.length;
  });
  if (sorted.length) {
    return sorted.slice(0, limit);
  }
  const backup = [];
  const seen = new Set();
  records.forEach(record => {
    const sentence = compactSentence(getRecordText(record), 10);
    if (!sentence || seen.has(sentence)) {
      return;
    }
    seen.add(sentence);
    backup.push(sentence);
  });
  return backup.slice(0, limit);
}

function getQuarterFocus(records) {
  const quarterCount = { 1: 0, 2: 0, 3: 0, 4: 0 };
  records.forEach(record => {
    const quarter = getRecordQuarter(record);
    if (quarterCount[quarter] !== undefined) {
      quarterCount[quarter] += 1;
    }
  });
  let bestQuarter = 0;
  let bestCount = 0;
  Object.keys(quarterCount).forEach(key => {
    const value = quarterCount[key];
    if (value > bestCount) {
      bestCount = value;
      bestQuarter = Number(key);
    }
  });
  if (!bestQuarter || !bestCount) {
    return '全年分布较均匀';
  }
  return `Q${bestQuarter}投入最集中`;
}

function buildCategoryDigest(records, categoryName) {
  const count = records.length;
  const topics = extractTopTopics(records, 3);
  return {
    category: categoryName,
    title: categoryName,
    count,
    points: [
      `共${count}条`,
      topics.length ? topics.join('、') : '暂无明显主题'
    ]
  };
}

function toSummaryText(items) {
  return items
    .map(item => {
      return `${item.title}：${(item.points || []).join('；')}`;
    })
    .join('\n');
}

async function loadCategories() {
  try {
    const res = await db.collection('categoryKnowledge')
      .where({
        enabled: _.neq(false)
      })
      .limit(50)
      .get();
    if (!res.data.length) {
      return DEFAULT_CATEGORIES;
    }
    const list = res.data
      .map(item => ({
        code: item.code || normalizeText(item.name).toLowerCase(),
        name: item.name || '',
        keywords: Array.isArray(item.keywords) ? item.keywords : []
      }))
      .filter(item => item.name);
    const hasOther = list.some(item => item.name === '其他');
    if (!hasOther) {
      list.push({ code: 'other', name: '其他', keywords: [] });
    }
    return list.length ? list : DEFAULT_CATEGORIES;
  } catch (error) {
    return DEFAULT_CATEGORIES;
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

exports.main = async (event) => {
  try {
    const now = new Date();
    const year = Number(event.year) || now.getFullYear();
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const categories = await loadCategories();

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

    const groupedMap = {};
    records.forEach(record => {
      const categoryName = resolveCategoryName(record, categories);
      if (!groupedMap[categoryName]) {
        groupedMap[categoryName] = [];
      }
      groupedMap[categoryName].push(record);
    });

    const groupedList = Object.keys(groupedMap).map(name => ({
      category: name,
      records: groupedMap[name]
    }));
    groupedList.sort((a, b) => b.records.length - a.records.length);

    const summaryItems = groupedList.map(item => buildCategoryDigest(item.records, item.category));
    const summaryText = toSummaryText(summaryItems);

    await db.collection('diaries').add({
      data: {
        type: 'yearly',
        year,
        startDate: start.toLocaleString(),
        endDate: end.toLocaleString(),
        content: summaryText,
        summaryItems,
        createTime: new Date().toLocaleString()
      }
    });

    return {
      success: true,
      summaryText,
      summaryItems,
      yearly: summaryText,
      year
    };
  } catch (error) {
    return {
      success: false,
      message: '生成年报失败',
      error: error.message
    };
  }
};
