const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const ACTIVE_DAYS = 14;
const QUERY_LIMIT = 100;
const USER_BATCH_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

function padNumber(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function formatCstDateFromMs(timestamp) {
  const cst = new Date(Number(timestamp) + CST_OFFSET_MS);
  return `${cst.getUTCFullYear()}/${cst.getUTCMonth() + 1}/${cst.getUTCDate()}`;
}

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

function getCategory(record) {
  return normalizeText(record && record.category) || '其他';
}

function toSummaryItems(records) {
  const grouped = {};
  for (const record of records) {
    const content = getRecordText(record);
    if (!content) {
      continue;
    }
    const title = getCategory(record);
    if (!grouped[title]) {
      grouped[title] = [];
    }
    if (!grouped[title].includes(content)) {
      grouped[title].push(content);
    }
  }
  return Object.keys(grouped).map(title => ({
    title,
    category: title,
    points: grouped[title]
  })).filter(item => item.points.length > 0);
}

function toSummaryText(summaryItems) {
  if (!Array.isArray(summaryItems) || !summaryItems.length) {
    return '';
  }
  return summaryItems.map(item => `${item.title}：${item.points.join('；')}`).join('\n');
}

function getCstDayRange(nowMs, offsetDays) {
  const base = new Date(Number(nowMs) + CST_OFFSET_MS);
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate() + Number(offsetDays || 0);
  const startUtcMs = Date.UTC(year, month, day, 0, 0, 0, 0) - CST_OFFSET_MS;
  return {
    start: new Date(startUtcMs),
    end: new Date(startUtcMs + DAY_MS - 1)
  };
}

function getCstLastWeekRange(nowMs) {
  const base = new Date(Number(nowMs) + CST_OFFSET_MS);
  const todayStartUtcMs = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0) - CST_OFFSET_MS;
  const weekday = base.getUTCDay(); // CST weekday
  const diffToMonday = weekday === 0 ? 6 : weekday - 1;
  const thisMondayStartUtcMs = todayStartUtcMs - diffToMonday * DAY_MS;
  const lastMondayStartUtcMs = thisMondayStartUtcMs - 7 * DAY_MS;
  const lastSundayEndUtcMs = thisMondayStartUtcMs - 1;
  return {
    start: new Date(lastMondayStartUtcMs),
    end: new Date(lastSundayEndUtcMs)
  };
}

function isCstMonday(nowMs) {
  const base = new Date(Number(nowMs) + CST_OFFSET_MS);
  return base.getUTCDay() === 1;
}

function chunkArray(list, size) {
  const result = [];
  for (let i = 0; i < list.length; i += size) {
    result.push(list.slice(i, i + size));
  }
  return result;
}

async function getActiveOpenids(activeSinceTimestamp, maxUsers = 500) {
  const openidSet = new Set();
  let skip = 0;
  while (openidSet.size < maxUsers) {
    const res = await db.collection('records')
      .where({
        timestamp: _.gte(activeSinceTimestamp)
      })
      .field({
        _openid: true
      })
      .orderBy('timestamp', 'desc')
      .skip(skip)
      .limit(QUERY_LIMIT)
      .get();
    const list = Array.isArray(res.data) ? res.data : [];
    if (!list.length) {
      break;
    }
    for (const item of list) {
      if (item && item._openid) {
        openidSet.add(item._openid);
      }
      if (openidSet.size >= maxUsers) {
        break;
      }
    }
    if (list.length < QUERY_LIMIT) {
      break;
    }
    skip += QUERY_LIMIT;
  }
  return Array.from(openidSet);
}

async function listRecordsByOpenid(openid, startTimestamp, endTimestamp) {
  let skip = 0;
  const records = [];
  while (true) {
    const res = await db.collection('records')
      .where({
        _openid: openid,
        timestamp: _.gte(startTimestamp).and(_.lte(endTimestamp))
      })
      .orderBy('timestamp', 'asc')
      .skip(skip)
      .limit(QUERY_LIMIT)
      .get();
    const list = Array.isArray(res.data) ? res.data : [];
    if (!list.length) {
      break;
    }
    records.push(...list);
    if (list.length < QUERY_LIMIT) {
      break;
    }
    skip += QUERY_LIMIT;
  }
  return records;
}

