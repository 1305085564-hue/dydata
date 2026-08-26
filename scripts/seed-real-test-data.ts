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

// 真实用户 ID
const USERS = {
  achan: "a689874f-12f1-43e1-8e20-87e2195fe041",     // 阿禅（管理员）
  chenchen: "77b15a76-9702-40a1-b5c7-bdf8b2a23af3",  // 陈晨
  yeyan: "629b5ad5-b1e2-495c-a5d8-b72e07da4558",     // 叶颜
  zhangchao: "f398e7e5-d8be-4db8-a0e0-7b41d9e270c1", // 张超
  testMember: "7195257f-6e3a-4ece-93cc-208bac4d4ab2", // 测试组员
  testLeader: "71025a91-b33b-46bc-a04f-69cc06db7491", // 测试组长
};

// 真实视频 ID（从数据库查询得到）
const VIDEOS = {
  longtou: "b183818b-8b61-514b-a2dd-0d8fb30fe71d",    // 6.16前瞻，科技主线
  fudao: "c86638b5-7d46-5036-8987-7c903f4c6c00",      // 6.30盘面前瞻
  qingxu: "957b4f74-b77e-5043-a7d7-a5fd7a5b5be0",     // 6.29盘面前瞻
  kongpan: "7517b6dc-4734-5e3c-8e69-4f21fb02cd83",     // 6.18盘面前瞻
  xinfa: "ceda3d84-79b3-540f-9908-5c09cd08c9d4",      // 6.17盘面前瞻
  pankou: "31e52e46-6377-5430-bff8-a7682c3e94e2",      // 6.22盘面前瞻
};

async function seedRealTestData() {
  console.log("=== 清理旧的测试数据 ===\n");

  // 清理之前的认领数据
  const { error: deleteClaimsError } = await supabase
    .from("sub_topic_claims")
    .delete()
    .in("user_id", [USERS.testMember, USERS.testLeader, USERS.chenchen, USERS.yeyan, USERS.zhangchao]);

  if (deleteClaimsError) {
    console.log("清理旧认领数据:", deleteClaimsError.message);
  } else {
    console.log("✓ 已清理旧认领数据");
  }

  // 清除视频关联
  const { error: clearVideoLinkError } = await supabase
    .from("videos")
    .update({ topic_id: null })
    .not("topic_id", "is", null);

  if (clearVideoLinkError) {
    console.log("清理视频关联:", clearVideoLinkError.message);
  } else {
    console.log("✓ 已清理视频关联");
  }

  console.log("\n=== 获取选题列表 ===\n");

  const { data: subTopics, error: fetchError } = await supabase
    .from("sub_topics")
    .select("id, title, topic_id")
    .order("created_at", { ascending: false });

  if (fetchError || !subTopics) {
    console.error("获取选题失败:", fetchError?.message);
    return;
  }

  console.log(`找到 ${subTopics.length} 条选题\n`);

  // 选取6个选题用于测试不同场景
  const testTopics = subTopics.slice(0, 6);

  console.log("=== 创建真实认领数据（模拟撞车）===\n");

  // 场景1: 选题1 - 3人撞车（陈晨scripting + 叶颜candidate + 张超candidate）
  console.log(`选题1: ${testTopics[0].title}`);
  await createClaim(testTopics[0].id, USERS.chenchen, "scripting");
  await createClaim(testTopics[0].id, USERS.yeyan, "candidate");
  await createClaim(testTopics[0].id, USERS.zhangchao, "candidate");

  // 场景2: 选题2 - 2人撞车（阿禅scripting + 测试组员candidate）
  console.log(`\n选题2: ${testTopics[1].title}`);
  await createClaim(testTopics[1].id, USERS.achan, "scripting");
  await createClaim(testTopics[1].id, USERS.testMember, "candidate");

  // 场景3: 选题3 - 1人认领（陈晨candidate）
  console.log(`\n选题3: ${testTopics[2].title}`);
  await createClaim(testTopics[2].id, USERS.chenchen, "candidate");

  // 场景4: 选题4 - 1人认领脚本中（叶颜scripting）
  console.log(`\n选题4: ${testTopics[3].title}`);
  await createClaim(testTopics[3].id, USERS.yeyan, "scripting");

  // 场景5: 选题5 - 测试组长认领
  console.log(`\n选题5: ${testTopics[4].title}`);
  await createClaim(testTopics[4].id, USERS.testLeader, "candidate");

  // 场景6: 选题6 - 无认领（测试空状态）

  console.log("\n=== 关联真实视频 ===\n");

  // 为选题关联视频（每个选题关联1-2个视频）
  const videoLinks = [
    { topicId: testTopics[0].id, videoId: VIDEOS.longtou, title: "6.16前瞻，科技主线" },
    { topicId: testTopics[1].id, videoId: VIDEOS.fudao, title: "6.30盘面前瞻" },
    { topicId: testTopics[2].id, videoId: VIDEOS.qingxu, title: "6.29盘面前瞻" },
    { topicId: testTopics[3].id, videoId: VIDEOS.kongpan, title: "6.18盘面前瞻" },
    { topicId: testTopics[0].id, videoId: VIDEOS.xinfa, title: "6.17盘面前瞻" },  // 选题1关联第2个视频
  ];

  for (const link of videoLinks) {
    const { error } = await supabase
      .from("videos")
      .update({ topic_id: link.topicId })
      .eq("id", link.videoId);

    if (error) {
      console.log(`✗ 关联失败「${link.title}」: ${error.message}`);
    } else {
      console.log(`✓ 关联「${link.title}」→ 选题`);
    }
  }

  console.log("\n=== 测试数据创建完成 ===\n");
  printTestScenarios(testTopics);
}

