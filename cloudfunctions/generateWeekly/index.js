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
  const lowerText = text.toLowerCase();
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

function uniquePoints(records, limit) {
  const points = [];
  const seen = new Set();
  for (const record of records) {
    const text = getRecordText(record);
    if (!text) {
      continue;
    }
    const point = text.length > 30 ? `${text.slice(0, 30)}...` : text;
    if (seen.has(point)) {
      continue;
    }
    seen.add(point);
    points.push(point);
    if (points.length >= limit) {
      break;
    }
  }
  return points;
}

function buildSummaryItems(records, categories, prefix) {
  const grouped = {};
  categories.forEach(category => {
    grouped[category.name] = [];
  });
  records.forEach(record => {
    const text = getRecordText(record);
    if (!text) {
      return;
    }
    const categoryName = matchCategoryName(text, categories);
    if (!grouped[categoryName]) {
      grouped[categoryName] = [];
    }
    grouped[categoryName].push(record);
  });
  return Object.keys(grouped)
    .map(categoryName => {
      const categoryRecords = grouped[categoryName];
      if (!categoryRecords || !categoryRecords.length) {
        return null;
      }
      return {
        category: categoryName,
        title: `${prefix}${categoryName}`,
        count: categoryRecords.length,
        points: uniquePoints(categoryRecords, 5)
      };
    })
    .filter(Boolean);
}

function toSummaryText(items) {
  return items
    .map(item => {
      const lines = item.points.map(point => `- ${point}`).join('\n');
      return `${item.title}（${item.count}条）\n${lines}`;
    })
    .join('\n\n');
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

exports.main = async (event, context) => {
  try {
    const { startDate, endDate, startTimestamp, endTimestamp } = event;
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    const categories = await loadCategories();
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

    const summaryItems = buildSummaryItems(records.data, categories, '本周');
    const summaryText = toSummaryText(summaryItems);

    await db.collection('diaries').add({
      data: {
        type: 'weekly',
        startDate: startDate,
        endDate: endDate,
        content: summaryText,
        summaryItems,
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
    return {
      success: false,
      message: '生成每周条目总结失败',
      error: error.message
    };
  }
};
