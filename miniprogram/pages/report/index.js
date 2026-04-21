function toTypeLabel(type) {
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

function normalizeSummaryItems(summaryItems) {
  if (!Array.isArray(summaryItems)) {
    return [];
  }
  return summaryItems.map(item => ({
    ...item,
    points: Array.isArray(item.points) ? item.points : (item.points ? [String(item.points)] : []),
    pointsText: Array.isArray(item.points) ? item.points.join('；') : (item.points ? String(item.points) : '')
  }));
}

function buildItemsFromContent(content) {
  const text = String(content || '').trim();
  if (!text) {
    return [];
  }
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  return lines.map(line => {
    const splitIndex = line.indexOf('：');
    if (splitIndex > 0) {
      return {
        title: line.slice(0, splitIndex),
        points: [line.slice(splitIndex + 1)],
        pointsText: line.slice(splitIndex + 1)
      };
    }
    return {
      title: '内容',
      points: [line],
      pointsText: line
    };
  });
}

Page({
  data: {
    title: '总结详情',
    typeLabel: '条目总结',
    date: '',
    content: '',
    summaryItems: []
  },

  onLoad(options) {
    const app = getApp();
    const globalPayload = (app && app.globalData && app.globalData.latestReportPayload) || {};
    const keyPayload = options.reportKey ? (wx.getStorageSync(options.reportKey) || {}) : {};
    const latestPayload = wx.getStorageSync('latestReportPayload') || {};
    const payload = Object.keys(keyPayload).length ? keyPayload : (Object.keys(globalPayload).length ? globalPayload : latestPayload);
    const type = options.type || payload.type || 'summary';
    const title = decodeURIComponent(options.title || payload.title || '总结详情');
    const date = decodeURIComponent(options.date || payload.date || '');

    const applyPayload = (data = {}) => {
      const textContent = String(data.content || '').trim();
      const normalizedItems = normalizeSummaryItems(data.summaryItems);
      const displayItems = normalizedItems.length ? normalizedItems : buildItemsFromContent(textContent);
      this.setData({
        title: title || data.title || '总结详情',
        typeLabel: toTypeLabel(data.type || type),
        date: date || data.date || '',
        content: textContent,
        summaryItems: displayItems
      });
    };

    applyPayload(payload);

    const reportId = options.reportId ? decodeURIComponent(options.reportId) : '';
    const hasLocalContent = !!(payload && (payload.content || (Array.isArray(payload.summaryItems) && payload.summaryItems.length)));
    if (reportId && !hasLocalContent) {
      const db = wx.cloud.database();
      db.collection('summaryHistory').doc(reportId).get({
        success: (res) => {
          const data = res && res.data ? res.data : null;
          if (data) {
            applyPayload({
              ...data,
              type: data.type || type,
              title: title || toTypeLabel(data.type),
              date: data.date || date
            });
          }
        },
        fail: () => {
          // 忽略详情补拉失败，页面继续显示已有数据
        }
      });
    }

    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (eventChannel && eventChannel.on) {
      eventChannel.on('reportPayload', (data) => {
        applyPayload(data || {});
      });
    }

    if (!payload || (!payload.content && (!Array.isArray(payload.summaryItems) || !payload.summaryItems.length))) {
      wx.showToast({
        title: '报告内容为空，请重试',
        icon: 'none'
      });
    }
  },

  copyReport() {
    const { content, summaryItems } = this.data;
    let text = content;
    if (!text && Array.isArray(summaryItems) && summaryItems.length) {
      text = summaryItems.map(item => `${item.title}：${(item.points || []).join('；')}`).join('\n');
    }
    wx.setClipboardData({
      data: text || '暂无内容',
      success() {
        wx.showToast({
          title: '复制成功',
          icon: 'success'
        });
      }
    });
  }
});
