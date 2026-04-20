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

Page({
  data: {
    summaryHistory: []
  },

  onLoad() {
    this.getSummaryHistory();
  },

  getDailySummary() {
    wx.showLoading({ title: '生成总结中...' });
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
          const summaryItems = res.result.summaryItems || [];
          const summaryText = res.result.summaryText || res.result.diary || '';
          wx.showModal({
            title: '每日条目总结',
            content: formatSummaryForModal(summaryItems, summaryText),
            showCancel: false
          });
          this.saveSummaryHistory('daily', formatRecordDate(start), summaryText, summaryItems);
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
  },

  getWeeklySummary() {
    wx.showLoading({ title: '生成总结中...' });
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
          const summaryItems = res.result.summaryItems || [];
          const summaryText = res.result.summaryText || res.result.weekly || '';
          wx.showModal({
            title: '每周条目总结',
            content: formatSummaryForModal(summaryItems, summaryText),
            showCancel: false
          });
          this.saveSummaryHistory('weekly', `${formatRecordDate(weekAgo)} 至 ${formatRecordDate(now)}`, summaryText, summaryItems);
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
  },

  saveSummaryHistory(type, date, content, summaryItems = []) {
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
            summaryHistory: res.data.map(item => ({
              ...item,
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
  }
});
