const cloud = require('wx-server-sdk');
const axios = require('axios');
const crypto = require('crypto');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

let asrConfig = {};

try {
  const config = require('./config.js');
  asrConfig = config.asrConfig || {};
} catch (error) {
  asrConfig = {};
}

const SUCCESS_CODE = 1000;
const RUNNING_CODES = [2000, 2001];
const SUBMIT_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit';
const QUERY_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query';
const RESOURCE_FALLBACKS = ['volc.seedasr.auc', 'volc.bigasr.auc'];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createUserId() {
  return `wx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createTaskId() {
  return crypto.randomUUID();
}

function createHeaders(taskId, resourceId) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Resource-Id': resourceId,
    'X-Api-Request-Id': taskId,
    'X-Api-Sequence': '-1'
  };

  if (asrConfig.apiKey) {
    headers['X-Api-Key'] = asrConfig.apiKey;
  } else {
    headers['X-Api-App-Key'] = asrConfig.appId;
    headers['X-Api-Access-Key'] = asrConfig.accessToken;
  }

  return headers;
}

function extractTranscript(result) {
  if (!result) {
    return '';
  }

  if (typeof result.text === 'string' && result.text.trim()) {
    return result.text.trim();
  }

  const utterances = Array.isArray(result.utterances) ? result.utterances : [];
  const utteranceText = utterances.map(item => item.text || '').join('').trim();
  if (utteranceText) {
    return utteranceText;
  }

  const paragraphs = Array.isArray(result.paragraphs) ? result.paragraphs : [];
  const paragraphText = paragraphs.map(item => item.text || '').join('').trim();
  if (paragraphText) {
    return paragraphText;
  }

  return '';
}

function getAxiosErrorMessage(error) {
  if (error && error.response && error.response.data) {
    const data = error.response.data;
    if (typeof data === 'string' && data.trim()) {
      return data;
    }
    if (data.message) {
      return data.message;
    }
    if (data.msg) {
      return data.msg;
    }
    return JSON.stringify(data);
  }
  return error.message || '语音转写失败';
}

async function getAudioUrl(fileID) {
  const res = await cloud.getTempFileURL({
    fileList: [fileID]
  });
  const file = res.fileList && res.fileList[0];

  if (!file || !file.tempFileURL) {
    throw new Error('获取语音文件地址失败');
  }

  return file.tempFileURL;
}

function getCandidateResourceIds() {
  const preferred = asrConfig.resourceId || RESOURCE_FALLBACKS[0];
  const list = [preferred, ...RESOURCE_FALLBACKS];
  return Array.from(new Set(list.filter(Boolean)));
}

function isResourceDeniedError(error) {
  const message = getAxiosErrorMessage(error);
  return error && error.response && error.response.status === 403 && message.includes('requested resource not granted');
}

async function submitTranscriptionTask(audioUrl, format, resourceId) {
  const taskId = createTaskId();
  const payload = {
    user: {
      uid: createUserId()
    },
    audio: {
      format: format || 'mp3',
      url: audioUrl,
      language: asrConfig.language || 'zh-CN',
      codec: asrConfig.codec || 'raw',
      rate: asrConfig.rate || 16000,
      bits: asrConfig.bits || 16,
      channel: asrConfig.channel || 1
    },
    request: {
      model_name: asrConfig.modelName || 'bigmodel',
      enable_itn: asrConfig.enableItn !== false,
      enable_punc: asrConfig.enablePunc === true,
      enable_ddc: asrConfig.enableDdc === true,
      enable_speaker_info: asrConfig.enableSpeakerInfo === true,
      enable_channel_split: asrConfig.enableChannelSplit === true,
      show_utterances: asrConfig.showUtterances === true,
      vad_segment: asrConfig.vadSegment === true,
      sensitive_words_filter: asrConfig.sensitiveWordsFilter || ''
    }
  };

  const response = await axios.post(
    SUBMIT_URL,
    payload,
    {
      headers: createHeaders(taskId, resourceId),
      timeout: 60000
    }
  );

  return {
    taskId,
    resourceId
  };
}

async function queryTranscriptionTask(taskId, resourceId) {
  const response = await axios.post(
    QUERY_URL,
    {},
    {
      headers: createHeaders(taskId, resourceId),
      timeout: 60000
    }
  );

  return response.data || {};
}

async function waitForTranscript(taskId, resourceId) {
  for (let index = 0; index < 20; index += 1) {
    const result = await queryTranscriptionTask(taskId, resourceId);
    const resp = result.resp || result.result || result;
    const code = resp.code;
    const transcript = extractTranscript(result) || extractTranscript(resp);

    if (transcript) {
      return transcript;
    }

    if (typeof code !== 'undefined' && !RUNNING_CODES.includes(code) && code !== SUCCESS_CODE) {
      throw new Error(resp.message || result.message || '语音转写失败');
    }

    await sleep(2000);
  }

  throw new Error('语音转写超时');
}

async function createTranscriptionTaskWithFallback(audioUrl, format) {
  let lastError = null;

  for (const resourceId of getCandidateResourceIds()) {
    try {
      return await submitTranscriptionTask(audioUrl, format, resourceId);
    } catch (error) {
      lastError = error;
      if (!isResourceDeniedError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('提交转写任务失败');
}

exports.config = {
  timeout: 60000
};

exports.main = async event => {
  try {
    const { fileID, format } = event;

    if (!fileID) {
      return {
        success: false,
        message: '缺少语音文件'
      };
    }

    if (!asrConfig.apiKey && (!asrConfig.appId || !asrConfig.accessToken)) {
      return {
        success: false,
        message: '请先在 transcribeAudio 的 config.js 中配置语音识别密钥'
      };
    }

    const audioUrl = await getAudioUrl(fileID);
    const task = await createTranscriptionTaskWithFallback(audioUrl, format);
    const transcript = await waitForTranscript(task.taskId, task.resourceId);

    if (!transcript) {
      return {
        success: false,
        message: '未识别到语音内容'
      };
    }

    return {
      success: true,
      transcript: transcript
    };
  } catch (error) {
    console.error('语音转写失败', error);
    return {
      success: false,
      message: getAxiosErrorMessage(error)
    };
  }
};