async function createClaim(subTopicId: string, userId: string, status: string) {
  const { error } = await supabase
    .from("sub_topic_claims")
    .insert({
      sub_topic_id: subTopicId,
      user_id: userId,
      status: status
    });

  const userName = Object.entries(USERS).find(([_, id]) => id === userId)?.[0] || userId.slice(0, 8);
  if (error) {
    console.log(`  ✗ ${userName}(${status}): ${error.message}`);
  } else {
    console.log(`  ✓ ${userName} 已认领 (${status})`);
  }
}

function printTestScenarios(topics: { title: string }[]) {
  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log("│                    功能测试场景清单                              │");
  console.log("├─────────────────────────────────────────────────────────────────┤");
  console.log("│ 场景1: 3人撞车                                                │");
  console.log(`│ 选题: ${topics[0].title.slice(0, 25)}...`);
  console.log("│ 认领人: 陈晨(scripting) + 叶颜(candidate) + 张超(candidate)   │");
  console.log("│ 关联视频: 2个                                                  │");
  console.log("│ 测试点: 撞车动态、多人认领展示                                │");
  console.log("├─────────────────────────────────────────────────────────────────┤");
  console.log("│ 场景2: 管理员与组员撞车                                        │");
  console.log(`│ 选题: ${topics[1].title.slice(0, 25)}...`);
  console.log("│ 认领人: 阿禅(scripting) + 测试组员(candidate)                  │");
  console.log("│ 关联视频: 1个                                                  │");
  console.log("│ 测试点: 管理员权限、撞车提示                                  │");
  console.log("├─────────────────────────────────────────────────────────────────┤");
  console.log("│ 场景3: 单人认领                                                │");
  console.log(`│ 选题: ${topics[2].title.slice(0, 25)}...`);
  console.log("│ 认领人: 陈晨(candidate)                                        │");
  console.log("│ 关联视频: 1个                                                  │");
  console.log("│ 测试点: 认领状态展示、放回功能                                │");
  console.log("├─────────────────────────────────────────────────────────────────┤");
  console.log("│ 场景4: 脚本写作中                                              │");
  console.log(`│ 选题: ${topics[3].title.slice(0, 25)}...`);
  console.log("│ 认领人: 叶颜(scripting)                                        │");
  console.log("│ 关联视频: 1个                                                  │");
  console.log("│ 测试点: 状态流转、推进功能                                    │");
  console.log("├─────────────────────────────────────────────────────────────────┤");
  console.log("│ 场景5: 测试账号认领                                            │");
  console.log(`│ 选题: ${topics[4].title.slice(0, 25)}...`);
  console.log("│ 认领人: 测试组长(candidate)                                    │");
  console.log("│ 关联视频: 0个                                                  │");
  console.log("│ 测试点: 测试账号功能、空作品状态                              │");
  console.log("├─────────────────────────────────────────────────────────────────┤");
  console.log("│ 场景6: 无认领选题                                              │");
  console.log(`│ 选题: ${topics[5].title.slice(0, 25)}...`);
  console.log("│ 认领人: 无                                                      │");
  console.log("│ 关联视频: 0个                                                  │");
  console.log("│ 测试点: 认领按钮、空撞车状态                                  │");
  console.log("└─────────────────────────────────────────────────────────────────┘");
  console.log("\n测试账号:");
  console.log("  组员: test-member@dydata.test / Test123456!");
  console.log("  组长: test-leader@dydata.test / Test123456!");
}

seedRealTestData().catch(console.error);
