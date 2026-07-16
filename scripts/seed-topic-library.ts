import { createClient } from "@supabase/supabase-js";

const TOPICS = [
  { name: "暴力战法类", groups: ["图形战法", "分时盘口", "模式战法", "龙头选股", "打板连板", "止盈止损"] },
  { name: "热点/新闻解读类", groups: ["公告选秀", "突发推演", "小作文鉴定", "政策精读", "热点二阶思维"] },
  { name: "情绪周期类", groups: ["周期入门", "每日体温计", "各阶段打法", "主线轮动", "空仓艺术"] },
  { name: "案例拆解/复盘类", groups: ["妖股成龙史", "单次战役", "实盘日记", "龙虎榜复盘", "历史行情"] },
  { name: "避坑防雷类", groups: ["骗局黑产", "ST财务雷", "制度规则坑", "心态大坑"] },
  { name: "降维认知类", groups: ["主力思维", "资金生态", "宏观翻译", "产业逻辑", "制度视角", "揭秘类"] },
  { name: "顶级心法类", groups: ["人性弱点", "知行合一", "交易孤独", "盈亏哲学"] },
  { name: "工具/神技类", groups: ["看盘布局", "条件选股", "数据资讯源", "盘口预警", "复盘工具流"] },
];

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

async function seedTopicLibrary() {
  for (const [topicIndex, topic] of TOPICS.entries()) {
    const { data: topicRow, error: topicError } = await supabase
      .from("topics")
      .upsert({ name: topic.name, sort_order: (topicIndex + 1) * 10 }, { onConflict: "name" })
      .select("id")
      .single();

    if (topicError || !topicRow) {
      throw new Error(topicError?.message ?? `Failed to seed topic ${topic.name}`);
    }

    const groups = topic.groups.map((name, groupIndex) => ({
      topic_id: topicRow.id,
      name,
      sort_order: (groupIndex + 1) * 10,
    }));

    const { error: groupError } = await supabase
      .from("topic_groups")
      .upsert(groups, { onConflict: "topic_id,name" });

    if (groupError) {
      throw new Error(groupError.message);
    }
  }

  console.log(`Seeded ${TOPICS.length} topics and ${TOPICS.reduce((sum, topic) => sum + topic.groups.length, 0)} groups.`);
}

seedTopicLibrary().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
