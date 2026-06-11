const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

const CATEGORY_RULES = [
  { name: '美食', keywords: ['美食', '吃', '想吃', '烤鸡', '鸡', '火锅', '烧烤', '烤肉', '炸鸡', '汉堡', '披萨', '拉面', '麻辣烫', '米饭', '面', '饺子', '奶茶', '咖啡', '甜品', '蛋糕', '零食', '外卖', '早餐', '午餐', '晚餐'] },
  { name: '电影', keywords: ['电影', '影院', '看剧', '追剧', '剧', '综艺', '纪录片'] },
  { name: '工作', keywords: ['工作', '加班', '会议', '项目', '报告', '任务', '汇报', '上班', '同事', '领导'] },
  { name: '阅读', keywords: ['读书', '阅读', '书', '小说', '文章', '读', '看', '章节'] },
  { name: '运动', keywords: ['跑步', '运动', '健身', '游泳', '散步', '锻炼', '公里', '瑜伽'] },
  { name: '健康', keywords: ['健康', '医院', '体检', '睡眠', '饮食', '药'] },
  { name: '关系', keywords: ['朋友', '家人', '聊天', '约会', '聚会', '陪伴'] },
  { name: '学习', keywords: ['学习', '课程', '考试', '练习', '笔记', '复习'] },
  { name: '休闲娱乐', keywords: ['游戏', '打游戏', '开黑', '刷视频', '短视频', '抖音', 'B站', 'b站', '微博', '逛街', '旅游', '出游', '放松', '娱乐'] }
];

// 本地关键词匹配，作为云函数调用失败时的兜底
function inferCategoryLocal(text) {
  const source = String(text || '').toLowerCase();
  if (!source) return '其他';
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => source.includes(k))) return rule.name;
  }
  return '其他';
}

function pad2(n) { return String(n).padStart(2, '0'); }

function formatTime(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function getGreetingText() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了 🌙';
  if (h < 9) return '早上好 ☀️';
  if (h < 12) return '上午好 🌤';
  if (h < 14) return '中午好 ☀️';
  if (h < 18) return '下午好 🌅';
  if (h < 22) return '晚上好 🌆';
  return '夜深了 🌙';
}

