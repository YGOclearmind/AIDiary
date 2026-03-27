// cloudfunctions/generateDiary/index.js
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 从配置文件读取敏感信息
const config = require('../../config.js');
const { apiKey, apiUrl, epId, modelName } = config.aiConfig;

// 调用 AI API 生成日记
async function generateDiaryContent(records) {
  const content = records.map(record => record.content).join('\n');
  
  try {
    // 构建提示词
    const prompt = `请根据以下流水账记录，生成一篇简洁的每日日记，要求：
1. 总结当天的主要活动和事件
2. 语言自然流畅，符合日记风格
3. 突出重点内容
4. 适当添加一些积极的感悟

流水账记录：
${content}

生成的日记：`;
    
    // 调用 AI API
    console.log('开始调用AI API');
    const response = await axios.post(apiUrl, {
      model: modelName,
      messages: [
        { role: 'system', content: '你是一个专业的日记撰写助手，擅长将零散的记录整理成有条理的日记' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'x-volcengine-ep-id': epId
      },
      timeout: 60000 // 设置请求超时时间（大模型生成慢，改为60秒）
    });
    
    console.log('AI API调用成功', response.data);
    
    // 提取 AI 生成的内容
    const diaryContent = response.data.choices[0].message.content;
    return diaryContent;
  } catch (error) {
    console.error('AI API 调用失败', error);
    // 降级处理：使用默认模板
    return `# 今日日记\n\n${content}\n\n今天是充实的一天，完成了很多事情。希望明天也能保持这样的状态！`;
  }
}

// 增加云函数超时时间（默认3秒，大模型生成较慢，设置为60秒）
exports.config = {
  timeout: 60000
};

exports.main = async (event, context) => {
  try {
    console.log('开始生成日记', event);
    const { date } = event;
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    
    // 获取当天的记录
    console.log('获取当天记录', date, openid);
    const records = await db.collection('records')
      .where({ 
        date: date,
        _openid: openid
      })
      .get();
    
    console.log('获取到记录', records.data.length);
    if (records.data.length === 0) {
      return {
        success: false,
        message: '当天无记录'
      };
    }
    
    // 生成日记
    console.log('开始生成日记内容');
    const diaryContent = await generateDiaryContent(records.data);
    console.log('日记生成完成');
    
    // 保存日记到数据库
    console.log('保存日记到数据库');
    const result = await db.collection('diaries').add({
      data: {
        type: 'daily',
        date: date,
        content: diaryContent,
        createTime: new Date().toLocaleString()
      }
    });
    
    console.log('保存成功', result);
    return {
      success: true,
      diary: diaryContent
    };
  } catch (error) {
    console.error('生成日记失败', error);
    return {
      success: false,
      message: '生成日记失败',
      error: error.message
    };
  }
};