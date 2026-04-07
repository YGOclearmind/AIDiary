Page({
  data: {
    userOpenid: '',
    recordCount: 0,
    audioCount: 0,
    summaryCount: 0
  },

  onLoad() {
    this.getUserInfo();
    this.getStats();
  },

  onShow() {
    this.getStats();
  },

  getUserInfo() {
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        this.setData({
          userOpenid: res.result.openid
        });
      },
      fail: () => {
        console.error('获取用户信息失败');
      }
    });
  },

  getStats() {
    const db = wx.cloud.database();

    // 获取总记录数
    db.collection('records').count({
      success: res => {
        this.setData({
          recordCount: res.total
        });
      }
    });

    // 获取语音记录数
    db.collection('records').where({
      recordType: 'audio'
    }).count({
      success: res => {
        this.setData({
          audioCount: res.total
        });
      }
    });

    // 获取总结数
    db.collection('summaryHistory').count({
      success: res => {
        this.setData({
          summaryCount: res.total
        });
      }
    });
  },

  clearRecords() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有记录吗？此操作不可恢复。',
      success: res => {
        if (res.confirm) {
          const db = wx.cloud.database();
          db.collection('records').where({}).remove({
            success: () => {
              wx.showToast({
                title: '清空成功',
                icon: 'success'
              });
              this.getStats();
            },
            fail: () => {
              wx.showToast({
                title: '清空失败',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  },

  exportData() {
    wx.showLoading({ title: '导出中...' });
    const db = wx.cloud.database();
    
    db.collection('records').get({
      success: res => {
        const records = res.data;
        const exportData = {
          records: records,
          exportTime: new Date().toLocaleString()
        };
        
        const content = JSON.stringify(exportData, null, 2);
        wx.setClipboardData({
          data: content,
          success: () => {
            wx.hideLoading();
            wx.showModal({
              title: '导出成功',
              content: '数据已复制到剪贴板，请粘贴到文件中保存。',
              showCancel: false
            });
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '导出失败',
          icon: 'none'
        });
      }
    });
  },

  about() {
    wx.showModal({
      title: '关于 AI 流水账',
      content: 'AI 流水账是一款基于微信小程序生态开发的轻量化个人记录工具，核心定位为“随时随地碎片化记录、AI智能整理归纳”，解决用户日常记录繁琐、整理耗时的痛点。\n\n版本：1.0.0\n\n功能：\n- 语音输入与转写\n- 碎片化记录管理\n- AI智能整理归纳\n\n让记录更简单，让生活更美好！',
      showCancel: false
    });
  }
});