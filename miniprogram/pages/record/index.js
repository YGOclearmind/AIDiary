const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const recorderManager = wx.getRecorderManager();

function padNumber(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function formatRecordDate(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatRecordDateTime(date) {
  const hours = date.getHours();
  const period = hours >= 12 ? '下午' : '上午';
  const displayHour = hours % 12 || 12;
  return `${formatRecordDate(date)}${period}${displayHour}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}`;
}

function formatPickerDate(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function formatMonthDay(date) {
  return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

Page({
  data: {
    inputValue: '',
    records: [],
    isRecording: false,
    voiceAvailable: true,
    showVoiceEntry: false,
    selectedRecordDate: '',
    showInputTip: false,
    voiceStatus: '点击开始录音，保存一条语音记录',
    recentRangeText: '近14天记录',
    recentRecordCount: 0,
    inspirationLoading: false,
    inspirationMonthDay: formatMonthDay(new Date()),
    inspirationFact: '',
    inspirationMemory: null,
    inspirationFacts: [],
    inspirationMemories: [],
    inspirationError: '',
    playingRecordId: '',
    isDevtools: false
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    this.audioTempUrlCache = {};
    this.currentPlayingRecordId = '';
    this.innerAudioContext = wx.createInnerAudioContext();
    this.setData({
      isDevtools: systemInfo.platform === 'devtools',
      selectedRecordDate: formatPickerDate(new Date())
    });
    this.initVoiceInput();
    this.initAudioPlayer();
    this.getTodayInspiration();
    this.getRecords();
  },

  onUnload() {
    if (this.data.isRecording) {
      recorderManager.stop();
    }
    if (this.innerAudioContext) {
      this.innerAudioContext.stop();
      this.innerAudioContext.destroy();
    }
  },

  initVoiceInput() {
    if (!recorderManager) {
      this.setData({
        voiceAvailable: false,
        voiceStatus: '当前环境暂不支持语音输入'
      });
      return;
    }

    recorderManager.onStart(() => {
      this.setData({
        isRecording: true,
        voiceStatus: '正在录音，再点一次即可结束'
      });
    });

    recorderManager.onStop(res => {
      this.setData({
        isRecording: false,
        voiceStatus: '录音完成，正在上传保存'
      });
      if (!res.tempFilePath) {
        wx.showToast({
          title: '未获取到录音文件',
          icon: 'none'
        });
        this.setData({
          voiceStatus: '录音失败，请重新尝试'
        });
        return;
      }
      this.saveAudioRecord(res.tempFilePath, res.duration || 0);
    });

    recorderManager.onError(() => {
      this.setData({
        isRecording: false,
        voiceStatus: '录音失败，请稍后重试'
      });
      wx.showToast({
        title: '录音失败',
        icon: 'none'
      });
    });
  },

  initAudioPlayer() {
    this.innerAudioContext.onEnded(() => {
      this.currentPlayingRecordId = '';
      this.setData({
        playingRecordId: ''
      });
    });

    this.innerAudioContext.onStop(() => {
      this.currentPlayingRecordId = '';
      this.setData({
        playingRecordId: ''
      });
    });

    this.innerAudioContext.onError(() => {
      this.currentPlayingRecordId = '';
      this.setData({
        playingRecordId: ''
      });
      wx.showToast({
        title: '播放失败',
        icon: 'none'
      });
    });
  },

  inputContent(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  onRecordDateChange(e) {
    this.setData({
      selectedRecordDate: e.detail.value
    });
  },

  handleInputFocus() {
    this.setData({
      showInputTip: true
    });
  },

  handleInputBlur() {
    this.setData({
      showInputTip: false
    });
  },

  refreshInspiration() {
    const facts = this.data.inspirationFacts || [];
    const memories = this.data.inspirationMemories || [];
    let inspirationFact = '';
    let inspirationMemory = null;
    if (facts.length) {
      const factIndex = Math.floor(Math.random() * facts.length);
      inspirationFact = facts[factIndex];
    }
    if (memories.length) {
      const memoryIndex = Math.floor(Math.random() * memories.length);
      inspirationMemory = memories[memoryIndex];
    }
    this.setData({
      inspirationFact,
      inspirationMemory,
      inspirationError: ''
    });
  },

  getTodayInspiration() {
    this.setData({
      inspirationLoading: true,
      inspirationError: ''
    });
    wx.cloud.callFunction({
      name: 'getTodayInspiration',
      success: res => {
        const result = res.result || {};
        if (!result.success) {
          this.setData({
            inspirationLoading: false,
            inspirationError: result.message || '灵感获取失败',
            inspirationMonthDay: result.monthDay || formatMonthDay(new Date()),
            inspirationFact: '',
            inspirationMemory: null,
            inspirationFacts: [],
            inspirationMemories: []
          });
          return;
        }
        this.setData({
          inspirationLoading: false,
          inspirationMonthDay: result.monthDay || formatMonthDay(new Date()),
          inspirationFacts: result.facts || [],
          inspirationMemories: result.memoryRecords || []
        });
        this.refreshInspiration();
      },
      fail: () => {
        this.setData({
          inspirationLoading: false,
          inspirationError: '灵感获取失败，请稍后重试',
          inspirationMonthDay: formatMonthDay(new Date()),
          inspirationFact: '',
          inspirationMemory: null,
          inspirationFacts: [],
          inspirationMemories: []
        });
      }
    });
  },

  formatDuration(duration) {
    const totalSeconds = Math.max(1, Math.round(duration / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
  },

  saveAudioRecord(tempFilePath, duration) {
    const now = Date.now();
    const matchedExtension = tempFilePath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    const extension = matchedExtension ? matchedExtension[1].toLowerCase() : 'mp3';
    const cloudPath = `records/audio/${now}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

    wx.showLoading({
      title: '保存语音中...'
    });

    wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath,
      success: res => {
        this.transcribeAndSaveAudio(res.fileID, extension, duration);
      },
      fail: () => {
        wx.hideLoading();
        this.setData({
          voiceStatus: '语音上传失败，请重试'
        });
        wx.showToast({
          title: '语音上传失败',
          icon: 'none'
        });
      }
    });
  },

  transcribeAndSaveAudio(fileID, format, duration) {
    wx.showLoading({
      title: '语音转文字中...'
    });

    wx.cloud.callFunction({
      name: 'transcribeAudio',
      data: {
        fileID: fileID,
        format: format
      },
      success: res => {
        wx.hideLoading();
        const result = res.result || {};
        const transcript = (result.transcript || '').trim();

        if (!result.success || !transcript) {
          this.setData({
            voiceStatus: '语音已保存，但转文字失败'
          });
          this.saveRecord(`语音记录（${this.formatDuration(duration)}）`, {
            recordType: 'audio',
            audioFileID: fileID,
            audioDuration: duration,
            transcript: ''
          });
          wx.showToast({
            title: result.message || '语音转写失败',
            icon: 'none'
          });
          return;
        }

        this.setData({
          voiceStatus: '语音已转成文字并保存'
        });
        this.saveRecord(transcript, {
          recordType: 'audio',
          audioFileID: fileID,
          audioDuration: duration,
          transcript: transcript
        });
      },
      fail: () => {
        wx.hideLoading();
        this.setData({
          voiceStatus: '语音已保存，但转文字失败'
        });
        this.saveRecord(`语音记录（${this.formatDuration(duration)}）`, {
          recordType: 'audio',
          audioFileID: fileID,
          audioDuration: duration,
          transcript: ''
        });
        wx.showToast({
          title: '语音转写失败',
          icon: 'none'
        });
      }
    });
  },

  playAudio(e) {
    const { id, fileid } = e.currentTarget.dataset;

    if (!fileid) {
      wx.showToast({
        title: '语音文件不存在',
        icon: 'none'
      });
      return;
    }

    if (this.currentPlayingRecordId === id) {
      this.innerAudioContext.stop();
      return;
    }

    wx.showLoading({
      title: '加载语音中...'
    });

    const playByUrl = url => {
      wx.hideLoading();
      this.currentPlayingRecordId = id;
      this.innerAudioContext.src = url;
      this.innerAudioContext.play();
      this.setData({
        playingRecordId: id
      });
    };

    if (this.audioTempUrlCache[fileid]) {
      playByUrl(this.audioTempUrlCache[fileid]);
      return;
    }

    wx.cloud.getTempFileURL({
      fileList: [fileid],
      success: res => {
        const file = res.fileList && res.fileList[0];
        if (!file || !file.tempFileURL) {
          wx.hideLoading();
          wx.showToast({
            title: '获取语音失败',
            icon: 'none'
          });
          return;
        }
        this.audioTempUrlCache[fileid] = file.tempFileURL;
        playByUrl(file.tempFileURL);
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '获取语音失败',
          icon: 'none'
        });
      }
    });
  },

  toggleVoiceInput() {
    if (!this.data.voiceAvailable || !recorderManager) {
      wx.showToast({
        title: '当前环境不支持语音输入',
        icon: 'none'
      });
      return;
    }

    if (this.data.isRecording) {
      recorderManager.stop();
      return;
    }

    if (this.data.isDevtools) {
      wx.showToast({
        title: '录音播放请以真机效果为准',
        icon: 'none'
      });
    }

    wx.authorize({
      scope: 'scope.record',
      success: () => {
        recorderManager.start({
          duration: 60000,
          format: 'mp3'
        });
      },
      fail: () => {
        wx.showModal({
          title: '需要麦克风权限',
          content: '开启麦克风权限后，才可以直接录制语音记录。',
          success: res => {
            if (res.confirm) {
              wx.openSetting();
            }
          }
        });
      }
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
    this.setData({
      inputValue: '',
      showInputTip: false,
      voiceStatus: this.data.voiceAvailable ? '点击开始录音，保存一条语音记录' : this.data.voiceStatus
    });
  },

  saveRecord(content, extra = {}) {
    const db = wx.cloud.database();
    const now = new Date();
    const selected = this.data.selectedRecordDate || formatPickerDate(now);
    const parts = selected.split('-').map(item => Number(item));
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    const isValidDate = year && month && day;
    const recordDate = isValidDate
      ? new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
      : now;
    const createTime = formatRecordDateTime(recordDate);
    const timestamp = recordDate.getTime();
    const date = formatRecordDate(recordDate);
    const monthDay = formatMonthDay(recordDate);

    db.collection('records').add({
      data: {
        content: content,
        createTime: createTime,
        date: date,
        timestamp: timestamp,
        year: recordDate.getFullYear(),
        monthDay: monthDay,
        recordType: extra.recordType || 'text',
        audioFileID: extra.audioFileID || '',
        audioDuration: extra.audioDuration || 0,
        transcript: extra.transcript || ''
      },
      success: function() {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
        this.getRecords();
      }.bind(this),
      fail: function() {
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      }
    });
  },

  getRecords() {
    const db = wx.cloud.database();
    const _ = db.command;
    const startTimestamp = Date.now() - TWO_WEEKS_MS;

    db.collection('records')
      .where({
        timestamp: _.gte(startTimestamp)
      })
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get({
        success: function(res) {
          const records = res.data.map(item => ({
            ...item,
            recordType: item.recordType || 'text',
            audioDurationText: item.audioDuration ? this.formatDuration(item.audioDuration) : '',
            transcriptText: item.transcript || item.content || ''
          }));
          this.setData({
            records: records,
            recentRecordCount: records.length
          });
        }.bind(this),
        fail: function(res) {
          console.error('获取记录失败', res);
          wx.showToast({
            title: '获取记录失败',
            icon: 'none'
          });
        }
      });
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
        } else {
          wx.showToast({
            title: res.result.message || '生成日记失败',
            icon: 'none'
          });
        }
      },
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

    console.log('调用周报云函数，参数：', {
      startDate: weekAgo.toLocaleString(),
      endDate: now.toLocaleString(),
      startTimestamp: weekAgo.getTime(),
      endTimestamp: now.getTime()
    });

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
        } else {
          wx.showToast({
            title: res.result.message || '生成周报失败',
            icon: 'none'
          });
        }
      },
      fail: function() {
        wx.hideLoading();
        wx.showToast({
          title: '生成周报失败',
          icon: 'none'
        });
      }
    });
  },

  editRecord(e) {
    const recordId = e.currentTarget.dataset.id;
    if (!recordId) {
      wx.showToast({
        title: '获取记录ID失败',
        icon: 'none'
      });
      return;
    }

    const record = this.data.records.find(item => item._id === recordId);
    if (!record) {
      wx.showToast({
        title: '获取记录失败',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '修改记录',
      editable: true,
      placeholderText: '请输入新的内容',
      content: record.content,
      success: (res) => {
        if (res.confirm && res.content) {
          const newContent = res.content.trim();
          if (!newContent) {
            wx.showToast({
              title: '内容不能为空',
              icon: 'none'
            });
            return;
          }

          const db = wx.cloud.database();
          db.collection('records').doc(recordId).update({
            data: {
              content: newContent
            },
            success: () => {
              wx.showToast({
                title: '修改成功',
                icon: 'success'
              });
              this.getRecords();
            },
            fail: () => {
              wx.showToast({
                title: '修改失败，请重试',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  },

  deleteRecord(e) {
    const recordId = e.currentTarget.dataset.id;
    if (!recordId) {
      wx.showToast({
        title: '获取记录ID失败',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？删除后不可恢复。',
      success: (res) => {
        if (res.confirm) {
          const db = wx.cloud.database();
          db.collection('records').doc(recordId).remove({
            success: () => {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
              this.getRecords();
            },
            fail: () => {
              wx.showToast({
                title: '删除失败，请重试',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  }
});
