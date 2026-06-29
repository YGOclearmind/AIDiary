function pad2(n) { return String(n).padStart(2, '0'); }

function normalizeText(text) {
  return String(text || '').trim();
}

function normalizeAvatarUrl(raw) {
  const source = String(raw || '').trim();
  if (!source) return '';
  const httpIndex = source.indexOf('http');
  if (httpIndex < 0) return '';
  const sliced = source.slice(httpIndex);
  const match = sliced.match(/^https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+/);
  return match ? match[0] : '';
}

function toDateString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateString(dateStr) {
  const parts = String(dateStr || '').split('-');
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

function addDays(date, offset) {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}

function formatSummaryDate(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function getDayRangeByDate(date, today) {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterday = addDays(todayDate, -1);
  const currentStr = toDateString(current);
  const todayStr = toDateString(todayDate);
  const yesterdayStr = toDateString(yesterday);
  let label = `${current.getMonth() + 1}月${current.getDate()}日`;
  if (currentStr === todayStr) label = '今天';
  if (currentStr === yesterdayStr) label = '昨天';
  return {
    start: current,
    end: new Date(current.getFullYear(), current.getMonth(), current.getDate(), 23, 59, 59, 999),
    label
  };
}

function getWeekRangeByDate(date) {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = current.getDay() || 7;
  const monday = addDays(current, 1 - day);
  const sunday = addDays(monday, 6);
  return {
    start: monday,
    end: new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59, 999),
    label: `${monday.getMonth() + 1}月${monday.getDate()}日 - ${sunday.getMonth() + 1}月${sunday.getDate()}日`
  };
}

function generateCalendarDays(year, month, recordDays, selectedDate) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  const todayStr = toDateString(today);

  const days = [];
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const pm = month === 0 ? 11 : month - 1;
    const py = month === 0 ? year - 1 : year;
    const d = prevMonthLastDay - i;
    const dateStr = `${py}-${pad2(pm + 1)}-${pad2(d)}`;
    days.push({ day: d, isCurrentMonth: false, isToday: false, hasRecord: recordDays.has(dateStr), isSelected: dateStr === selectedDate, dateStr, isFuture: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    days.push({
      day: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      hasRecord: recordDays.has(dateStr),
      isSelected: dateStr === selectedDate,
      dateStr,
      isFuture: dateStr > todayStr
    });
  }
  const nm = month === 11 ? 0 : month + 1;
  const ny = month === 11 ? year + 1 : year;
  let nextDay = 1;
  while (days.length < 42) {
    const dateStr = `${ny}-${pad2(nm + 1)}-${pad2(nextDay)}`;
    days.push({ day: nextDay, isCurrentMonth: false, isToday: false, hasRecord: recordDays.has(dateStr), isSelected: dateStr === selectedDate, dateStr, isFuture: true });
    nextDay++;
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push({ days: days.slice(i, i + 7), weekIndex: i / 7 });
  }
  return weeks;
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

const PERIOD_NAMES = { day: '日', week: '周' };
const COVER_EMOJIS = { day: '☀️', week: '🌸' };

Page({
  data: {
    currentPeriod: 'day',
    selectedDate: '',
    todayStr: '',
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
    showSwipeHint: true,
    avatarDisplayUrl: '',
    hasAvatarImage: false,
    chooseAvatarSupported: false,
    showCalendar: false,
    calWeekDays: ['日', '一', '二', '三', '四', '五', '六'],
    calTitle: '',
    calDays: [],
    calYear: 0,
    calMonth: 0
  },

  onLoad() {
    // 登录拦截
    try {
      const isLoggedIn = wx.getStorageSync('isLoggedIn');
      if (!isLoggedIn) {
        wx.redirectTo({ url: '/pages/login/index' });
        return;
      }
    } catch (e) {
      wx.redirectTo({ url: '/pages/login/index' });
      return;
    }

    const now = new Date();
    this.setData({
      chooseAvatarSupported: !!(wx.canIUse && wx.canIUse('button.open-type.chooseAvatar')),
      selectedDate: toDateString(now),
      todayStr: toDateString(now),
      calYear: now.getFullYear(),
      calMonth: now.getMonth()
    });
    this.loadAvatar();
    this.updatePeriodInfo();
    this._swipeHintTimer = setTimeout(() => {
      this.setData({ showSwipeHint: false });
    }, 4000);
  },

  onShow() {
    this.loadAvatar();
  },

  onUnload() {
    if (this._swipeHintTimer) clearTimeout(this._swipeHintTimer);
  },

  loadAvatar() {
    try {
      const avatarSource = String(wx.getStorageSync('avatarSource') || '').trim();
      const avatarLocalPath = String(wx.getStorageSync('avatarLocalPath') || '').trim();
      const avatarRemoteUrl = normalizeAvatarUrl(wx.getStorageSync('userAvatarUrl') || '');
      const avatarDisplayUrl = avatarSource === 'chooseAvatar'
        ? avatarLocalPath
        : avatarRemoteUrl;
      this.setData({
        avatarDisplayUrl,
        hasAvatarImage: !!avatarDisplayUrl
      });
    } catch (err) {
      console.error('[summary] loadAvatar failed', err);
    }
  },

  onChooseAvatar(e) {
    const avatarUrl = String((e && e.detail && e.detail.avatarUrl) || '').trim();
    console.error('[summary] chooseAvatar result', avatarUrl);
    if (!avatarUrl) {
      wx.showToast({ title: '未获取到头像', icon: 'none' });
      return;
    }
    try { wx.setStorageSync('avatarLocalPath', avatarUrl); } catch (err) {}
    try { wx.setStorageSync('avatarSource', 'chooseAvatar'); } catch (err) {}
    try { wx.setStorageSync('avatarAuthDone', true); } catch (err) {}
    this.setData({
      avatarDisplayUrl: avatarUrl,
      hasAvatarImage: true
    });
  },

  getRange() {
    const { currentPeriod, selectedDate, todayStr } = this.data;
    const baseDate = parseDateString(selectedDate || todayStr || toDateString(new Date()));
    if (currentPeriod === 'day') {
      return getDayRangeByDate(baseDate, parseDateString(todayStr || toDateString(new Date())));
    }
    return getWeekRangeByDate(baseDate);
  },

  isFutureDate(date) {
    const today = parseDateString(this.data.todayStr || toDateString(new Date()));
    return toDateString(date) > toDateString(today);
  },

  updatePeriodInfo() {
    const { currentPeriod } = this.data;
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
    const type = period === 'day' ? 'daily' : 'weekly';
    const dateKey = period === 'day'
      ? formatSummaryDate(range.start)
      : `${formatSummaryDate(range.start)} 至 ${formatSummaryDate(range.end)}`;
    const request = querySummaryHistory(db, { type, dateKey });

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
  },

  openCalendar() {
    const selected = parseDateString(this.data.selectedDate || this.data.todayStr);
    this.setData({
      showCalendar: true,
      calYear: selected.getFullYear(),
      calMonth: selected.getMonth()
    });
    this.loadCalRecords();
  },

  closeCalendar() {
    this.setData({ showCalendar: false });
  },

  preventTap() {},

  loadCalRecords() {
    const year = this.data.calYear;
    const month = this.data.calMonth;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const db = wx.cloud.database();
    const _ = db.command;
    db.collection('records')
      .where({ timestamp: _.gte(start.getTime()).and(_.lte(end.getTime())) })
      .limit(1000)
      .get({
        success: res => {
          const recordDays = new Set();
          (res.data || []).forEach(item => {
            const d = new Date(item.timestamp);
            recordDays.add(toDateString(d));
          });
          this.setData({
            calTitle: `${year}年 ${month + 1}月`,
            calDays: generateCalendarDays(year, month, recordDays, this.data.selectedDate)
          });
        },
        fail: () => {
          this.setData({
            calTitle: `${year}年 ${month + 1}月`,
            calDays: generateCalendarDays(year, month, new Set(), this.data.selectedDate)
          });
        }
      });
  },

  calPrevMonth() {
    let year = this.data.calYear;
    let month = this.data.calMonth - 1;
    if (month < 0) { month = 11; year--; }
    this.setData({ calYear: year, calMonth: month });
    this.loadCalRecords();
  },

  calNextMonth() {
    let year = this.data.calYear;
    let month = this.data.calMonth + 1;
    const today = parseDateString(this.data.todayStr || toDateString(new Date()));
    const maxYear = today.getFullYear();
    const maxMonth = today.getMonth();
    if (month > 11) { month = 0; year++; }
    if (year > maxYear || (year === maxYear && month > maxMonth)) return;
    this.setData({ calYear: year, calMonth: month });
    this.loadCalRecords();
  },

  goToToday() {
    const today = parseDateString(this.data.todayStr || toDateString(new Date()));
    this.setData({
      selectedDate: toDateString(today),
      calYear: today.getFullYear(),
      calMonth: today.getMonth(),
      showCalendar: false
    });
    this.updatePeriodInfo();
  },

  onCalDayTap(e) {
    const dateStr = e.currentTarget.dataset.date;
    if (dateStr > this.data.todayStr) {
      wx.showToast({ title: '暂不能选择未来日期', icon: 'none', duration: 2000 });
      return;
    }
    this.setData({
      selectedDate: dateStr,
      showCalendar: false
    });
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
    const step = this.data.currentPeriod === 'week' ? 7 : 1;
    const current = parseDateString(this.data.selectedDate || this.data.todayStr);
    const nextDate = addDays(current, direction * step);

    if (this.isFutureDate(nextDate)) {
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
        selectedDate: toDateString(nextDate),
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
