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

function inferCategory(text) {
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
    days.push({ day: d, isCurrentMonth: false, isToday: false, hasRecord: recordDays.has(dateStr), isSelected: dateStr === selectedDate, dateStr });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    days.push({
      day: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      hasRecord: recordDays.has(dateStr),
      isSelected: dateStr === selectedDate,
      dateStr
    });
  }
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    const nm = month === 11 ? 0 : month + 1;
    const ny = month === 11 ? year + 1 : year;
    for (let i = 1; i <= remaining; i++) {
      const dateStr = `${ny}-${pad2(nm + 1)}-${pad2(i)}`;
      days.push({ day: i, isCurrentMonth: false, isToday: false, hasRecord: recordDays.has(dateStr), isSelected: dateStr === selectedDate, dateStr });
    }
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
    aiSummaryText: '今天你的心情整体偏向平静与满足 🌿 上午完成了两项工作任务，午后享受了一段放松的阅读时光。记得给自己一点赞赏，每一天的努力都值得被看见 ✨',
    todayRecords: [],
    inputValue: '',
    showCalendar: false,
    calWeekDays: ['日', '一', '二', '三', '四', '五', '六'],
    calTitle: '',
    calDays: [],
    calYear: 0,
    calMonth: 0
  },

  onLoad() {
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
  },

  onShow() {
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

  calNextMonth() {
    let year = this.data.calYear;
    let month = this.data.calMonth + 1;
    if (month > 11) { month = 0; year++; }
    this.setData({ calYear: year, calMonth: month });
    this.loadCalRecords();
  },

  onCalDayTap(e) {
    const dateStr = e.currentTarget.dataset.date;
    const isCurrentMonth = e.currentTarget.dataset.current;
    if (!isCurrentMonth) return;

    const date = this.parseDate(dateStr);
    const todayStr = this.data.todayStr;
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
    const category = inferCategory(extra.transcript || content);

    db.collection('records').add({
      data: {
        content: content,
        createTime: createTime,
        timestamp: timestamp,
        date: formatRecordDate(recordDate),
        year: recordDate.getFullYear(),
        monthDay: `${recordDate.getMonth() + 1}/${recordDate.getDate()}`,
        category: category,
        recordType: extra.recordType || 'text',
        audioFileID: extra.audioFileID || '',
        audioDuration: extra.audioDuration || 0,
        transcript: extra.transcript || ''
      },
      success: () => {
        wx.showToast({ title: '保存成功', icon: 'success' });
        const date = this.parseDate(this.data.selectedDate);
        this.getRecordsByDate(date);
      },
      fail: () => {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  }
});