function getDateTitle(date) {
  const d = date || new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}月${d.getDate()}日，星期${weekDays[d.getDay()]}`;
}

function toDateString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatRecordDate(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function generateCalendarDays(year, month, recordDays, selectedDate) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

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
  // 始终补齐到6行（42天），避免切换月份时日历高度跳动
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

Page({
  data: {
    greetingText: '',
    dateTitle: '',
    selectedDate: '',
    todayStr: '',
    dateBtnLabel: '今天',
    aiSummaryText: '每一天都值得记录，写下今天的故事吧 ✨',
    todayRecords: [],
    inputValue: '',
    userAvatarUrl: '',
    avatarLocalPath: '',
    avatarDisplayUrl: '',
    avatarSource: '',
    hasAvatarImage: false,
    avatarAuthDone: false,
    showAvatarAuth: false,
    showCalendar: false,
    calWeekDays: ['日', '一', '二', '三', '四', '五', '六'],
    calTitle: '',
    calDays: [],
    calYear: 0,
    calMonth: 0
  },

  normalizeAvatarUrl(raw) {
    const source = String(raw || '').trim();
    if (!source) return '';
    const httpIndex = source.indexOf('http');
    if (httpIndex < 0) return '';
    const sliced = source.slice(httpIndex);
    const match = sliced.match(/^https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+/);
    return match ? match[0] : '';
  },

  isValidAvatarUrl(url) {
    return /^https?:\/\//.test(String(url || ''));
  },

  onLoad() {
    this._profileRequesting = false;
    this._profileLastTs = 0;
    this._authToastShown = false;
    this.loadUserAvatar();
    this.ensureAvatarAuthPrompt();
    const now = new Date();
    const todayStr = toDateString(now);
    this.setData({
      greetingText: getGreetingText(),
      dateTitle: getDateTitle(),
      selectedDate: todayStr,
      todayStr: todayStr,
      calYear: now.getFullYear(),
      calMonth: now.getMonth()
    });
    this.getRecordsByDate(now);
    this.loadMemoryInspiration();
  },

  onShow() {
    this.loadUserAvatar();
    this.ensureAvatarAuthPrompt();
    const now = new Date();
    const todayStr = toDateString(now);
    const isToday = this.data.selectedDate === todayStr;
    this.setData({
      greetingText: isToday ? getGreetingText() : '',
      dateTitle: isToday ? getDateTitle() : getDateTitle(this.parseDate(this.data.selectedDate)),
      todayStr: todayStr
    });
    this.getRecordsByDate(isToday ? now : this.parseDate(this.data.selectedDate));
  },

  parseDate(dateStr) {
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  },

  loadUserAvatar() {
    try {
      const raw = wx.getStorageSync('userAvatarUrl') || '';
      const localRaw = wx.getStorageSync('avatarLocalPath') || '';
      const avatarSource = String(wx.getStorageSync('avatarSource') || '').trim();
      const userAvatarUrl = this.normalizeAvatarUrl(raw);
      const avatarLocalPath = String(localRaw || '').trim();
      if (raw && raw !== userAvatarUrl) {
        try { wx.setStorageSync('userAvatarUrl', userAvatarUrl); } catch (e) {}
      }
      const avatarDisplayUrl = avatarSource === 'chooseAvatar' ? avatarLocalPath : '';
      const hasAvatarImage = !!avatarDisplayUrl;
      if (
        userAvatarUrl !== this.data.userAvatarUrl ||
        avatarLocalPath !== this.data.avatarLocalPath ||
        avatarDisplayUrl !== this.data.avatarDisplayUrl ||
        avatarSource !== this.data.avatarSource ||
        hasAvatarImage !== this.data.hasAvatarImage
      ) {
        this.setData({ userAvatarUrl, avatarLocalPath, avatarDisplayUrl, avatarSource, hasAvatarImage });
      }
    } catch (e) {
      console.error('[home] loadUserAvatar failed', e);
    }
  },

  ensureAvatarAuthPrompt() {
    const normalized = this.normalizeAvatarUrl(this.data.userAvatarUrl);
    let authDone = false;
    try { authDone = !!wx.getStorageSync('avatarAuthDone'); } catch (e) {}
    const avatarSource = String(wx.getStorageSync('avatarSource') || '').trim();
    const chooseAvatarSupported = !!(wx.canIUse && wx.canIUse('button.open-type.chooseAvatar'));
    const urlValid = this.isValidAvatarUrl(normalized);
    const avatarLocalPath = String(wx.getStorageSync('avatarLocalPath') || '').trim();
    const hasChosenAvatar = authDone && avatarSource === 'chooseAvatar' && !!avatarLocalPath;
    const hasAvatar = chooseAvatarSupported ? hasChosenAvatar : (urlValid && authDone);
    const nextAvatarUrl = hasAvatar && !chooseAvatarSupported ? normalized : '';
    const nextLocalPath = hasAvatar && chooseAvatarSupported ? avatarLocalPath : '';
    const avatarDisplayUrl = chooseAvatarSupported ? nextLocalPath : nextAvatarUrl;
    this.setData({
      showAvatarAuth: !hasAvatar,
      avatarAuthDone: authDone,
      userAvatarUrl: nextAvatarUrl,
      avatarLocalPath: nextLocalPath,
      avatarDisplayUrl,
      avatarSource,
      hasAvatarImage: !!avatarDisplayUrl
    }, () => {
      console.error('[home] ensureAvatarAuthPrompt', {
        hasAvatar,
        authDone,
        avatarSource,
        chooseAvatarSupported,
        normalized,
        urlValid,
        avatarLocalPath: this.data.avatarLocalPath,
        avatarDisplayUrl: this.data.avatarDisplayUrl,
        rawAvatarInData: this.data.userAvatarUrl,
        showAvatarAuth: this.data.showAvatarAuth
      });
    });
    if (!chooseAvatarSupported && hasAvatar && !avatarLocalPath) {
      console.error('[home] avatar local cache missing, retry download');
      this.cacheAvatarToLocal(nextAvatarUrl);
    }
    if (!hasAvatar && !this._authToastShown) {
      this._authToastShown = true;
      wx.showToast({ title: '未获取到头像，需授权', icon: 'none', duration: 2500 });
    }
  },

  closeAvatarAuth() {
    console.error('[home] closeAvatarAuth');
    this.setData({ showAvatarAuth: false });
  },

  onAvatarImgError(e) {
    console.error('[home] avatar image error', e);
    try { wx.removeStorageSync('userAvatarUrl'); } catch (err) {}
    try { wx.removeStorageSync('avatarLocalPath'); } catch (err) {}
    try { wx.removeStorageSync('avatarSource'); } catch (err) {}
    this.setData({ userAvatarUrl: '', avatarLocalPath: '', avatarDisplayUrl: '', avatarSource: '', hasAvatarImage: false, showAvatarAuth: true });
  },

  onChooseAvatar(e) {
    const avatarUrl = String((e && e.detail && e.detail.avatarUrl) || '').trim();
    console.error('[home] chooseAvatar result', avatarUrl);
    if (!avatarUrl) {
      wx.showToast({ title: '未获取到头像', icon: 'none' });
      return;
    }
    try { wx.setStorageSync('avatarLocalPath', avatarUrl); } catch (err) {}
    try { wx.setStorageSync('avatarAuthDone', true); } catch (err) {}
    try { wx.setStorageSync('avatarSource', 'chooseAvatar'); } catch (err) {}
    this.setData({
      userAvatarUrl: '',
      avatarLocalPath: avatarUrl,
      avatarDisplayUrl: avatarUrl,
      avatarSource: 'chooseAvatar',
      hasAvatarImage: true,
      showAvatarAuth: false,
      avatarAuthDone: true
    });
  },

  cacheAvatarToLocal(remoteUrl) {
    if (!this.isValidAvatarUrl(remoteUrl)) {
      console.error('[home] skip avatar download, invalid url', remoteUrl);
      return;
    }
    wx.downloadFile({
      url: remoteUrl,
      success: (downloadRes) => {
        console.error('[home] avatar download result', downloadRes);
        if (downloadRes.statusCode === 200 && downloadRes.tempFilePath) {
          try { wx.setStorageSync('avatarLocalPath', downloadRes.tempFilePath); } catch (e) {}
          try { wx.setStorageSync('avatarSource', 'download'); } catch (e) {}
          this.setData({
            avatarLocalPath: downloadRes.tempFilePath,
            avatarDisplayUrl: '',
            avatarSource: 'download',
            hasAvatarImage: false
          });
        }
      },
      fail: (err) => {
        console.error('[home] avatar download fail', err);
      }
    });
  },

  onAvatarTap() {
    if (wx.canIUse && wx.canIUse('button.open-type.chooseAvatar')) {
      this.setData({ showAvatarAuth: true });
      return;
    }
    const normalized = this.normalizeAvatarUrl(this.data.userAvatarUrl);
    if (this.isValidAvatarUrl(normalized)) return;
    if (normalized) {
      try { wx.removeStorageSync('userAvatarUrl'); } catch (e) {}
      try { wx.removeStorageSync('avatarLocalPath'); } catch (e) {}
      try { wx.removeStorageSync('avatarSource'); } catch (e) {}
      this.setData({ userAvatarUrl: '', avatarLocalPath: '', avatarDisplayUrl: '', avatarSource: '', hasAvatarImage: false });
    }
    if (!wx.getUserProfile) {
      wx.showToast({ title: '当前微信版本不支持', icon: 'none' });
      return;
    }
    const nowTs = Date.now();
    if (this._profileRequesting) return;
    if (this._profileLastTs && nowTs - this._profileLastTs < 10000) {
      wx.showToast({ title: '操作太频繁，请稍后再试', icon: 'none' });
      return;
    }
    this._profileRequesting = true;
    this._profileLastTs = nowTs;
    console.error('[home] wx.getUserProfile start');
    wx.getUserProfile({
      desc: '用于在首页显示你的微信头像',
      success: (res) => {
        const userInfo = (res && res.userInfo) || {};
        const userAvatarUrl = this.normalizeAvatarUrl(userInfo.avatarUrl || '');
        console.error('[home] avatar url from getUserProfile', userAvatarUrl);
        if (!userAvatarUrl) return;
        try { wx.setStorageSync('userAvatarUrl', userAvatarUrl); } catch (e) {}
        try { wx.setStorageSync('avatarAuthDone', true); } catch (e) {}
        try { wx.setStorageSync('avatarSource', 'profile'); } catch (e) {}
        this.setData({
          userAvatarUrl,
          avatarLocalPath: '',
          avatarDisplayUrl: userAvatarUrl,
          avatarSource: 'profile',
          hasAvatarImage: true,
          showAvatarAuth: false,
          avatarAuthDone: true
        });
        this.cacheAvatarToLocal(userAvatarUrl);
        this._profileRequesting = false;
      },
      fail: (err) => {
        console.error('[home] wx.getUserProfile fail', err);
        this._profileRequesting = false;
        const msg = (err && err.errMsg) || '';
        if (msg.includes('too frequently')) {
          wx.showToast({ title: '获取头像过于频繁，请稍后再试', icon: 'none' });
          return;
        }
      }
    });
  },

  getRecordsByDate(date) {
    const db = wx.cloud.database();
    const _ = db.command;
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

    db.collection('records')
      .where({ timestamp: _.gte(start.getTime()).and(_.lte(end.getTime())) })
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get({
        success: res => {
          const records = (res.data || []).map(item => ({
            _id: item._id,
            timeText: formatTime(new Date(item.timestamp)),
            contentText: item.transcript || item.content || '',
            category: item.category || ''
          }));
          this.setData({ todayRecords: records });
        },
        fail: () => {
          this.setData({ todayRecords: [] });
        }
      });
  },

  loadMemoryInspiration() {
    wx.cloud.callFunction({
      name: 'generateMemoryInspiration',
      data: {},
      success: res => {
        const result = res.result || {};
        if (result.success && result.text) {
          this.setData({ aiSummaryText: result.text });
        }
      },
      fail: () => {}
    });
  },

  openCalendar() {
    const selected = this.parseDate(this.data.selectedDate);
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
            recordDays.add(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
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

  goToToday() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const dateStr = toDateString(today);
    
    this.setData({
      calMonth: month,
      calYear: year,
      selectedDate: dateStr,
      dateBtnLabel: '今天',
      greetingText: getGreetingText(),
      dateTitle: getDateTitle(today),
      showCalendar: false
    });
    this.loadCalRecords();
    this.getRecordsByDate(today);
  },

  calNextMonth() {
    let year = this.data.calYear;
    let month = this.data.calMonth + 1;
    if (month > 11) { month = 0; year++; }
    this.setData({ calYear: year, calMonth: month });
    this.loadCalRecords();
  },

  onCalDayTap(e) {
    const dateStr = e.currentTarget.dataset.date;
    const todayStr = this.data.todayStr;

    if (dateStr > todayStr) {
      wx.showToast({ title: '暂不能选择未来日期', icon: 'none', duration: 2000 });
      return;
    }

    const date = this.parseDate(dateStr);
    const isToday = dateStr === todayStr;

    let label;
    if (isToday) {
      label = '今天';
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (dateStr === toDateString(yesterday)) {
        label = '昨天';
      } else {
        label = `${date.getMonth() + 1}/${date.getDate()}`;
      }
    }

    this.setData({
      selectedDate: dateStr,
      dateBtnLabel: label,
      greetingText: isToday ? getGreetingText() : '',
      dateTitle: getDateTitle(date),
      showCalendar: false
    });
    this.getRecordsByDate(date);
  },

  onInputChange(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onInputConfirm(e) {
    const content = String(e.detail.value || '').trim();
    if (!content) return;
    this.saveRecordContent(content);
    this.setData({ inputValue: '' });
  },

  onSubmitTap() {
    const content = String(this.data.inputValue || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    this.saveRecordContent(content);
    this.setData({ inputValue: '' });
  },

  saveRecordContent(content, extra = {}) {
    const db = wx.cloud.database();
    const now = new Date();
    const selected = this.data.selectedDate || this.data.todayStr || toDateString(now);
    const selectedDate = this.parseDate(selected);
    const recordDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    );
    const timestamp = recordDate.getTime();
    const createTime = `${recordDate.getFullYear()}-${pad2(recordDate.getMonth() + 1)}-${pad2(recordDate.getDate())} ${formatTime(recordDate)}`;
    const text = extra.transcript || content;

    // 先用本地规则快速分类，再异步调用AI修正
    const localCategory = inferCategoryLocal(text);

    db.collection('records').add({
      data: {
        content: content,
        createTime: createTime,
        timestamp: timestamp,
        date: formatRecordDate(recordDate),
        year: recordDate.getFullYear(),
        monthDay: `${recordDate.getMonth() + 1}/${recordDate.getDate()}`,
        category: localCategory,
        recordType: extra.recordType || 'text',
        audioFileID: extra.audioFileID || '',
        audioDuration: extra.audioDuration || 0,
        transcript: extra.transcript || ''
      },
      success: (res) => {
        wx.showToast({ title: '保存成功', icon: 'success' });
        const date = this.parseDate(this.data.selectedDate);
        this.getRecordsByDate(date);

        // 异步调用AI修正分类
        const recordId = res._id;
        wx.cloud.callFunction({
          name: 'inferCategory',
          data: { text },
          success: (aiRes) => {
            const aiCategory = aiRes.result && aiRes.result.category;
            if (aiCategory && aiCategory !== localCategory) {
              db.collection('records').doc(recordId).update({
                data: { category: aiCategory },
                success: () => {
                  // AI分类修正成功后，刷新页面显示
                  const date = this.parseDate(this.data.selectedDate);
                  this.getRecordsByDate(date);
                }
              });
            }
          },
          fail: () => {}
        });
      },
      fail: () => {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  }
});
