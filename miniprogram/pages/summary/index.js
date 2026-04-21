function formatRecordDate(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatSummaryForModal(summaryItems, fallbackText) {
  if (!Array.isArray(summaryItems) || !summaryItems.length) {
    return fallbackText || '暂无可展示条目';
  }
  return summaryItems.map(item => {
    const points = Array.isArray(item.points) ? item.points : [];
    return `${item.title}：${points.join('；')}`;
  }).join('\n');
}

function getSummaryTypeLabel(type) {
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

function buildYearOptions(span = 10) {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i <= span; i += 1) {
    years.push(currentYear - i);
  }
  return years;
}

function buildReportTitle(type, year) {
  if (type === 'daily') {
    return '今日碎碎念';
  }
  if (type === 'weekly') {
    return '本周碎碎念';
  }
  if (type === 'yearly') {
    return `${year}年碎碎念`;
  }
  return '总结详情';
}

function parseDateLike(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value).trim().replace(/[.]/g, '/');
  const parts = normalized.split('/');
  if (parts.length < 3) {
    return null;
  }
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function getWeekOfYear(date) {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const yearStart = new Date(current.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((current - yearStart) / (24 * 60 * 60 * 1000)) + 1;
  return Math.floor((dayOfYear - 1) / 7) + 1;
}

function buildHistoryTitle(item) {
  const type = item && item.type;
  const dateText = String((item && item.date) || '').trim();
  if (type === 'yearly') {
    if (!dateText) {
      return '年报';
    }
    return dateText.endsWith('年') ? `${dateText}报` : `${dateText}年报`;
  }
  if (type === 'weekly') {
    const startText = dateText.split('至')[0].trim();
    const startDate = parseDateLike(startText);
    if (startDate) {
      const year = startDate.getFullYear();
      const week = getWeekOfYear(startDate);
      return `${year}年第${week}周周报`;
    }
    return '周报';
  }
  if (type === 'daily') {
    return dateText ? `${dateText} 日报` : '日报';
  }
  return item && item.typeLabel ? item.typeLabel : '报告';
}

function shouldRegenerateWeekly(summary) {
  if (!summary || summary.type !== 'weekly') {
    return false;
  }
  const items = Array.isArray(summary.summaryItems) ? summary.summaryItems : [];
  if (items.length !== 1) {
    return false;
  }
  const first = items[0] || {};
  const title = String(first.title || '').trim();
  const points = Array.isArray(first.points) ? first.points : [];
  const merged = [summary.content || '', ...points].join('；');
  if (title === '其他' && /(游戏|娱乐|电影|学习|工作|运动|美食|状态)/.test(merged)) {
    return true;
  }
  return false;
}

function extractOpenidFromApp(page) {
  const app = getApp();
  return page.data.currentOpenid || (app.globalData && app.globalData.openid) || '';
}

Page({
  data: {
    summaryHistory: [],
    yearOptions: [],
    selectedYear: new Date().getFullYear(),
    selectedYearIndex: 0,
    currentOpenid: ''
  },

  onLoad() {
    const yearOptions = buildYearOptions(10);
    this.setData({
      yearOptions: yearOptions,
      selectedYear: yearOptions[0],
      selectedYearIndex: 0
    });
    this.getSummaryHistory();
  },

  ensureOpenid(callback) {
    const cached = this.data.currentOpenid || (getApp().globalData && getApp().globalData.openid);
    if (cached) {
      this.setData({ currentOpenid: cached });
      if (typeof callback === 'function') {
        callback(true);
      }
      return;
    }
    if (typeof callback === 'function') {
      callback(false);
    }
  },

  runWithOpenid(task) {
    this.ensureOpenid(() => {
      if (typeof task === 'function') {
        task();
      }
    });
  },

  onYearChange(e) {
    const index = Number(e.detail.value || 0);
    const yearOptions = this.data.yearOptions || [];
    const selectedYear = yearOptions[index] || yearOptions[0] || new Date().getFullYear();
    this.setData({
      selectedYearIndex: index,
      selectedYear: selectedYear
    });
  },

  checkExistingSummary(type, date, onFound, onMiss) {
    const db = wx.cloud.database();
    const where = {
      type: type,
      date: date
    };
    db.collection('summaryHistory')
      .where(where)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get({
        success: (res) => {
          const list = (res && res.data) || [];
          if (list.length) {
            onFound(list[0]);
            return;
          }
          onMiss();
        },
        fail: () => {
          onMiss();
        }
      });
  },

  getDailySummary() {
    this.runWithOpenid(() => {
      wx.showLoading({ title: '生成总结中...' });
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime());
      end.setHours(23, 59, 59, 999);

      const dateText = formatRecordDate(start);
      this.checkExistingSummary('daily', dateText, (existing) => {
        wx.hideLoading();
        this.openReportPage({
          reportId: existing._id || '',
          type: existing.type || 'daily',
          title: buildReportTitle('daily'),
          date: existing.date || dateText,
          content: existing.content || '',
          summaryItems: Array.isArray(existing.summaryItems) ? existing.summaryItems : []
        });
      }, () => {
        wx.cloud.callFunction({
          name: 'generateDiary',
          data: {
            date: dateText,
            startTimestamp: start.getTime(),
            endTimestamp: end.getTime()
          },
          success: function(res) {
            wx.hideLoading();
            if (res.result && res.result.success) {
              const summaryItems = res.result.summaryItems || [];
              const summaryText = res.result.summaryText || res.result.diary || '';
              this.openReportPage({
                type: 'daily',
                title: buildReportTitle('daily'),
                date: dateText,
                content: summaryText,
                summaryItems
              });
              this.saveSummaryHistory('daily', dateText, summaryText, summaryItems);
            } else {
              wx.showToast({
                title: res.result.message || '生成总结失败',
                icon: 'none'
              });
            }
          }.bind(this),
          fail: function() {
            wx.hideLoading();
            wx.showToast({
              title: '生成总结失败',
              icon: 'none'
            });
          }
        });
      });
    });
  },

  getWeeklySummary() {
    this.runWithOpenid(() => {
      wx.showLoading({ title: '生成总结中...' });
      const now = new Date();
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);

      const dateText = `${formatRecordDate(weekAgo)} 至 ${formatRecordDate(now)}`;
      const requestWeekly = () => {
        wx.cloud.callFunction({
          name: 'generateWeekly',
          data: {
            startDate: weekAgo.toLocaleString(),
            endDate: now.toLocaleString(),
            startTimestamp: weekAgo.getTime(),
            endTimestamp: now.getTime()
          },
          success: function(res) {
            wx.hideLoading();
            if (res.result && res.result.success) {
              const summaryItems = res.result.summaryItems || [];
              const summaryText = res.result.summaryText || res.result.weekly || '';
              this.openReportPage({
                type: 'weekly',
                title: buildReportTitle('weekly'),
                date: dateText,
                content: summaryText,
                summaryItems
              });
              this.saveSummaryHistory('weekly', dateText, summaryText, summaryItems);
            } else {
              wx.showToast({
                title: res.result.message || '生成总结失败',
                icon: 'none'
              });
            }
          }.bind(this),
          fail: function() {
            wx.hideLoading();
            wx.showToast({
              title: '生成总结失败',
              icon: 'none'
            });
          }
        });
      };
      this.checkExistingSummary('weekly', dateText, (existing) => {
        if (shouldRegenerateWeekly(existing)) {
          requestWeekly();
          return;
        }
        wx.hideLoading();
        this.openReportPage({
          reportId: existing._id || '',
          type: existing.type || 'weekly',
          title: buildReportTitle('weekly'),
          date: existing.date || dateText,
          content: existing.content || '',
          summaryItems: Array.isArray(existing.summaryItems) ? existing.summaryItems : []
        });
      }, () => {
        requestWeekly();
      });
    });
  },

  getYearlySummary() {
    this.runWithOpenid(() => {
      wx.showLoading({ title: '生成年报中...' });
      const year = Number(this.data.selectedYear) || new Date().getFullYear();
      const dateText = `${year}年`;
      const requestYearly = (useAI) => {
        wx.cloud.callFunction({
          name: 'generateYearly',
          data: {
            year: year,
            useAI: useAI
          },
          success: function(res) {
            wx.hideLoading();
            if (res.result && res.result.success) {
              const summaryItems = res.result.summaryItems || [];
              const summaryText = res.result.summaryText || res.result.yearly || '';
              const aiUsed = !!res.result.aiUsed;
              this.openReportPage({
                type: 'yearly',
                title: buildReportTitle('yearly', year),
                date: dateText,
                content: summaryText,
                summaryItems
              });
              this.saveSummaryHistory('yearly', dateText, summaryText, summaryItems);
              if (!aiUsed) {
                wx.showToast({
                  title: 'AI超时，已降级本地年报',
                  icon: 'none'
                });
              }
            } else {
              wx.showToast({
                title: (res.result && res.result.message) || '生成年报失败',
                icon: 'none'
              });
            }
          }.bind(this),
          fail: function(err) {
            const errMsg = err && err.errMsg ? err.errMsg : '';
            const isTimeout = errMsg.includes('timeout');
            if (useAI && isTimeout) {
              requestYearly(false);
              return;
            }
            wx.hideLoading();
            wx.showToast({
              title: '生成年报失败',
              icon: 'none'
            });
          }
        });
      };
      this.checkExistingSummary('yearly', dateText, (existing) => {
        wx.hideLoading();
        this.openReportPage({
          reportId: existing._id || '',
          type: existing.type || 'yearly',
          title: buildReportTitle('yearly', year),
          date: existing.date || dateText,
          content: existing.content || '',
          summaryItems: Array.isArray(existing.summaryItems) ? existing.summaryItems : []
        });
      }, () => {
        requestYearly(true);
      });
    });
  },

  saveSummaryHistory(type, date, content, summaryItems = [], onSuccess) {
    const db = wx.cloud.database();
    const now = new Date();
    const timestamp = now.getTime();

    db.collection('summaryHistory').add({
      data: {
        type: type,
        date: date,
        content: content,
        summaryItems: summaryItems,
        timestamp: timestamp,
        createTime: now.toLocaleString()
      },
      success: function(res) {
        this.getSummaryHistory();
        if (typeof onSuccess === 'function') {
          onSuccess(res && res._id ? res._id : '');
        }
      }.bind(this),
      fail: function(err) {
        const errMsg = (err && err.errMsg) ? err.errMsg : '未知错误';
        console.error('保存总结历史失败:', err);
        wx.showToast({
          title: '历史保存失败',
          icon: 'none'
        });
        wx.showModal({
          title: '历史保存失败',
          content: `不会影响报告查看\n${errMsg}`,
          showCancel: false
        });
      }
    });
  },

  getSummaryHistory() {
    const db = wx.cloud.database();
    const where = {};

    db.collection('summaryHistory')
      .where(where)
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get({
        success: function(res) {
          this.setData({
            summaryHistory: res.data.map(item => ({
              ...item,
              typeLabel: getSummaryTypeLabel(item.type),
              historyTitle: buildHistoryTitle({
                ...item,
                typeLabel: getSummaryTypeLabel(item.type)
              }),
              summaryItems: Array.isArray(item.summaryItems) ? item.summaryItems : []
            }))
          });
        }.bind(this),
        fail: function() {
          console.error('获取总结历史失败');
        }
      });
  },

  copySummary(e) {
    const id = e.currentTarget.dataset.id;
    const summary = this.data.summaryHistory.find(item => item._id === id);
    if (summary) {
      wx.setClipboardData({
        data: summary.content,
        success: function() {
          wx.showToast({
            title: '复制成功',
            icon: 'success'
          });
        }
      });
    }
  },

  deleteSummary(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) {
      return;
    }
    wx.showModal({
      title: '删除确认',
      content: '确定删除这条历史报告吗？',
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        const db = wx.cloud.database();
        db.collection('summaryHistory').doc(id).remove({
          success: () => {
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });
            this.getSummaryHistory();
          },
          fail: () => {
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        });
      }
    });
  },

  openSummaryDetail(e) {
    const id = e.currentTarget.dataset.id;
    const summary = this.data.summaryHistory.find(item => item._id === id);
    if (!summary) {
      return;
    }
    this.openReportPage({
      reportId: summary._id || '',
      type: summary.type || 'summary',
      title: summary.typeLabel || '总结详情',
      date: summary.date || '',
      content: summary.content || '',
      summaryItems: Array.isArray(summary.summaryItems) ? summary.summaryItems : []
    });
  },

  openReportPage(payload) {
    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.latestReportPayload = payload;
    const reportKey = `report_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    wx.setStorageSync(reportKey, payload);
    wx.setStorageSync('latestReportPayload', payload);
    const title = encodeURIComponent(payload.title || '总结详情');
    const date = encodeURIComponent(payload.date || '');
    const type = encodeURIComponent(payload.type || 'summary');
    const reportId = encodeURIComponent(payload.reportId || '');
    wx.navigateTo({
      url: `/pages/report/index?type=${type}&title=${title}&date=${date}&reportKey=${reportKey}&reportId=${reportId}`,
      success(res) {
        res.eventChannel.emit('reportPayload', payload);
      },
      fail: () => {
        wx.redirectTo({
          url: `/pages/report/index?type=${type}&title=${title}&date=${date}&reportKey=${reportKey}&reportId=${reportId}`,
          fail: () => {
            wx.showToast({
              title: '页面跳转失败',
              icon: 'none'
            });
          }
        });
      }
    });
  },

  preventTap() {
  }
});