async function hasSummary(type, date, openid) {
  const res = await db.collection('summaryHistory')
    .where({
      type,
      date,
      userOpenid: openid
    })
    .limit(1)
    .get();
  return Array.isArray(res.data) && res.data.length > 0;
}

async function saveSummary({ type, date, openid, summaryText, summaryItems }) {
  const now = new Date();
  await db.collection('summaryHistory').add({
    data: {
      type,
      date,
      content: summaryText,
      summaryItems,
      timestamp: now.getTime(),
      createTime: now.toLocaleString(),
      userOpenid: openid,
      source: 'cron'
    }
  });
}

async function generateOneSummary({ openid, type, date, startTimestamp, endTimestamp }) {
  const exists = await hasSummary(type, date, openid);
  if (exists) {
    return { status: 'skipped_exists' };
  }
  const records = await listRecordsByOpenid(openid, startTimestamp, endTimestamp);
  if (!records.length) {
    return { status: 'skipped_empty' };
  }
  const summaryItems = toSummaryItems(records);
  const summaryText = toSummaryText(summaryItems);
  if (!summaryText) {
    return { status: 'skipped_empty' };
  }
  await saveSummary({
    type,
    date,
    openid,
    summaryText,
    summaryItems
  });
  return { status: 'created' };
}

exports.config = {
  timeout: 120000
};

exports.main = async (event) => {
  const now = event && event.now ? new Date(event.now) : new Date();
  const nowMs = now.getTime();
  const maxUsers = Number((event && event.maxUsers) || 500);
  const activeSince = nowMs - ACTIVE_DAYS * DAY_MS;
  const openids = await getActiveOpenids(activeSince, maxUsers);

  const yesterday = getCstDayRange(nowMs, -1);
  const dailyDate = formatCstDateFromMs(yesterday.start.getTime());
  const shouldRunWeekly = isCstMonday(nowMs);
  const lastWeek = shouldRunWeekly ? getCstLastWeekRange(nowMs) : null;
  const weeklyDate = shouldRunWeekly
    ? `${formatCstDateFromMs(lastWeek.start.getTime())} 至 ${formatCstDateFromMs(lastWeek.end.getTime())}`
    : '';

  const stats = {
    activeUsers: openids.length,
    dailyCreated: 0,
    dailySkippedExists: 0,
    dailySkippedEmpty: 0,
    dailyFailed: 0,
    weeklyCreated: 0,
    weeklySkippedExists: 0,
    weeklySkippedEmpty: 0,
    weeklyFailed: 0
  };

  const userBatches = chunkArray(openids, USER_BATCH_SIZE);
  for (const batch of userBatches) {
    const dailyResults = await Promise.allSettled(batch.map(async (openid) => {
      return generateOneSummary({
        openid,
        type: 'daily',
        date: dailyDate,
        startTimestamp: yesterday.start.getTime(),
        endTimestamp: yesterday.end.getTime()
      });
    }));
    for (const result of dailyResults) {
      if (result.status === 'fulfilled') {
        const value = result.value || {};
        if (value.status === 'created') {
          stats.dailyCreated += 1;
        } else if (value.status === 'skipped_exists') {
          stats.dailySkippedExists += 1;
        } else if (value.status === 'skipped_empty') {
          stats.dailySkippedEmpty += 1;
        }
      } else {
        stats.dailyFailed += 1;
      }
    }

    if (!shouldRunWeekly) {
      continue;
    }

    const weeklyResults = await Promise.allSettled(batch.map(async (openid) => {
      return generateOneSummary({
        openid,
        type: 'weekly',
        date: weeklyDate,
        startTimestamp: lastWeek.start.getTime(),
        endTimestamp: lastWeek.end.getTime()
      });
    }));
    for (const result of weeklyResults) {
      if (result.status === 'fulfilled') {
        const value = result.value || {};
        if (value.status === 'created') {
          stats.weeklyCreated += 1;
        } else if (value.status === 'skipped_exists') {
          stats.weeklySkippedExists += 1;
        } else if (value.status === 'skipped_empty') {
          stats.weeklySkippedEmpty += 1;
        }
      } else {
        stats.weeklyFailed += 1;
      }
    }
  }

  return {
    success: true,
    runAt: now.toISOString(),
    shouldRunWeekly,
    dailyDate,
    weeklyDate,
    stats
  };
};
