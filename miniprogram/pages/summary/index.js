function pad2(n) { return String(n).padStart(2, '0'); }

function getWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday,
    end: sunday,
    label: `${monday.getMonth() + 1}月${monday.getDate()}日 — ${sunday.getMonth() + 1}月${sunday.getDate()}日`
  };
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start,
    end,
    label: `${now.getFullYear()}年${now.getMonth() + 1}月`
  };
}

function getYearRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), 0, 1),
    end: new Date(now.getFullYear(), 11, 31),
    label: `${now.getFullYear()}年`
  };
}

function generateCalendarDays(year, month, recordDays) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  const days = [];
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    days.push({ day: prevMonthLastDay - i, isCurrentMonth: false, isToday: false, hasRecord: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    days.push({
      day: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      hasRecord: recordDays.has(dateStr)
    });
  }
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, isCurrentMonth: false, isToday: false, hasRecord: false });
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
    currentPeriod: 'week',
    periodLabel: '',
    periodName: '周度',
    summaryText: '这一周你的生活节奏张弛有度。工作上完成了关键里程碑，个人时间则回归阅读与运动。情绪整体平稳向上，内在能量正在积蓄 🌱',
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarTitle: '',
    calendarDays: [],
    calendarYear: 0,
    calendarMonth: 0,
    recordDays: new Set()
  },

  onLoad() {
    const now = new Date();
    this.setData({
      calendarYear: now.getFullYear(),
      calendarMonth: now.getMonth()
    });
    this.updatePeriodInfo();
    this.getMonthRecords();
  },

  onShow() {
    this.getMonthRecords();
  },

  updatePeriodInfo() {
    const period = this.data.currentPeriod;
    let range;
    let name;
    if (period === 'week') {
      range = getWeekRange();
      name = '周度';
    } else if (period === 'month') {
      range = getMonthRange();
      name = '月度';
    } else {
      range = getYearRange();
      name = '年度';
    }
    this.setData({
      periodLabel: range.label,
      periodName: name
    });
  },

  selectPeriod(e) {
    const period = e.currentTarget.dataset.period;
    if (period === this.data.currentPeriod) return;
    this.setData({ currentPeriod: period });
    this.updatePeriodInfo();
  },

  getMonthRecords() {
    const year = this.data.calendarYear;
    const month = this.data.calendarMonth;
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
            calendarTitle: `${year}年 ${month + 1}月`,
            calendarDays: generateCalendarDays(year, month, recordDays)
          });
        },
        fail: () => {
          this.setData({
            calendarTitle: `${year}年 ${month + 1}月`,
            calendarDays: generateCalendarDays(year, month, new Set())
          });
        }
      });
  },

  prevMonth() {
    let year = this.data.calendarYear;
    let month = this.data.calendarMonth - 1;
    if (month < 0) { month = 11; year--; }
    this.setData({ calendarYear: year, calendarMonth: month });
    this.getMonthRecords();
  },

  nextMonth() {
    let year = this.data.calendarYear;
    let month = this.data.calendarMonth + 1;
    if (month > 11) { month = 0; year++; }
    this.setData({ calendarYear: year, calendarMonth: month });
    this.getMonthRecords();
  }
});