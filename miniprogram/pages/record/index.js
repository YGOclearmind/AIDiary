// record/index.js
Page({
  data: {
    inputValue: '',
    records: []
  },

  onLoad() {
    this.getRecords();
  },

  inputContent(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  saveInput() {
    const content = this.data.inputValue.trim();
    if (!content) {
      wx.showToast({
        title: '请输入内容',
        icon: 'none'
      });
      return;
    }
    this.saveRecord(content);
    // 清空输入框
    this.setData({
      inputValue: ''
    });
  },

  saveRecord(content) {
    const db = wx.cloud.database();
    const now = new Date();
    const createTime = now.toLocaleString();
    const timestamp = now.getTime(); // 显式获取时间戳
    
    db.collection('records').add({
      data: {
        content: content,
        createTime: createTime,
        date: now.toDateString(),
        timestamp: timestamp // 确保写入数据库
      },
      success: function(res) {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
        this.getRecords();
      }.bind(this),
      fail: function(res) {
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      }
    });
  },

  getRecords() {
    const db = wx.cloud.database();
    
    // 小程序端直接调用 db.collection() 时，
    // 微信云开发会自动附带当前用户的 _openid 进行过滤。
    // 即：默认只能查到当前用户自己创建的数据。
    db.collection('records').orderBy('createTime', 'desc').get({
      success: function(res) {
        this.setData({
          records: res.data
        });
      }.bind(this),
      fail: function(res) {
        console.error('获取记录失败', res);
      }
    });
  },

  getDailySummary() {
    wx.showLoading({ title: '生成日记中...' });
    const today = new Date().toDateString();
    
    // 调用云函数生成日记
    wx.cloud.callFunction({
      name: 'generateDiary',
      data: {
        date: today
      },
      success: function(res) {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showModal({
            title: '每日日记',
            content: res.result.diary,
            showCancel: false
          });
        } else {
          wx.showToast({
            title: res.result.message || '生成日记失败',
            icon: 'none'
          });
        }
      },
      fail: function(res) {
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
    // 修改为获取过去 7 天的 0 点 0 分时间戳，更符合人类直觉的“一周”
    const weekAgo = new Date();
    weekAgo.setDate(now.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);
    
    // 打印参数用于调试
    console.log('调用周报云函数，参数：', {
      startDate: weekAgo.toLocaleString(),
      endDate: now.toLocaleString(),
      startTimestamp: weekAgo.getTime(),
      endTimestamp: now.getTime()
    });

    // 调用云函数生成周报
    wx.cloud.callFunction({
      name: 'generateWeekly',
      data: {
        startDate: weekAgo.toLocaleString(),
        endDate: now.toLocaleString(),
        startTimestamp: weekAgo.getTime(),
        endTimestamp: now.getTime(),
        // 如果你需要从本地存储获取 openid 传递给云端，你可以加上这行，但通常云端直接通过 cloud.getWXContext() 获取更安全
        // openid: wx.getStorageSync('openid')
      },
      success: function(res) {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showModal({
            title: '每周周报',
            content: res.result.weekly,
            showCancel: false
          });
        } else {
          wx.showToast({
            title: res.result.message || '生成周报失败',
            icon: 'none'
          });
        }
      },
      fail: function(res) {
        wx.hideLoading();
        wx.showToast({
          title: '生成周报失败',
          icon: 'none'
        });
      }
    });
  }
});