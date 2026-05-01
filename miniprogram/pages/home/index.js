const recorderManager = wx.getRecorderManager ? wx.getRecorderManager() : null;
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

const CATEGORY_RULES = [
  { name: '工作', keywords: ['工作', '加班', '会议', '项目', '报告', '任务', '汇报', '上班', '同事', '领导'] },
  { name: '阅读', keywords: ['读书', '阅读', '书', '小说', '文章', '读', '看', '章节'] },
  { name: '运动', keywords: ['跑步', '运动', '健身', '游泳', '散步', '锻炼', '公里', '瑜伽'] },
  { name: '健康', keywords: ['健康', '医院', '体检', '睡眠', '饮食', '药'] },
  { name: '关系', keywords: ['朋友', '家人', '聊天', '约会', '聚会', '陪伴'] },
  { name: '学习', keywords: ['学习', '课程', '考试', '练习', '笔记', '复习'] }
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

function getDateTitle() {
  const now = new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${now.getMonth() + 1}月${now.getDate()}日，星期${weekDays[now.getDay()]}`;
}

Page({
  data: {
    greetingText: '',
    dateTitle: '',
    dateBtnLabel: '今天',
    aiSummaryText: '今天你的心情整体偏向平静与满足 🌿 上午完成了两项工作任务，午后享受了一段放松的阅读时光。记得给自己一点赞赏，每一天的努力都值得被看见 ✨',
    todayRecords: [],
    inputValue: '',
    showInputModal: false,
    modalInputValue: '',
    isRecording: false,
    voiceStatus: ''
  },

  onLoad() {
    this.setData({
      greetingText: getGreetingText(),
      dateTitle: getDateTitle()
    });
    this.getTodayRecords();
  },

  onShow() {
    this.setData({
      greetingText: getGreetingText(),
      dateTitle: getDateTitle()
    });
    this.getTodayRecords();
  },

  getTodayRecords() {
    const db = wx.cloud.database();
    const _ = db.command;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

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

  onInputChange(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onInputConfirm(e) {
    const content = String(e.detail.value || '').trim();
    if (!content) return;
    this.saveRecordContent(content);
    this.setData({ inputValue: '' });
  },

  onAddTap() {
    this.setData({
      showInputModal: true,
      modalInputValue: '',
      voiceStatus: ''
    });
  },

  onDateTap() {
    wx.showToast({ title: '日期选择', icon: 'none' });
  },

  onModalInput(e) {
    this.setData({ modalInputValue: e.detail.value });
  },

  closeInputModal() {
    if (this.data.isRecording && recorderManager) {
      recorderManager.stop();
    }
    this.setData({
      showInputModal: false,
      isRecording: false,
      voiceStatus: ''
    });
  },

  preventTap() {},

  saveRecord() {
    const content = String(this.data.modalInputValue || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    this.saveRecordContent(content);
    this.setData({
      showInputModal: false,
      modalInputValue: '',
      voiceStatus: ''
    });
  },

  saveRecordContent(content, extra = {}) {
    const db = wx.cloud.database();
    const now = new Date();
    const timestamp = now.getTime();
    const createTime = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${formatTime(now)}`;
    const category = inferCategory(extra.transcript || content);

    db.collection('records').add({
      data: {
        content: content,
        createTime: createTime,
        timestamp: timestamp,
        year: now.getFullYear(),
        monthDay: `${now.getMonth() + 1}/${now.getDate()}`,
        category: category,
        recordType: extra.recordType || 'text',
        audioFileID: extra.audioFileID || '',
        audioDuration: extra.audioDuration || 0,
        transcript: extra.transcript || ''
      },
      success: () => {
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.getTodayRecords();
      },
      fail: () => {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  },

  toggleVoiceInput() {
    if (!recorderManager) {
      wx.showToast({ title: '当前环境不支持语音', icon: 'none' });
      return;
    }
    if (this.data.isRecording) {
      recorderManager.stop();
      return;
    }
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        recorderManager.start({ duration: 60000, format: 'mp3' });
      },
      fail: () => {
        wx.showModal({
          title: '需要麦克风权限',
          content: '开启麦克风权限后，才可以录制语音记录。',
          success: res => { if (res.confirm) wx.openSetting(); }
        });
      }
    });
  }
});