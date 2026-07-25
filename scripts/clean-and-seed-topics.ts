import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// 管理员用户 ID（用于创建选题）
const ADMIN_USER_ID = "a689874f-12f1-43e1-8e20-87e2195fe041";

// 15条真实干货类选题数据，基于素材库真实视频内容
const REAL_TOPICS = [
  // === 暴力战法类 ===
  {
    title: "龙头一进二战法：暴力短线的核心秘诀",
    hook: "为什么有人能靠一进二翻倍，而你总是追高被套？关键在于识别龙头的三个信号：封板强度、换手率、板块联动。掌握这套打法，让你不再错过每一个主升浪起点。",
    topic_name: "暴力战法类",
    group_name: "龙头选股",
    emotion_tag: "兴奋",
    audience: "短线交易者",
  },
  {
    title: "傻瓜式5日均线战法：4步拿捏二波主升",
    hook: "还在凭感觉炒股？5日均线是最简单却最有效的短线工具。当股价回踩5日线不破，配合成交量放大，就是最佳上车点。学会这4步，让你的买卖不再纠结。",
    topic_name: "暴力战法类",
    group_name: "图形战法",
    emotion_tag: "自信",
    audience: "新手股民",
  },
  {
    title: "涨停次日是走还是留？看开盘溢价率就知道",
    hook: "买到涨停板是运气，卖在高点才是本事。顶级游资的秘密武器：看开盘30分钟的溢价率。高开3%以上持有，低开破昨日收盘价立刻走人。一张表格教你判断。",
    topic_name: "暴力战法类",
    group_name: "止盈止损",
    emotion_tag: "理性",
    audience: "涨停板玩家",
  },

  // === 情绪周期类 ===
  {
    title: "情绪周期规律讲解：看懂市场四季轮回",
    hook: "市场就像春夏秋冬，有冰点就有高潮。为什么你总在冰点割肉、高潮追高？因为你不懂情绪周期的四个阶段。学会识别冰点、回暖、高潮、退潮，让你的操作与市场同步。",
    topic_name: "情绪周期类",
    group_name: "周期入门",
    emotion_tag: "平静",
    audience: "所有股民",
  },
  {
    title: "高潮次日应对策略：别再当接盘侠",
    hook: "昨天满屏涨停，今天开盘就跌？这是高潮次日的经典陷阱。高手的做法：高潮当天减仓，次日只看不动，等分歧确认再出手。三招教你避开这个坑。",
    topic_name: "情绪周期类",
    group_name: "各阶段打法",
    emotion_tag: "警惕",
    audience: "短线交易者",
  },
  {
    title: "每年空仓的4个时间节点：避开大跌就是赚",
    hook: "会买的是徒弟，会卖的是师傅，会空仓的才是祖师爷。一年中有4个时间点必须空仓：财报季、长假前、政策窗口期、资金结算日。知道这些，你已经跑赢80%的散户。",
    topic_name: "情绪周期类",
    group_name: "空仓艺术",
    emotion_tag: "从容",
    audience: "稳健型投资者",
  },

  // === 案例拆解/复盘类 ===
  {
    title: "封神！炒股必学的完美复盘五步法",
    hook: "为什么别人复盘能发现机会，你复盘只是看热闹？因为你缺少系统方法。五步复盘法：看大盘、找主线、选龙头、定策略、做记录。坚持一个月，你的盘感会质变。",
    topic_name: "案例拆解/复盘类",
    group_name: "实盘日记",
    emotion_tag: "专注",
    audience: "想提升盘感的股民",
  },
  {
    title: "龙头、补涨、中军、卡位、跟风：一篇搞懂",
    hook: "同一个板块，为什么有的股票涨停，有的却不动？因为它们扮演的角色不同。龙头是带头大哥，补涨是后知后觉，中军是稳定军心。搞懂这5种角色，板块轮动一目了然。",
    topic_name: "案例拆解/复盘类",
    group_name: "妖股成龙史",
    emotion_tag: "恍然大悟",
    audience: "板块轮动玩家",
  },

  // === 降维认知类 ===
  {
    title: "如何看懂主力的真实意图：换手率的三种信号",
    hook: "换手率不是越高越好，关键看出现在什么位置。低位高换手是主力吸筹，高位高换手是出货信号，中位高换手是洗盘。三个案例教你识别主力真面目。",
    topic_name: "降维认知类",
    group_name: "主力思维",
    emotion_tag: "洞察",
    audience: "想看懂主力的散户",
  },
  {
    title: "A股跌破4000点真相：资金暗度陈仓布局新主线",
    hook: "大盘跌了，你慌了，但主力却在偷偷加仓。每次大跌都是资金切换主线的信号。这次资金从高位AI撤退，流向低位的新能源和消费。看懂资金流向，你就能提前布局。",
    topic_name: "降维认知类",
    group_name: "资金生态",
    emotion_tag: "冷静",
    audience: "中长线投资者",
  },
  {
    title: "游资大佬集体发文投降，量化时代散户的生路在哪？",
    hook: "游资都被量化收割了，散户还有活路吗？有。量化怕的是确定性趋势和长期持有。散户的优势是灵活和耐心。三个策略让你在量化时代活下来：做长线、等极端、反人性。",
    topic_name: "降维认知类",
    group_name: "产业逻辑",
    emotion_tag: "深思",
    audience: "被量化收割的散户",
  },

  // === 避坑防雷类 ===
  {
    title: "炒股最简单实用的方法：避开这5个大坑",
    hook: "90%的散户亏钱不是因为技术差，而是因为踩了这5个坑：追涨杀跌、满仓梭哈、频繁交易、不设止损、听消息炒股。避开这些，你已经赢了一半。",
    topic_name: "避坑防雷类",
    group_name: "心态大坑",
    emotion_tag: "警醒",
    audience: "亏损中的散户",
  },
  {
    title: "当你买到涨停板，次日该走还是该留？",
    hook: "涨停板不是终点，而是起点。关键看三点：封板时间（早封强于晚封）、封板量（缩量强于放量）、板块效应（有跟风强于独苗）。掌握这三点，涨停板不再是赌博。",
    topic_name: "避坑防雷类",
    group_name: "制度规则坑",
    emotion_tag: "谨慎",
    audience: "打板玩家",
  },

  // === 工具/神技类 ===
  {
    title: "同花顺手机看盘技巧：99%的人不知道的功能",
    hook: "还在用电脑看盘？手机同花顺有3个隐藏功能：分时叠加对比、资金流向实时监控、板块轮动热力图。学会这些，随时随地掌握市场动态，再也不用盯盘到眼花。",
    topic_name: "工具/神技类",
    group_name: "看盘布局",
    emotion_tag: "实用",
    audience: "手机看盘族",
  },

  // === 顶级心法类 ===
  {
    title: "游资大佬的顶级心法：三年从4万到1亿",
    hook: "从4万到1亿，不是靠技术，而是靠心法。三条铁律：第一，只做确定性机会；第二，亏损时立刻止损；第三，盈利时让利润奔跑。听起来简单，做到的人凤毛麟角。",
    topic_name: "顶级心法类",
    group_name: "知行合一",
    emotion_tag: "敬畏",
    audience: "想稳定盈利的股民",
  },
];

