const CATEGORY_RULES = [
  { name: '美食', keywords: ['吃', '喝', '咖啡', '奶茶', '火锅', '外卖', '美团', '餐厅', '早餐', '午餐', '晚餐', '甜品'] },
  { name: '电影', keywords: ['电影', '影院', '追剧', '剧集', '综艺', '纪录片'] },
  { name: '学习', keywords: ['学习', '复习', '课程', '读书', '笔记', '考试', '刷题', '作业'] },
  { name: '工作', keywords: ['工作', '需求', '项目', '开会', '汇报', '客户', '加班'] },
  { name: '运动', keywords: ['运动', '跑步', '健身', '游泳', '骑行', '瑜伽', '羽毛球', '篮球'] }
];

function padNumber(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function formatRecordDate(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatMonthDay(date) {
  return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function formatRecordDateTime(date) {
  const hours = date.getHours();
  const period = hours >= 12 ? '下午' : '上午';
  const displayHour = hours % 12 || 12;
  return `${formatRecordDate(date)}${period}${displayHour}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}`;
}

function inferCategory(text) {
  const source = String(text || '').toLowerCase();
  if (!source) {
    return '其他';
  }
  for (const rule of CATEGORY_RULES) {
    const matched = rule.keywords.some(keyword => source.includes(String(keyword).toLowerCase()));
    if (matched) {
      return rule.name;
    }
  }
  return '其他';
}

function getWeekStartTimestamp(now = new Date()) {
  const date = new Date(now);
  const day = date.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatWeekRangeLabel(startTs, endTs) {
  const start = new Date(startTs);
  const end = new Date(endTs);
  const startText = `${start.getMonth() + 1}/${start.getDate()}`;
  const endText = `${end.getMonth() + 1}/${end.getDate()}`;
  return `本周 ${startText}-${endText}`;
}

function formatTimelineDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatTimelineTime(date) {
  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function getTimelineContent(item) {
  const text = String(item.content || '').trim();
  if (text) {
    return text;
  }
  const transcript = String(item.transcript || '').trim();
  if (transcript) {
    return transcript;
  }
  return item.recordType === 'audio' ? '[语音记录]' : '[无文本内容]';
}

Page({
  data: {
    currentTab: 'quick',
    currentTabIndex: 0,
    inputValue: '',
    todayLabel: formatRecordDate(new Date()),
    inspirationLoading: false,
    inspirationMonthDay: formatMonthDay(new Date()),
    inspirationFact: '',
    inspirationMemory: null,
    inspirationFacts: [],
    inspirationMemories: [],
    inspirationError: '',
    recordCount: 0,
    audioCount: 0,
    summaryCount: 0,
    weeklyNotes: [],
    weeklyNotesLoading: false,
    weeklyNotesError: '',
    weekRangeLabel: '',
    selectedMood: '😌 平静',
    streakDays: 0
  },

  onLoad() {
    this.getTodayInspiration();
    this.getStats();
    this.getWeeklyNotes();
  },

  onShow() {
    this.getStats();
    this.getWeeklyNotes();
  },

  switchHomeTab(e) {
    const tab = e.currentTarget.dataset.tab;
    const index = Number(e.currentTarget.dataset.index || 0);
    if (!tab || tab === this.data.currentTab) {
      return;
    }
    this.setData({
      currentTab: tab,
      currentTabIndex: index
    });
  },

  onHomeSwiperChange(e) {
    const index = Number(e.detail.current || 0);
    const order = ['quick', 'inspiration', 'stats'];
    const tab = order[index] || 'quick';
    this.setData({
      currentTab: tab,
      currentTabIndex: index
    });
  },

  inputContent(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  selectMood(e) {
    const mood = e.currentTarget.dataset.mood || '';
    if (this.data.selectedMood === mood) {
      this.setData({ selectedMood: '' });
    } else {
      this.setData({ selectedMood: mood });
    }
  },

  saveInput() {
    const content = String(this.data.inputValue || '').trim();
    if (!content) {
      wx.showToast({
        title: '请输入内容',
        icon: 'none'
      });
      return;
    }
    this.saveRecord(content);
    this.setData({
      inputValue: ''
    });
  },

  saveRecord(content) {
    const db = wx.cloud.database();
    const now = new Date();
    const createTime = formatRecordDateTime(now);
    const timestamp = now.getTime();
    const date = formatRecordDate(now);
    const monthDay = formatMonthDay(now);
    const category = inferCategory(content);
    const mood = this.data.selectedMood;

    db.collection('records').add({
      data: {
        content: content,
        createTime: createTime,
        date: date,
        timestamp: timestamp,
        year: now.getFullYear(),
        monthDay: monthDay,
        category: category,
        mood: mood,
        recordType: 'text',
        audioFileID: '',
        audioDuration: 0,
        transcript: ''
      },
      success: () => {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
        this.setData({ selectedMood: '' });
        this.getStats();
      },
      fail: () => {
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      }
    });
  },

  refreshInspiration() {
    const facts = this.data.inspirationFacts || [];
    const memories = this.data.inspirationMemories || [];
    let inspirationFact = '';
    let inspirationMemory = null;
    if (facts.length) {
      const factIndex = Math.floor(Math.random() * facts.length);
      inspirationFact = facts[factIndex];
    }
    if (memories.length) {
      const memoryIndex = Math.floor(Math.random() * memories.length);
      inspirationMemory = memories[memoryIndex];
    }
    this.setData({
      inspirationFact,
      inspirationMemory,
      inspirationError: ''
    });
  },

  getTodayInspiration() {
    this.setData({
      inspirationLoading: true,
      inspirationError: ''
    });
    wx.cloud.callFunction({
      name: 'getTodayInspiration',
      success: res => {
        const result = res.result || {};
        if (!result.success) {
          this.setData({
            inspirationLoading: false,
            inspirationError: result.message || '灵感获取失败',
            inspirationMonthDay: result.monthDay || formatMonthDay(new Date()),
            inspirationFact: '',
            inspirationMemory: null,
            inspirationFacts: [],
            inspirationMemories: []
          });
          return;
        }
        const facts = Array.isArray(result.facts) ? result.facts : (result.fact ? [result.fact] : []);
        const memories = Array.isArray(result.memories) ? result.memories : [];
        const displayFact = facts.length ? facts[0] : '';
        const displayMemory = memories.length ? memories[0] : null;
        this.setData({
          inspirationLoading: false,
          inspirationMonthDay: result.monthDay || formatMonthDay(new Date()),
          inspirationFact: displayFact,
          inspirationMemory: displayMemory,
          inspirationFacts: facts,
          inspirationMemories: memories,
          inspirationError: ''
        });
      },
      fail: () => {
        this.setData({
          inspirationLoading: false,
          inspirationError: '灵感获取失败'
        });
      }
    });
  },

  getStats() {
    const db = wx.cloud.database();

    db.collection('records').count({
      success: res => {
        this.setData({
          recordCount: res.total
        });
      }
    });

    db.collection('records').where({
      recordType: 'audio'
    }).count({
      success: res => {
        this.setData({
          audioCount: res.total
        });
      }
    });

    db.collection('summaryHistory').count({
      success: res => {
        this.setData({
          summaryCount: res.total
        });
      }
    });

    this.getStreakDays();
  },

  getStreakDays() {
    const db = wx.cloud.database();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const oneDayMs = 24 * 60 * 60 * 1000;

    db.collection('records')
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get({
        success: res => {
          const records = Array.isArray(res.data) ? res.data : [];
          if (!records.length) {
            this.setData({ streakDays: 0 });
            return;
          }

          const uniqueDays = new Set();
          records.forEach(record => {
            const date = new Date(record.timestamp);
            const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            uniqueDays.add(dayKey);
          });

          let streak = 0;
          let checkDate = new Date(today);

          for (let i = 0; i < 365; i++) {
            const dayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
            if (uniqueDays.has(dayKey)) {
              streak++;
              checkDate.setTime(checkDate.getTime() - oneDayMs);
            } else {
              break;
            }
          }

          this.setData({ streakDays: streak });
        },
        fail: () => {
          this.setData({ streakDays: 0 });
        }
      });
  },

  getWeeklyNotes() {
    const db = wx.cloud.database();
    const _ = db.command;
    const now = Date.now();
    const weekStart = getWeekStartTimestamp(new Date(now));
    this.setData({
      weeklyNotesLoading: true,
      weeklyNotesError: '',
      weekRangeLabel: formatWeekRangeLabel(weekStart, now)
    });
    db.collection('records')
      .where({
        timestamp: _.gte(weekStart).and(_.lte(now))
      })
      .orderBy('timestamp', 'asc')
      .limit(100)
      .get({
        success: res => {
          const records = Array.isArray(res.data) ? res.data : [];
          const weeklyNotes = records.map(item => {
            const date = new Date(item.timestamp || Date.now());
            return {
              id: item._id,
              dayLabel: formatTimelineDay(date),
              timeLabel: formatTimelineTime(date),
              content: getTimelineContent(item)
            };
          });
          this.setData({
            weeklyNotesLoading: false,
            weeklyNotesError: '',
            weeklyNotes
          });
        },
        fail: () => {
          this.setData({
            weeklyNotesLoading: false,
            weeklyNotesError: '本周时间线加载失败',
            weeklyNotes: []
          });
        }
      });
  },

  goRecord() {
    wx.switchTab({
      url: '/pages/record/index'
    });
  },

  goRecordWithInspiration() {
    const inspirationText = String(this.data.inspirationFact || '').trim();
    if (inspirationText) {
      wx.setStorageSync('recordInitialContent', inspirationText);
    }
    wx.setStorageSync('recordInitialView', 'write');
    wx.switchTab({
      url: '/pages/record/index'
    });
  },

  goSummary() {
    wx.switchTab({
      url: '/pages/summary/index'
    });
  },

  goMine() {
    wx.switchTab({
      url: '/pages/mine/index'
    });
  }
});

