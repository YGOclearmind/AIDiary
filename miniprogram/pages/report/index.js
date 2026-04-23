function toTypeLabel(type) {
  if (type === 'daily') {
    return '每日条目总结';
  }
  if (type === 'weekly') {
    return '每周条目总结';
  }
  if (type === 'yearly') {
    return '年度条目总结';
  }
  return '条目总结';
}

function normalizeSummaryItems(summaryItems) {
  if (!Array.isArray(summaryItems)) {
    return [];
  }
  return summaryItems.map(item => ({
    ...item,
    points: Array.isArray(item.points) ? item.points : (item.points ? [String(item.points)] : []),
    pointsText: Array.isArray(item.points) ? item.points.join('；') : (item.points ? String(item.points) : '')
  }));
}

function buildItemsFromContent(content) {
  const text = String(content || '').trim();
  if (!text) {
    return [];
  }
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  return lines.map(line => {
    const splitIndex = line.indexOf('：');
    if (splitIndex > 0) {
      return {
        title: line.slice(0, splitIndex),
        points: [line.slice(splitIndex + 1)],
        pointsText: line.slice(splitIndex + 1)
      };
    }
    return {
      title: '内容',
      points: [line],
      pointsText: line
    };
  });
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDayText(date) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

function formatTimeText(date, withDate) {
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  if (withDate) {
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    return `${month}-${day} ${hh}:${mm}`;
  }
  return `${hh}:${mm}`;
}

function normalizeTimelineRecords(records, type) {
  if (!Array.isArray(records)) {
    return [];
  }
  const sorted = records
    .filter(item => item && typeof item.timestamp === 'number')
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);

  const withDate = type === 'weekly' || type === 'yearly';
  let lastDay = '';
  return sorted.map((item, index) => {
    const date = new Date(item.timestamp);
    const dayText = formatDayText(date);
    const showDay = dayText !== lastDay;
    lastDay = dayText;
    const contentText = String(item.transcript || item.content || '').trim();
    const category = String(item.category || '').trim();
    const recordType = item.recordType || 'text';
    return {
      _id: item._id || `${item.timestamp}_${index}`,
      timestamp: item.timestamp,
      dayText: showDay ? dayText : '',
      timeText: formatTimeText(date, withDate),
      category,
      recordTypeText: recordType === 'audio' ? '语音' : '文字',
      contentText
    };
  }).map((item, index, list) => ({
    ...item,
    isLast: index === list.length - 1
  }));
}

function parseDateToRange(type, dateText) {
  const safe = String(dateText || '').trim();
  if (type === 'daily') {
    const parts = safe.split('-').map(part => Number(part));
    if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
      const start = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
      const end = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
      return { startTimestamp: start.getTime(), endTimestamp: end.getTime() };
    }
    return null;
  }

  if (type === 'weekly') {
    const split = safe.split('至').map(item => item.trim()).filter(Boolean);
    if (split.length >= 2) {
      const startParts = split[0].split('-').map(part => Number(part));
      const endParts = split[1].split('-').map(part => Number(part));
      if (startParts.length >= 3 && endParts.length >= 3) {
        const start = new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0);
        const end = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999);
        return { startTimestamp: start.getTime(), endTimestamp: end.getTime() };
      }
    }
    return null;
  }

  if (type === 'yearly') {
    const match = safe.match(/(\d{4})/);
    const year = match ? Number(match[1]) : NaN;
    if (year) {
      const start = new Date(year, 0, 1, 0, 0, 0, 0);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      return { startTimestamp: start.getTime(), endTimestamp: end.getTime(), year };
    }
    return null;
  }

  return null;
}

function fetchAllRecordsByQuery(queryBuilder, batchSize = 100) {
  const runBatch = (skip) => new Promise((resolve) => {
    queryBuilder(skip, batchSize).get({
      success: (res) => {
        const list = (res && res.data) ? res.data : [];
        resolve(list);
      },
      fail: () => resolve([])
    });
  });

  const loop = async () => {
    let skip = 0;
    const all = [];
    while (skip < 2000) {
      const batch = await runBatch(skip);
      all.push(...batch);
      if (!batch.length || batch.length < batchSize) {
        break;
      }
      skip += batchSize;
    }
    return all;
  };

  return loop();
}

