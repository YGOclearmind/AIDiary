// cloudfunctions/generateWeekly/index.js
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 从配置文件读取敏感信息
const config = require('../../config.js');
const { apiKey, apiUrl, epId, modelName } = config.aiConfig;

// 调用 AI API 生成周报
async function generateWeeklyContent(records) {
  const content = records.map(record => record.content).join('\n');
  
  try {
    // 构建提示词
    const prompt = `请根据以下流水账记录，生成一篇简洁的每周周报，要求：
1. 总结本周的主要活动和事件
2. 分析本周的工作或生活情况
3. 语言正式流畅，符合周报风格
4. 突出重点内容和成果
5. 适当添加一些下周的计划或展望

流水账记录：
${content}

生成的周报：`;
    
    // 调用 AI API
    console.log('开始调用AI API');
    const response = await axios.post(apiUrl, {
      model: modelName,
      messages: [
        { role: 'system', content: '你是一个专业的周报撰写助手，擅长将零散的记录整理成有条理的周报' },
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
    const weeklyContent = response.data.choices[0].message.content;
    return weeklyContent;
  } catch (error) {
    console.error('AI API 调用失败', error);
    // 降级处理：使用默认模板
    return `# 本周周报\n\n${content}\n\n本周完成了多项任务，收获满满。下周继续加油！`;
  }
}

// 增加云函数超时时间（默认3秒，大模型生成较慢，设置为60秒）
exports.config = {
  timeout: 60000
};

exports.main = async (event, context) => {
  try {
    console.log('开始生成周报', event);
    const { startDate, endDate, startTimestamp, endTimestamp } = event;
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    
    // 获取本周的记录
    console.log('=============周报云函数启动=============');
    console.log('获取本周记录', { startTimestamp, endTimestamp, openid });
    
    let records;
    if (startTimestamp && endTimestamp) {
      // 优先使用时间戳进行查询，确保准确性
      // 使用 db.command 来获取查询指令
      const _ = db.command;
      console.log('使用 timestamp 方式查询');
      records = await db.collection('records')
        .where({
          _openid: openid,
          timestamp: _.gte(startTimestamp).and(_.lte(endTimestamp))
        })
        .get();
    } else {
      // 兼容旧的字符串查询（仅作降级）
      const _ = db.command;
      console.log('使用 createTime 方式查询（兼容模式）');
      records = await db.collection('records')
        .where({
          _openid: openid,
          createTime: _.gte(startDate).and(_.lte(endDate))
        })
        .get();
    }
    
    console.log('查询数据库完成，获取到记录数量:', records.data.length);
    console.log('具体数据:', records.data);
    if (records.data.length === 0) {
      return {
        success: false,
        message: '本周无记录'
      };
    }
    
    // 生成周报
    console.log('开始生成周报内容');
    const weeklyContent = await generateWeeklyContent(records.data);
    console.log('周报生成完成');
    
    // 保存周报到数据库
    console.log('保存周报到数据库');
    const result = await db.collection('diaries').add({
      data: {
        type: 'weekly',
        startDate: startDate,
        endDate: endDate,
        content: weeklyContent,
        createTime: new Date().toLocaleString()
      }
    });
    
    console.log('保存成功', result);
    return {
      success: true,
      weekly: weeklyContent
    };
  } catch (error) {
    console.error('生成周报失败', error);
    return {
      success: false,
      message: '生成周报失败',
      error: error.message
    };
  }
};