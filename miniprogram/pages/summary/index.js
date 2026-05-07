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

Page({
  data: {
    currentPeriod: 'week',
    periodLabel: '',
    periodName: '周度',
    summaryText: '这一周你的生活节奏张弛有度。工作上完成了关键里程碑，个人时间则回归阅读与运动。情绪整体平稳向上，内在能量正在积蓄 🌱'
  },

  onLoad() {
    this.updatePeriodInfo();
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
  }
});