Page({
  data: {
    currentTab: 'outline',
    currentTabIndex: 0,
    title: '总结详情',
    typeLabel: '条目总结',
    date: '',
    content: '',
    summaryItems: [],
    timelineRecords: []
  },

  setCurrentTab(tab) {
    const order = ['outline', 'full'];
    const nextIndex = Math.max(0, order.indexOf(tab));
    const nextTab = order[nextIndex] || 'outline';
    this.setData({
      currentTab: nextTab,
      currentTabIndex: nextIndex
    });
  },

  switchReportTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.currentTab) {
      return;
    }
    this.setCurrentTab(tab);
  },

  onTabSwiperChange(e) {
    const index = Number(e.detail.current || 0);
    const order = ['outline', 'full'];
    const tab = order[index] || 'outline';
    if (tab === this.data.currentTab && index === this.data.currentTabIndex) {
      return;
    }
    this.setCurrentTab(tab);
  },

  onLoad(options) {
    const app = getApp();
    const globalPayload = (app && app.globalData && app.globalData.latestReportPayload) || {};
    const keyPayload = options.reportKey ? (wx.getStorageSync(options.reportKey) || {}) : {};
    const latestPayload = wx.getStorageSync('latestReportPayload') || {};
    const payload = Object.keys(keyPayload).length ? keyPayload : (Object.keys(globalPayload).length ? globalPayload : latestPayload);
    const type = options.type || payload.type || 'summary';
    const title = decodeURIComponent(options.title || payload.title || '总结详情');
    const date = decodeURIComponent(options.date || payload.date || '');

    const applyPayload = (data = {}) => {
      const textContent = String(data.content || '').trim();
      const normalizedItems = normalizeSummaryItems(data.summaryItems);
      const displayItems = normalizedItems.length ? normalizedItems : buildItemsFromContent(textContent);
      this.setData({
        title: title || data.title || '总结详情',
        typeLabel: toTypeLabel(data.type || type),
        date: date || data.date || '',
        content: textContent,
        summaryItems: displayItems
      });
    };

    applyPayload(payload);

    const reportId = options.reportId ? decodeURIComponent(options.reportId) : '';
    const hasLocalContent = !!(payload && (payload.content || (Array.isArray(payload.summaryItems) && payload.summaryItems.length)));
    if (reportId && !hasLocalContent) {
      const db = wx.cloud.database();
      db.collection('summaryHistory').doc(reportId).get({
        success: (res) => {
          const data = res && res.data ? res.data : null;
          if (data) {
            applyPayload({
              ...data,
              type: data.type || type,
              title: title || toTypeLabel(data.type),
              date: data.date || date
            });
          }
        },
        fail: () => {
          // 忽略详情补拉失败，页面继续显示已有数据
        }
      });
    }

    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (eventChannel && eventChannel.on) {
      eventChannel.on('reportPayload', (data) => {
        applyPayload(data || {});
      });
    }

    if (!payload || (!payload.content && (!Array.isArray(payload.summaryItems) || !payload.summaryItems.length))) {
      wx.showToast({
        title: '报告内容为空，请重试',
        icon: 'none'
      });
    }

    this.loadTimelineRecords(type, date);
  },

  loadTimelineRecords(type, dateText) {
    const range = parseDateToRange(type, dateText);
    if (!range) {
      return;
    }
    const db = wx.cloud.database();
    const _ = db.command;
    const where = {
      timestamp: _.gte(range.startTimestamp).and(_.lte(range.endTimestamp))
    };

    wx.showLoading({ title: '加载时间线...' });
    fetchAllRecordsByQuery((skip, limit) => db.collection('records')
      .where(where)
      .orderBy('timestamp', 'asc')
      .skip(skip)
      .limit(limit))
      .then((records) => {
        const timeline = normalizeTimelineRecords(records, type).filter(item => item.contentText);
        this.setData({
          timelineRecords: timeline
        });
      })
      .finally(() => {
        wx.hideLoading();
      });
  },

  copyReport() {
    const { content, summaryItems } = this.data;
    let text = content;
    if (!text && Array.isArray(summaryItems) && summaryItems.length) {
      text = summaryItems.map(item => `${item.title}：${(item.points || []).join('；')}`).join('\n');
    }
    wx.setClipboardData({
      data: text || '暂无内容',
      success() {
        wx.showToast({
          title: '复制成功',
          icon: 'success'
        });
      }
    });
  }
});
