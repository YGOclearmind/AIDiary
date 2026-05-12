function pad2(n) { return String(n).padStart(2, '0'); }

function normalizeText(text) {
  return String(text || '').trim();
}

function formatSummaryDate(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function getYesterdayRange() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
    label: `${now.getMonth() + 1}月${now.getDate()}日`
  };
}

function getLastWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - day + 1);
  thisMonday.setHours(0, 0, 0, 0);
  const monday = new Date(thisMonday);
  monday.setDate(thisMonday.getDate() - 7);
  const sunday = new Date(thisMonday);
  sunday.setMilliseconds(-1);
  return {
    start: monday,
    end: sunday,
    label: `${monday.getMonth() + 1}月${monday.getDate()}日 — ${sunday.getMonth() + 1}月${sunday.getDate()}日`
  };
}

function getLastYearRange() {
  const now = new Date();
  const year = now.getFullYear() - 1;
  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31),
    label: `${year}年`
  };
}

function buildThemeTagsFromSummaryItems(summaryItems) {
  const items = Array.isArray(summaryItems) ? summaryItems : [];
  const ordered = items
    .map(item => ({
      title: normalizeText(item && item.title) || normalizeText(item && item.category) || '其他',
      count: Array.isArray(item && item.points) ? item.points.length : 0
    }))
    .filter(item => item.title)
    .sort((a, b) => b.count - a.count);
  const top = ordered.slice(0, 3).map(item => item.title);
  const emojiMap = {
    工作: '💼',
    学习: '📚',
    阅读: '📖',
    运动: '🏃',
    健康: '🩺',
    关系: '👥',
    美食: '🍜',
    电影: '🎬',
    社交: '👥',
    休闲娱乐: '🎮',
    其他: '🪄'
  };
  const colorClasses = ['tag-orange', 'tag-green', 'tag-blue'];
  return top.map((name, idx) => ({
    name,
    emoji: emojiMap[name] || '🪄',
    cls: colorClasses[idx % colorClasses.length]
  }));
}

function buildHighlightsFromSummaryItems(summaryItems) {
  const items = Array.isArray(summaryItems) ? summaryItems : [];
  const points = [];
  for (const item of items) {
    const list = Array.isArray(item && item.points) ? item.points : [];
    for (const p of list) {
      const text = normalizeText(p);
      if (text) {
        points.push(text);
      }
    }
  }
  return Array.from(new Set(points)).slice(0, 3);
}

function querySummaryHistory(db, { type, dateKey }) {
  return new Promise((resolve) => {
    db.collection('summaryHistory')
      .where({
        type,
        date: dateKey
      })
      .limit(1)
      .get({
        success: res => resolve({ source: 'summaryHistory', data: (res.data || [])[0] || null, error: null }),
        fail: err => resolve({ source: 'summaryHistory', data: null, error: err })
      });
  });
}

Page({
  data: {
    currentPeriod: 'day',
    periodLabel: '',
    periodName: '昨日',
    summaryText: '',
    summaryLoading: false,
    summaryError: '',
    themeTags: [],
    highlights: []
  },

  onLoad() {
    this.updatePeriodInfo();
  },

  updatePeriodInfo() {
    const period = this.data.currentPeriod;
    let range;
    let name;
    if (period === 'day') {
      range = getYesterdayRange();
      name = '昨日';
    } else if (period === 'week') {
      range = getLastWeekRange();
      name = '上周';
    } else {
      range = getLastYearRange();
      name = '去年';
    }
    this.setData({
      periodLabel: range.label,
      periodName: name
    });
    this.loadPeriodContent(period, range);
  },

  loadPeriodContent(period, range) {
    this.setData({
      summaryLoading: true,
      summaryError: '',
      summaryText: '',
      themeTags: [],
      highlights: []
    });
    const db = wx.cloud.database();
    const request = (() => {
      if (period === 'year') {
        const year = range.start.getFullYear();
        return new Promise((resolve) => {
          db.collection('diaries')
            .where({
              type: 'yearly',
              year
            })
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get({
              success: res => resolve({ source: 'diaries', data: (res.data || [])[0] || null, error: null }),
              fail: err => resolve({ source: 'diaries', data: null, error: err })
            });
        });
      }
      const type = period === 'day' ? 'daily' : 'weekly';
      const dateKey = period === 'day'
        ? formatSummaryDate(range.start)
        : `${formatSummaryDate(range.start)} 至 ${formatSummaryDate(range.end)}`;
      return querySummaryHistory(db, { type, dateKey });
    })();

    Promise.resolve(request)
      .then(result => {
        if (result && result.error) {
          const msg = normalizeText(result.error && (result.error.errMsg || result.error.message));
          this.setData({
            summaryLoading: false,
            summaryError: msg || '内容加载失败',
            summaryText: msg || '内容加载失败',
            themeTags: [],
            highlights: []
          });
          return;
        }
        const doc = result && result.data;
        if (!doc) {
          this.setData({
            summaryLoading: false,
            summaryError: '',
            summaryText: '暂无摘要数据',
            themeTags: [],
            highlights: []
          });
          return;
        }
        const summaryItems = Array.isArray(doc.summaryItems) ? doc.summaryItems : [];
        const content = normalizeText(doc.content) || normalizeText(doc.summaryText) || '';
        this.setData({
          summaryLoading: false,
          summaryError: '',
          summaryText: content || '暂无摘要数据',
          themeTags: buildThemeTagsFromSummaryItems(summaryItems),
          highlights: buildHighlightsFromSummaryItems(summaryItems)
        });
      })
      .catch((err) => {
        const message = normalizeText(err && err.message) || '内容加载失败';
        this.setData({
          summaryLoading: false,
          summaryError: message,
          summaryText: message,
          themeTags: [],
          highlights: []
        });
      });
  },

  selectPeriod(e) {
    const period = e.currentTarget.dataset.period;
    if (period === this.data.currentPeriod) return;
    this.setData({ currentPeriod: period });
    this.updatePeriodInfo();
  }
});
