Page({
  data: {
    showAvatarAuth: false
  },

  onLoad() {
    // 每次都显示登录页面，不自动跳转
  },

  onLoginTap() {
    const chooseAvatarSupported = !!(wx.canIUse && wx.canIUse('button.open-type.chooseAvatar'));
    if (chooseAvatarSupported) {
      this.setData({ showAvatarAuth: true });
    } else {
      this.handleLegacyLogin();
    }
  },

  onChooseAvatar(e) {
    const avatarUrl = String((e && e.detail && e.detail.avatarUrl) || '').trim();
    if (!avatarUrl) {
      wx.showToast({ title: '未获取到头像', icon: 'none' });
      return;
    }

    try { wx.setStorageSync('avatarLocalPath', avatarUrl); } catch (err) {}
    try { wx.setStorageSync('avatarSource', 'chooseAvatar'); } catch (err) {}
    try { wx.setStorageSync('userAvatarUrl', avatarUrl); } catch (err) {}
    try { wx.setStorageSync('avatarAuthDone', true); } catch (err) {}
    try { wx.setStorageSync('isLoggedIn', true); } catch (err) {}

    this.setData({ showAvatarAuth: false });
    wx.switchTab({ url: '/pages/home/index' });
  },

  handleLegacyLogin() {
    if (!wx.getUserProfile) {
      wx.showToast({ title: '当前微信版本不支持', icon: 'none' });
      return;
    }

    wx.getUserProfile({
      desc: '用于在首页显示你的微信头像',
      success: (res) => {
        const userInfo = (res && res.userInfo) || {};
        const userAvatarUrl = this.normalizeAvatarUrl(userInfo.avatarUrl || '');
        if (!userAvatarUrl) return;

        try { wx.setStorageSync('userAvatarUrl', userAvatarUrl); } catch (err) {}
        try { wx.setStorageSync('avatarAuthDone', true); } catch (err) {}
        try { wx.setStorageSync('avatarSource', 'profile'); } catch (err) {}
        try { wx.setStorageSync('isLoggedIn', true); } catch (err) {}

        wx.switchTab({ url: '/pages/home/index' });
      },
      fail: () => {
        wx.showToast({ title: '授权失败，请重试', icon: 'none' });
      }
    });
  },

  normalizeAvatarUrl(raw) {
    const source = String(raw || '').trim();
    if (!source) return '';
    const httpIndex = source.indexOf('http');
    if (httpIndex < 0) return '';
    const sliced = source.slice(httpIndex);
    const match = sliced.match(/^https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+/);
    return match ? match[0] : '';
  },

  onUserAgreement() {
    wx.navigateTo({ url: '/pages/policy/user/index' });
  },

  onPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/policy/privacy/index' });
  }
});
