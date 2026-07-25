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

// 测试用户 ID
const TEST_MEMBER_ID = "7195257f-6e3a-4ece-93cc-208bac4d4ab2";
const TEST_LEADER_ID = "71025a91-b33b-46bc-a04f-69cc06db7491";
const ADMIN_ID = "a689874f-12f1-43e1-8e20-87e2195fe041";

async function seedTestClaims() {
  console.log("=== 创建测试认领数据 ===\n");

  // 获取所有选题
  const { data: subTopics, error: fetchError } = await supabase
    .from("sub_topics")
    .select("id, title")
    .order("created_at", { ascending: false });

  if (fetchError || !subTopics) {
    console.error("获取选题失败:", fetchError?.message);
    return;
  }

  console.log(`找到 ${subTopics.length} 条选题\n`);

  // 为前5个选题添加认领记录，模拟撞车
  const topicsToClaim = subTopics.slice(0, 5);

  for (let i = 0; i < topicsToClaim.length; i++) {
    const topic = topicsToClaim[i];
    console.log(`处理选题: ${topic.title}`);

    // 组员认领（candidate 状态）
    if (i < 3) {
      const { error: claimError } = await supabase
        .from("sub_topic_claims")
        .insert({
          sub_topic_id: topic.id,
          user_id: TEST_MEMBER_ID,
          status: "candidate"
        });

      if (claimError) {
        console.log(`  ✗ 组员认领失败: ${claimError.message}`);
      } else {
        console.log("  ✓ 组员已认领 (candidate)");
      }
    }

    // 组长也认领同一个选题（模拟撞车）
    if (i < 2) {
      const { error: claimError } = await supabase
        .from("sub_topic_claims")
        .insert({
          sub_topic_id: topic.id,
          user_id: TEST_LEADER_ID,
          status: i === 0 ? "scripting" : "candidate"
        });

      if (claimError) {
        console.log(`  ✗ 组长认领失败: ${claimError.message}`);
      } else {
        console.log(`  ✓ 组长已认领 (${i === 0 ? "scripting" : "candidate"})`);
      }
    }

    // 管理员认领第5个选题
    if (i === 4) {
      const { error: claimError } = await supabase
        .from("sub_topic_claims")
        .insert({
          sub_topic_id: topic.id,
          user_id: ADMIN_ID,
          status: "candidate"
        });

      if (claimError) {
        console.log(`  ✗ 管理员认领失败: ${claimError.message}`);
      } else {
        console.log("  ✓ 管理员已认领 (candidate)");
      }
    }

    console.log("");
  }

  // 获取一些视频用于关联
  console.log("=== 创建关联作品数据 ===\n");

  const { data: videos } = await supabase
    .from("videos")
    .select("id, video_title")
    .not("video_title", "is", null)
    .limit(5);

  if (videos && videos.length > 0) {
    // 为前3个选题关联视频
    for (let i = 0; i < Math.min(3, topicsToClaim.length); i++) {
      const topic = topicsToClaim[i];
      const video = videos[i % videos.length];

      console.log(`关联选题「${topic.title}」→ 视频「${video.video_title}」`);

      const { error: linkError } = await supabase
        .from("videos")
        .update({ topic_id: topic.id })
        .eq("id", video.id);

      if (linkError) {
        console.log(`  ✗ 关联失败: ${linkError.message}`);
      } else {
        console.log("  ✓ 已关联");
      }
    }
  }

  console.log("\n=== 测试数据创建完成 ===");
  console.log("\n撞车情况：");
  console.log("- 选题1: 组员(candidate) + 组长(scripting) = 2人撞车");
  console.log("- 选题2: 组员(candidate) + 组长(candidate) = 2人撞车");
  console.log("- 选题3: 组员(candidate) = 1人认领");
  console.log("- 选题4: 无认领");
  console.log("- 选题5: 管理员(candidate) = 1人认领");
}

seedTestClaims().catch(console.error);
