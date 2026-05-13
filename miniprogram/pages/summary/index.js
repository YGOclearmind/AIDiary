function pad2(n) { return String(n).padStart(2, '0'); }

function normalizeText(text) {
  return String(text || '').trim();
}

function formatSummaryDate(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function getDayRange(offset) {
  const now = new Date();
  now.setDate(now.getDate() + offset);
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
    label: offset === 0 ? '今天' : offset === -1 ? '昨天' : offset === 1 ? '明天' : `${now.getMonth() + 1}月${now.getDate()}日`
  };
}

function getWeekRange(offset) {
  const now = new Date();
  const day = now.getDay() || 7;
  const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
  const monday = new Date(thisMonday);
  monday.setDate(thisMonday.getDate() + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday,
    end: new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59, 999),
    label: `${monday.getMonth() + 1}月${monday.getDate()}日 — ${sunday.getMonth() + 1}月${sunday.getDate()}日`
  };
}

function getYearRange(offset) {
  const year = new Date().getFullYear() + offset;
  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31, 23, 59, 59, 999),
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

const PERIOD_NAMES = { day: '日', week: '周', year: '年' };
const COVER_EMOJIS = { day: '☀️', week: '🌸', year: '🎆' };

Page({
  data: {
    currentPeriod: 'day',
    periodOffset: -1,
    periodLabel: '',
    periodName: '日',
    coverEmoji: '☀️',
    summaryText: '',
    summaryLoading: false,
    summaryError: '',
    themeTags: [],
    highlights: [],
    touchStartX: 0,
    touchStartY: 0,
    cardTranslateX: 0,
    cardOpacity: 1,
    cardAnimating: false,
    showSwipeHint: true
  },

  onLoad() {
    this.updatePeriodInfo();
    this._swipeHintTimer = setTimeout(() => {
      this.setData({ showSwipeHint: false });
    }, 4000);
  },

  onUnload() {
    if (this._swipeHintTimer) clearTimeout(this._swipeHintTimer);
  },

  getRange() {
    const { currentPeriod, periodOffset } = this.data;
    if (currentPeriod === 'day') return getDayRange(periodOffset);
    if (currentPeriod === 'week') return getWeekRange(periodOffset);
    return getYearRange(periodOffset);
  },

  isFutureOffset(offset) {
    return offset > 0;
  },

  updatePeriodInfo() {
    const { currentPeriod, periodOffset } = this.data;
    const range = this.getRange();
    this.setData({
      periodLabel: range.label,
      periodName: PERIOD_NAMES[currentPeriod],
      coverEmoji: COVER_EMOJIS[currentPeriod]
    });
    this.loadPeriodContent(currentPeriod, range);
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
    this.setData({ currentPeriod: period, periodOffset: -1 });
    this.updatePeriodInfo();
  },

  onTouchStart(e) {
    if (!e.touches || !e.touches.length) return;
    this.setData({
      touchStartX: e.touches[0].clientX,
      touchStartY: e.touches[0].clientY,
      cardAnimating: false
    });
  },

  onTouchMove(e) {
    if (!e.touches || !e.touches.length) return;
    const deltaX = e.touches[0].clientX - this.data.touchStartX;
    const deltaY = e.touches[0].clientY - this.data.touchStartY;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    const dampen = 0.4;
    const tx = deltaX * dampen;
    const opacity = Math.max(0.5, 1 - Math.abs(deltaX) / 600);
    this.setData({
      cardTranslateX: tx,
      cardOpacity: opacity
    });
  },

  onTouchEnd(e) {
    if (!e.changedTouches || !e.changedTouches.length) return;
    const deltaX = e.changedTouches[0].clientX - this.data.touchStartX;
    const deltaY = e.changedTouches[0].clientY - this.data.touchStartY;

    this.setData({ cardAnimating: true });

    if (Math.abs(deltaX) < 60 || Math.abs(deltaY) > Math.abs(deltaX)) {
      this.setData({ cardTranslateX: 0, cardOpacity: 1 });
      setTimeout(() => this.setData({ cardAnimating: false }), 300);
      return;
    }

    const direction = deltaX > 0 ? -1 : 1;
    const newOffset = this.data.periodOffset + direction;

    if (this.isFutureOffset(newOffset)) {
      this.setData({ cardTranslateX: 0, cardOpacity: 1 });
      setTimeout(() => this.setData({ cardAnimating: false }), 300);
      wx.showToast({ title: '已到达最新日期', icon: 'none', duration: 1500 });
      return;
    }

    const exitX = direction * -300;
    this.setData({
      cardTranslateX: exitX,
      cardOpacity: 0
    });

    setTimeout(() => {
      this.setData({
        periodOffset: newOffset,
        cardAnimating: false,
        cardTranslateX: direction * 300,
        cardOpacity: 0
      });

      this.updatePeriodInfo();

      setTimeout(() => {
        this.setData({ cardAnimating: true, cardTranslateX: 0, cardOpacity: 1 });
        setTimeout(() => this.setData({ cardAnimating: false }), 350);
      }, 50);
    }, 280);
  }
});