const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const CATEGORY_KNOWLEDGE = [
  { code: 'food', name: '美食', keywords: ['吃', '喝', '奶茶', '火锅', '餐厅', '外卖', '美团', '咖啡'] },
  { code: 'movie', name: '电影', keywords: ['电影', '影院', '追剧', '剧集', '综艺', '纪录片'] },
  { code: 'study', name: '学习', keywords: ['学习', '复习', '读书', '课程', '刷题', '作业', '笔记'] },
  { code: 'work', name: '工作', keywords: ['工作', '需求', '项目', '开会', '汇报', '客户', '职场'] },
  { code: 'sport', name: '运动', keywords: ['运动', '跑步', '健身', '游泳', '骑行', '瑜伽'] },
  { code: 'other', name: '其他', keywords: ['散步', '聊天', '整理', '购物', '家务'] }
];

const SENTENCE_POOL = {
  美食: ['中午点了外卖，试了新店的招牌饭', '晚上和朋友去吃火锅，味道很不错', '下午买了杯奶茶，状态回来了', '早餐吃了热干面，今天很满足'],
  电影: ['晚上看了一部电影，节奏挺紧凑', '补完了一集纪录片，信息量很大', '和朋友聊了最近热门电影，准备周末去看', '今天追了两集剧，剧情反转很精彩'],
  学习: ['今天整理了课程笔记，重点更清晰了', '晚上刷了几道题，错题已记录', '读了半小时书，摘了几条有意思的观点', '复习了上周内容，查漏补缺效果不错'],
  工作: ['上午开了需求会，确认了本周优先级', '下午推进项目文档，结构更完整了', '和同事同步了进度，问题基本解决', '今天把待办拆分后效率明显提高'],
  运动: ['下班后去跑了三公里，状态不错', '做了二十分钟拉伸，肩颈舒服很多', '今天骑行通勤，顺便活动身体', '晚饭后散步半小时，心情放松了'],
  其他: ['今天整理了房间，桌面清爽了很多', '和家人通了电话，聊得很开心', '路上看到有趣的小店，记下来改天去', '处理了几个生活小事，心里更踏实了']
};

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

function formatMonthDay(date) {
  return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function buildMockRecord(date, openid) {
  const categories = Object.keys(SENTENCE_POOL);
  const category = randomFrom(categories);
  const sentence = randomFrom(SENTENCE_POOL[category]);
  return {
    _openid: openid,
    userOpenid: openid,
    content: sentence,
    createTime: formatRecordDateTime(date),
    date: formatRecordDate(date),
    timestamp: date.getTime(),
    year: date.getFullYear(),
    monthDay: formatMonthDay(date),
    recordType: 'text',
    audioFileID: '',
    audioDuration: 0,
    transcript: '',
    isMock: true,
    mockCategory: category
  };
}

async function ensureCategoryKnowledge() {
  for (const category of CATEGORY_KNOWLEDGE) {
    const exists = await db.collection('categoryKnowledge')
      .where({
        code: category.code
      })
      .limit(1)
      .get();
    if (exists.data.length) {
      await db.collection('categoryKnowledge').doc(exists.data[0]._id).update({
        data: {
          ...category,
          enabled: true
        }
      });
    } else {
      await db.collection('categoryKnowledge').add({
        data: {
          ...category,
          enabled: true
        }
      });
    }
  }
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) {
      return {
        success: false,
        message: '无法获取当前用户 openid'
      };
    }

    const years = Number(event && event.years) || 3;
    const totalDays = years * 365;
    const interval = 4;
    const now = new Date();
    const records = [];

    await ensureCategoryKnowledge();

    for (let offset = totalDays; offset >= 0; offset -= interval) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 19, 30, 0, 0);
      records.push(buildMockRecord(date, openid));
    }

    for (const record of records) {
      await db.collection('records').add({
        data: record
      });
    }

    return {
      success: true,
      count: records.length,
      message: `已生成${records.length}条三年示例数据`,
      openid
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '生成示例数据失败'
    };
  }
};
