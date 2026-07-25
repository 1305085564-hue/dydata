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

async function createTestUsers() {
  console.log("=== 创建测试账号 ===\n");

  // 创建组员账号
  console.log("1. 创建组员账号...");
  const { data: member, error: memberError } = await supabase.auth.admin.createUser({
    email: "test-member@dydata.test",
    password: "Test123456!",
    email_confirm: true,
    user_metadata: {
      name: "测试组员",
      role: "member"
    }
  });

  if (memberError) {
    console.error("创建组员失败:", memberError.message);
  } else {
    console.log("✓ 组员创建成功");
    console.log("  ID:", member.user.id);
    console.log("  邮箱: test-member@dydata.test");
    console.log("  密码: Test123456!");

    // 创建 profile
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: member.user.id,
        name: "测试组员",
        role: "member"
      });

    if (profileError) {
      console.log("  Profile 创建/更新:", profileError.message);
    } else {
      console.log("  ✓ Profile 已创建");
    }
  }

  console.log("");

  // 创建组长账号
  console.log("2. 创建组长账号...");
  const { data: leader, error: leaderError } = await supabase.auth.admin.createUser({
    email: "test-leader@dydata.test",
    password: "Test123456!",
    email_confirm: true,
    user_metadata: {
      name: "测试组长",
      role: "leader"
    }
  });

  if (leaderError) {
    console.error("创建组长失败:", leaderError.message);
  } else {
    console.log("✓ 组长创建成功");
    console.log("  ID:", leader.user.id);
    console.log("  邮箱: test-leader@dydata.test");
    console.log("  密码: Test123456!");

    // 创建 profile
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: leader.user.id,
        name: "测试组长",
        role: "leader"
      });

    if (profileError) {
      console.log("  Profile 创建/更新:", profileError.message);
    } else {
      console.log("  ✓ Profile 已创建");
    }
  }

  console.log("\n=== 测试账号信息 ===");
  console.log("组员: test-member@dydata.test / Test123456!");
  console.log("组长: test-leader@dydata.test / Test123456!");
}

createTestUsers().catch(console.error);
