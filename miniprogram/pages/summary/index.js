function formatRecordDate(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

Page({
  data: {
    summaryHistory: []
  },

  onLoad() {
    this.getSummaryHistory();
  },

  getDailySummary() {
    wx.showLoading({ title: '生成日记中...' });
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime());
    end.setHours(23, 59, 59, 999);

    wx.cloud.callFunction({
      name: 'generateDiary',
      data: {
        date: formatRecordDate(start),
        startTimestamp: start.getTime(),
        endTimestamp: end.getTime()
      },
      success: function(res) {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showModal({
            title: '每日日记',
            content: res.result.diary,
            showCancel: false
          });
          this.saveSummaryHistory('daily', formatRecordDate(start), res.result.diary);
        } else {
          wx.showToast({
            title: res.result.message || '生成日记失败',
            icon: 'none'
          });
        }
      }.bind(this),
      fail: function() {
        wx.hideLoading();
        wx.showToast({
          title: '生成日记失败',
          icon: 'none'
        });
      }
    });
  },

  getWeeklySummary() {
    wx.showLoading({ title: '生成周报中...' });
    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(now.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

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
          wx.showModal({
            title: '每周周报',
            content: res.result.weekly,
            showCancel: false
          });
          this.saveSummaryHistory('weekly', `${formatRecordDate(weekAgo)} 至 ${formatRecordDate(now)}`, res.result.weekly);
        } else {
          wx.showToast({
            title: res.result.message || '生成周报失败',
            icon: 'none'
          });
        }
      }.bind(this),
      fail: function() {
        wx.hideLoading();
        wx.showToast({
          title: '生成周报失败',
          icon: 'none'
        });
      }
    });
  },

  saveSummaryHistory(type, date, content) {
    const db = wx.cloud.database();
    const now = new Date();
    const timestamp = now.getTime();

    db.collection('summaryHistory').add({
      data: {
        type: type,
        date: date,
        content: content,
        timestamp: timestamp,
        createTime: now.toLocaleString()
      },
      success: function() {
        this.getSummaryHistory();
      }.bind(this),
      fail: function() {
        console.error('保存总结历史失败');
      }
    });
  },

  getSummaryHistory() {
    const db = wx.cloud.database();

    db.collection('summaryHistory')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get({
        success: function(res) {
          this.setData({
            summaryHistory: res.data
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
  }
});