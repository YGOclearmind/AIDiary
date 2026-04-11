const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

let todayApiConfig = {
  url: 'https://cn.apihz.cn/api/zici/today.php',
  id: '',
  key: ''
};

try {
  const config = require('./config.js');
  if (config && config.todayApiConfig) {
    todayApiConfig = {
      ...todayApiConfig,
      ...config.todayApiConfig
    };
  }
} catch (error) {
}

function padNumber(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function getMonthDay(date) {
  return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function getDateStartTimestamp(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return start.getTime();
}

function normalizeFacts(rawFacts) {
  if (!Array.isArray(rawFacts)) {
    return [];
  }
  const unique = new Set();
  rawFacts.forEach(item => {
    const text = String(item || '').trim();
    if (text) {
      unique.add(text);
    }
  });
  return Array.from(unique);
}

function sampleItems(list, count) {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

async function getCachedFacts(monthDay, dateStartTimestamp) {
  const res = await db.collection('todayFacts')
    .where({
      monthDay,
      source: 'aa1',
      cacheDate: dateStartTimestamp
    })
    .limit(1)
    .get();
  if (!res.data.length) {
    return [];
  }
  const facts = res.data[0].facts || [];
  return Array.isArray(facts) ? facts : [];
}

async function saveFactsCache(monthDay, dateStartTimestamp, facts) {
  const res = await db.collection('todayFacts')
    .where({
      monthDay,
      source: 'aa1'
    })
    .limit(1)
    .get();
  const cacheData = {
    monthDay,
    source: 'aa1',
    cacheDate: dateStartTimestamp,
    facts,
    updatedAt: Date.now()
  };
  if (res.data.length) {
    await db.collection('todayFacts').doc(res.data[0]._id).update({
      data: cacheData
    });
    return;
  }
  await db.collection('todayFacts').add({
    data: cacheData
  });
}

async function fetchFactsFromApi() {
  if (!todayApiConfig.id || !todayApiConfig.key) {
    return [];
  }
  const response = await axios.get(todayApiConfig.url, {
    params: {
      id: todayApiConfig.id,
      key: todayApiConfig.key
    },
    timeout: 10000
  });
  const body = response.data || {};
  if (body.code !== 200) {
    return [];
  }
  return normalizeFacts(body.data);
}

async function getFacts(monthDay, dateStartTimestamp) {
  const cachedFacts = await getCachedFacts(monthDay, dateStartTimestamp);
  if (cachedFacts.length) {
    return cachedFacts;
  }
  const facts = await fetchFactsFromApi();
  if (facts.length) {
    await saveFactsCache(monthDay, dateStartTimestamp, facts);
  }
  return facts;
}

function mapMemoryRecord(record) {
  const text = (record.transcript || record.content || '').trim();
  return {
    _id: record._id,
    year: record.year || '',
    date: record.date || '',
    content: text.length > 80 ? `${text.slice(0, 80)}...` : text,
    recordType: record.recordType || 'text'
  };
}

function hasSameMonthDayByDateString(dateText, monthDay) {
  if (!dateText || !monthDay) {
    return false;
  }
  const parts = String(dateText).split('/');
  if (parts.length < 3) {
    return false;
  }
  const month = padNumber(Number(parts[1]));
  const day = padNumber(Number(parts[2]));
  return `${month}-${day}` === monthDay;
}

async function getMemoryRecords(openid, monthDay, currentYear) {
  const directRes = await db.collection('records')
    .where({
      _openid: openid,
      monthDay,
      year: _.lt(currentYear)
    })
    .orderBy('year', 'desc')
    .limit(20)
    .get();

  if (directRes.data.length) {
    return directRes.data.map(mapMemoryRecord);
  }

  const fallbackRes = await db.collection('records')
    .where({
      _openid: openid
    })
    .orderBy('timestamp', 'desc')
    .limit(200)
    .get();

  return fallbackRes.data
    .filter(item => hasSameMonthDayByDateString(item.date, monthDay))
    .filter(item => !item.year || Number(item.year) < currentYear)
    .map(mapMemoryRecord)
    .slice(0, 20);
}

exports.main = async (event) => {
  try {
    const now = new Date();
    const targetDate = event && event.date ? new Date(event.date) : now;
    const date = Number.isNaN(targetDate.getTime()) ? now : targetDate;
    const monthDay = getMonthDay(date);
    const dateStartTimestamp = getDateStartTimestamp(now);
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    const facts = await getFacts(monthDay, dateStartTimestamp);
    const memoryRecords = await getMemoryRecords(openid, monthDay, now.getFullYear());

    return {
      success: true,
      monthDay,
      facts: sampleItems(facts, 10),
      memoryRecords
    };
  } catch (error) {
    return {
      success: false,
      monthDay: getMonthDay(new Date()),
      facts: [],
      memoryRecords: [],
      message: error.message || '获取灵感失败'
    };
  }
};
