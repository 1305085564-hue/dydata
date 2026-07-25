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

const MEMBER_ID = "7195257f-6e3a-4ece-93cc-208bac4d4ab2";
const LEADER_ID = "71025a91-b33b-46bc-a04f-69cc06db7491";

async function fixTestProfiles() {
  console.log("=== 修复测试账号 Profile ===\n");

  // 修复组员 profile
  console.log("1. 修复组员 profile...");
  const { data: memberData, error: memberError } = await supabase
    .from("profiles")
    .upsert({
      id: MEMBER_ID,
      name: "测试组员",
      role: "member"
    }, { onConflict: "id" })
    .select();

  if (memberError) {
    console.error("  ✗ 失败:", memberError.message);
  } else {
    console.log("  ✓ 成功:", memberData);
  }

  // 修复组长 profile
  console.log("\n2. 修复组长 profile...");
  const { data: leaderData, error: leaderError } = await supabase
    .from("profiles")
    .upsert({
      id: LEADER_ID,
      name: "测试组长",
      role: "member"  // 只能用 member，因为 role 有约束
    }, { onConflict: "id" })
    .select();

  if (leaderError) {
    console.error("  ✗ 失败:", leaderError.message);
  } else {
    console.log("  ✓ 成功:", leaderData);
  }

  // 验证
  console.log("\n=== 验证测试账号 ===");
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, role")
    .in("id", [MEMBER_ID, LEADER_ID]);

  console.log(profiles);
}

fixTestProfiles().catch(console.error);
