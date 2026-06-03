const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

function getEnvText(name) {
  return String((process.env && process.env[name]) || '').trim();
}

let aiConfig = {
  apiKey: '',
  apiUrl: '',
  epId: '',
  modelName: ''
};

try {
  const config = require('./config.js');
  if (config && config.aiConfig) {
    aiConfig = {
      ...aiConfig,
      ...config.aiConfig
    };
  }
} catch (error) {}

if (!aiConfig.apiKey) aiConfig.apiKey = getEnvText('AI_API_KEY');
if (!aiConfig.apiUrl) aiConfig.apiUrl = getEnvText('AI_API_URL');
if (!aiConfig.epId) aiConfig.epId = getEnvText('AI_EP_ID');
if (!aiConfig.modelName) aiConfig.modelName = getEnvText('AI_MODEL_NAME');

let todayApiConfig = {
  url: 'https://cn.apihz.cn/api/zici/today.php',
  id: '88888888',
  key: '88888888'
};

try {
  const config = require('./config.js');
  if (config && config.todayApiConfig) {
    todayApiConfig = {
      ...todayApiConfig,
      ...config.todayApiConfig
    };
  }
} catch (error) {}

function normalizeText(text) {
  return String(text || '').trim();
}

function padNumber(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function toDateString(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function getMonthDay(date) {
  return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function getRecordText(record) {
  if (!record) return '';
  if (record.recordType === 'audio') return normalizeText(record.transcript || record.content);
  return normalizeText(record.content);
}

async function getRecordsByDate(openid, dateStr) {
  const parts = dateStr.split('-');
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  const res = await db.collection('records')
    .where({
      _openid: openid,
      timestamp: _.gte(start.getTime()).and(_.lte(end.getTime()))
    })
    .orderBy('timestamp', 'desc')
    .limit(50)
    .get();

  return res.data || [];
}

async function generateMemoryWithAI(lastMonthRecords, lastYearRecords, lastMonthDate, lastYearDate) {
  const parts = [];

  if (lastMonthRecords.length > 0) {
    const texts = lastMonthRecords.map(r => `- ${getRecordText(r)}`).filter(t => t.length > 2).join('\n');
    if (texts) {
      parts.push(`【上个月今日（${lastMonthDate}）的记录】\n${texts}`);
    }
  }

  if (lastYearRecords.length > 0) {
    const texts = lastYearRecords.map(r => `- ${getRecordText(r)}`).filter(t => t.length > 2).join('\n');
    if (texts) {
      parts.push(`【去年今日（${lastYearDate}）的记录】\n${texts}`);
    }
  }

  if (parts.length === 0) return '';

  const prompt = `你是一个充满灵感的回忆诗人。请根据用户过去的记录，写一段让人会心一笑的回忆灵感。

风格要求：
- 像朋友圈里最会说话的那个人，随性、有画面感、带点小惊喜
- 可以用比喻、拟人、反差等手法，让平淡的记录变得有趣
- 不要写成总结或汇报，要写成一句让人忍不住微笑的话
- 1-2句话，50字以内，短小精悍
- 如果有去年今日的记录，以"去年今日"内容为主；如果只有上个月今日的记录，以"上个月的今天"内容为主
- 结合用户过往随手记内容，抓取当日关键事件（美食 / 出行 / 情绪 / 人际），自然代入回忆对比，立足「当下回望过去」视角

示例：
一、日常烟火写实风（最常用，适配吃饭、通勤、居家小事）
1.【短句】去年今日下班拐进老巷，便利店冰镇汽水冒着水珠，晚风卷着街边炸串香气，当时只当普通傍晚，时隔一年再回望，才发觉是平淡日子里藏着的松弛小圆满。
2.【长随笔】一年前的这个傍晚，独自在出租屋煮了一锅番茄面，窗外落着连绵小雨，没有工作消息打扰，窝在沙发边吃面边漫无目的地刷纪录片。那时正深陷迷茫，总嫌弃日子枯燥，如今奔波忙碌，反倒格外怀念这种无事缠身、三餐安稳的平凡时刻。原来珍贵从不是盛大瞬间，是寻常烟火。
二、青春怀旧走心风（学生时代、挚友、青涩心动）
1.【短句】前年今日闷热盛夏，晚自习课桌堆满试卷，同桌偷偷塞来半块冰镇西瓜，风扇吱呀转动，蝉鸣漫过整座校园，一晃，我们就各自奔赴不同城市了。
2.【长随笔】翻看存档才记起，三年前同一天和三五好友相约海边，赤脚踩在温热沙滩，追着退潮浪花乱跑，傍晚挤在小摊吃烧烤，随口约定每年都要碰面。后来生活被工作填满，见面次数越来越少，原来年少随口的约定，败给了匆匆岁月，但那天的海风与欢笑永远留在那年今日。
三、成长自省感悟风（职场转折、心态蜕变、低谷回望）
1.【短句】去年今日裸辞在家陷入自我怀疑，整日焦虑内耗，随手在备忘录写下想要好好生活；时隔一整年，慢慢稳住节奏，终于读懂所有低谷都是蜕变的铺垫。
2.【长随笔】整整一年前的今天，经历项目失败、求职碰壁，躲在房间彻夜失眠，一度否定所有付出。现在回头再看，当初跨不过的坎，早已变成阅历。那年今日的狼狈，教会我接纳不完美，不必急于求成，慢慢来也是人生答案。
四、脑洞诗意意象风（开拓性强、文艺小众，区别普通流水账）
1.【短句】那年今日风携桂花落满窗台，我把细碎花香藏进书页，如今再翻旧书，仿佛一瞬穿梭回彼时秋风里，和从前的自己隔空碰面。
2.【长随笔】如果时间可以具象，那年今日的落日一定被我封存在旧相册里。那天傍晚站在天桥看满城灯火，忽然妄想抓住转瞬即逝的晚霞。时隔四季，见过无数晨昏，才懂不必挽留转瞬即逝的光景，每一段遇见与别离，都是岁月馈赠的独家藏品。
五、趣味沙雕回忆风（生活化搞笑、中二往事，年轻化适配小程序）
1.【短句】两年前今日突发奇想自制美食，一锅黑暗料理翻车，整锅倒进垃圾桶，发誓再也下厨，现在厨艺突飞猛进，回看当初哭笑不得。
2.【长随笔】翻日记笑到失语，三年前同一天立志早睡早起、健身减脂，结果当晚熬夜追剧到凌晨，零食摆满床头。年年立下同款 flag，年年倒在半途。那年今日幼稚的小执念，变成现在治愈疲惫的快乐回忆。
六、亲情思念温柔风（家人、故乡、离别牵挂）
1.【短句】去年今日回老家，奶奶在灶台炖我爱喝的汤，絮絮叨叨叮嘱琐碎小事，返程那天后备箱塞满土特产，如今再难常回家，那日温暖反复在回忆里重播。
2.【长随笔】一年前的今天过完春节离开故乡，车子驶出村口时，长辈还站在路边挥手。独自在外奔波的日子总被琐事裹挟，直到那年今日再次到来，猛然想念家里热腾腾的饭菜与细碎叮嘱。原来故乡与亲人，永远是漂泊之人的精神退路。

${parts.join('\n\n')}

回忆灵感：`;

  try {
    const response = await axios.post(aiConfig.apiUrl, {
      model: aiConfig.modelName,
      messages: [
        {
          role: 'system',
          content: '你是一个充满灵感的回忆诗人，擅长从平淡的日常记录中发现有趣的细节，用一句话让过去变得鲜活。你的文字随性自然，带点小幽默，让人会心一笑。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 200,
      temperature: 0.8
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`,
        'x-volcengine-ep-id': aiConfig.epId
      },
      timeout: 30000
    });

    return normalizeText(response.data.choices[0].message.content);
  } catch (error) {
    console.error('AI API调用失败:', error);
    return '';
  }
}

function parseFactsFromAa1Body(body) {
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.data)) {
    return (body.data || []).map(item => String(item || '').trim()).filter(Boolean);
  }
  const title = String(body.title || '').trim();
  if (!title) return [];
  const y = String(body.y || '').trim();
  const m = String(body.m || '').trim();
  const d = String(body.d || '').trim();
  const datePrefix = y && m && d ? `${y}年${m}月${d}日 ` : '';
  return [`${datePrefix}${title}`];
}

async function fetchTodayFacts(monthDay) {
  if (!todayApiConfig.id || !todayApiConfig.key) return [];

  const dateStartTimestamp = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();

  const cached = await db.collection('todayFacts')
    .where({ monthDay, source: 'aa1', cacheDate: dateStartTimestamp })
    .limit(1)
    .get();

  if (cached.data.length) {
    const facts = cached.data[0].facts || [];
    return Array.isArray(facts) ? facts : [];
  }

  try {
    const response = await axios.get(todayApiConfig.url, {
      params: { id: todayApiConfig.id, key: todayApiConfig.key },
      timeout: 10000
    });
    const body = response.data || {};
    if (body.code !== 200) return [];
    const facts = parseFactsFromAa1Body(body);
    if (facts.length) {
      const cacheData = {
        monthDay,
        source: 'aa1',
        cacheDate: dateStartTimestamp,
        facts,
        updatedAt: Date.now()
      };
      const existing = await db.collection('todayFacts')
        .where({ monthDay, source: 'aa1' })
        .limit(1)
        .get();
      if (existing.data.length) {
        await db.collection('todayFacts').doc(existing.data[0]._id).update({ data: cacheData });
      } else {
        await db.collection('todayFacts').add({ data: cacheData });
      }
    }
    return facts;
  } catch (error) {
    console.error('获取历史今日失败:', error);
    return [];
  }
}

function sampleItems(list, count) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

exports.config = {
  timeout: 60000
};

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const now = new Date();
    const todayStr = toDateString(now);

    console.log('开始生成回忆灵感, openid:', openid, 'todayStr:', todayStr);
    console.log('AI配置检查:', { hasApiKey: !!aiConfig.apiKey, hasApiUrl: !!aiConfig.apiUrl, hasEpId: !!aiConfig.epId, hasModel: !!aiConfig.modelName });
    console.log('历史API配置检查:', { hasId: !!todayApiConfig.id, hasKey: !!todayApiConfig.key });

    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const lastYearDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const lastMonthStr = toDateString(lastMonthDate);
    const lastYearStr = toDateString(lastYearDate);

    console.log('查询日期:', { lastMonthStr, lastYearStr });

    const [lastMonthRecords, lastYearRecords] = await Promise.all([
      getRecordsByDate(openid, lastMonthStr),
      getRecordsByDate(openid, lastYearStr)
    ]);

    console.log('查询结果:', { lastMonthCount: lastMonthRecords.length, lastYearCount: lastYearRecords.length });

    const hasMemory = lastMonthRecords.length > 0 || lastYearRecords.length > 0;

    if (hasMemory) {
      console.log('有历史记录，调用AI生成回忆灵感');
      const memoryText = await generateMemoryWithAI(
        lastMonthRecords,
        lastYearRecords,
        lastMonthStr,
        lastYearStr
      );

      console.log('AI生成结果:', memoryText ? '成功' : '失败/为空', memoryText ? memoryText.substring(0, 50) : '');

      if (memoryText) {
        return {
          success: true,
          type: 'memory',
          text: memoryText,
          lastMonthDate: lastMonthStr,
          lastYearDate: lastYearStr,
          hasLastMonth: lastMonthRecords.length > 0,
          hasLastYear: lastYearRecords.length > 0
        };
      }
    }

    console.log('无历史记录或AI失败，获取历史今日事件');
    const monthDay = getMonthDay(now);
    const facts = await fetchTodayFacts(monthDay);

    console.log('历史今日事件:', facts.length, '条');

    if (facts.length > 0) {
      const selected = sampleItems(facts, 3);
      const factText = selected.join('；');
      return {
        success: true,
        type: 'history',
        text: `📜 历史上的今天：${factText}`,
        facts: selected
      };
    }

    console.log('历史今日也无数据，返回默认文案');
    return {
      success: true,
      type: 'default',
      text: '每一天都值得记录，写下今天的故事吧 ✨'
    };
  } catch (error) {
    console.error('生成回忆灵感失败:', error);
    return {
      success: false,
      type: 'default',
      text: '每一天都值得记录，写下今天的故事吧 ✨',
      message: error.message
    };
  }
};