async function cleanAndSeedTopics() {
  console.log("=== 步骤1: 删除所有假数据 ===");

  // 先查询现有的 sub_topics
  const { data: existingTopics, error: fetchError } = await supabase
    .from("sub_topics")
    .select("id, title");

  if (fetchError) {
    console.error("查询失败:", fetchError.message);
    return;
  }

  console.log(`找到 ${existingTopics?.length || 0} 条现有数据`);

  if (existingTopics && existingTopics.length > 0) {
    // 删除所有 sub_topic_claims（外键依赖）
    const { error: claimsDeleteError } = await supabase
      .from("sub_topic_claims")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // 删除所有

    if (claimsDeleteError) {
      console.error("删除 claims 失败:", claimsDeleteError.message);
    } else {
      console.log("已清理 sub_topic_claims");
    }

    // 删除所有 sub_topics
    const { error: deleteError } = await supabase
      .from("sub_topics")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // 删除所有

    if (deleteError) {
      console.error("删除失败:", deleteError.message);
      return;
    }

    console.log("已删除所有假数据");
  }

  console.log("\n=== 步骤2: 获取 topic 和 group 映射 ===");

  // 获取所有 topics
  const { data: topics, error: topicsError } = await supabase
    .from("topics")
    .select("id, name");

  if (topicsError || !topics) {
    console.error("获取 topics 失败:", topicsError?.message);
    return;
  }

  const topicMap = new Map(topics.map((t) => [t.name, t.id]));

  // 获取所有 topic_groups
  const { data: groups, error: groupsError } = await supabase
    .from("topic_groups")
    .select("id, name, topic_id");

  if (groupsError || !groups) {
    console.error("获取 groups 失败:", groupsError?.message);
    return;
  }

  // 创建 group 映射：topic_name -> group_name -> group_id
  const groupMap = new Map<string, Map<string, string>>();
  for (const group of groups) {
    const topic = topics.find((t) => t.id === group.topic_id);
    if (topic) {
      if (!groupMap.has(topic.name)) {
        groupMap.set(topic.name, new Map());
      }
      groupMap.get(topic.name)!.set(group.name, group.id);
    }
  }

  console.log("\n=== 步骤3: 插入15条真实选题 ===");

  let successCount = 0;
  for (const topic of REAL_TOPICS) {
    const topicId = topicMap.get(topic.topic_name);
    if (!topicId) {
      console.error(`找不到 topic: ${topic.topic_name}`);
      continue;
    }

    const groupId = groupMap.get(topic.topic_name)?.get(topic.group_name) || null;

    const { error: insertError } = await supabase
      .from("sub_topics")
      .insert({
        title: topic.title,
        hook: topic.hook,
        topic_id: topicId,
        group_id: groupId,
        emotion_tag: topic.emotion_tag,
        audience: topic.audience,
        source: "seed",
        created_by: ADMIN_USER_ID,
      });

    if (insertError) {
      console.error(`插入失败 [${topic.title}]:`, insertError.message);
    } else {
      console.log(`✓ ${topic.title}`);
      successCount++;
    }
  }

  console.log(`\n=== 完成: 成功插入 ${successCount}/${REAL_TOPICS.length} 条选题 ===`);
}

cleanAndSeedTopics().catch((error) => {
  console.error("脚本执行失败:", error instanceof Error ? error.message : error);
  process.exit(1);
});
