/**
 * Seed script: 灌入模拟数据用于本地验证
 *
 * 用法：
 *   npx tsx supabase/seed.ts
 *
 * 需要环境变量：
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (注意：用 service role key，不是 anon key)
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const TITLES = [
  "今日复盘：大盘震荡下的机会",
  "龙头股分析：谁在领涨",
  "板块轮动解读",
  "短线交易心得分享",
  "情绪周期判断方法",
  "涨停板复盘精华",
  "尾盘异动个股追踪",
  "主力资金流向分析",
  "技术面与基本面结合",
  "市场情绪温度计",
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dateStr(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().split("T")[0];
}

async function seed() {
  console.log("Seeding mock data...\n");

  // 1. Check existing profiles
  const { data: existingProfiles } = await supabase.from("profiles").select("id, name");
  const profileIds = (existingProfiles ?? []).map((p) => p.id);

  if (profileIds.length === 0) {
    console.log("No profiles found. Please register some users first, then run this script.");
    console.log("The script will generate daily_reports for existing profiles.\n");
    process.exit(0);
  }

  console.log(`Found ${profileIds.length} profiles: ${(existingProfiles ?? []).map((p) => p.name).join(", ")}\n`);

  // 2. Generate 14 days of daily reports for each profile
  const reports: Array<{
    user_id: string;
    report_date: string;
    title: string;
    submitter: string;
    play_count: number;
    completion_rate: string;
    avg_play_duration: string;
    bounce_rate_2s: string;
    completion_rate_5s: string;
    likes: number;
    comments: number;
    shares: number;
    favorites: number;
  }> = [];

  for (const profile of existingProfiles ?? []) {
    for (let daysAgo = 1; daysAgo <= 14; daysAgo++) {
      // 80% chance of submitting on any given day
      if (Math.random() > 0.8) continue;

      const playCount = randomInt(5000, 500000);
      reports.push({
        user_id: profile.id,
        report_date: dateStr(daysAgo),
        title: TITLES[randomInt(0, TITLES.length - 1)],
        submitter: profile.name,
        play_count: playCount,
        completion_rate: `${randomInt(15, 65)}%`,
        avg_play_duration: `${randomInt(3, 25)}s`,
        bounce_rate_2s: `${randomInt(20, 60)}%`,
        completion_rate_5s: `${randomInt(10, 50)}%`,
        likes: randomInt(10, 2000),
        comments: randomInt(0, 300),
        shares: randomInt(0, 500),
        favorites: randomInt(0, 200),
      });
    }
  }

  console.log(`Inserting ${reports.length} daily reports...`);

  // Upsert to avoid conflicts
  const { error } = await supabase
    .from("daily_reports")
    .upsert(reports, { onConflict: "user_id,report_date" });

  if (error) {
    console.error("Error inserting reports:", error.message);
    process.exit(1);
  }

  console.log("Done! Mock data inserted successfully.");
  console.log(`\nSummary:`);
  console.log(`  - ${profileIds.length} users`);
  console.log(`  - ${reports.length} daily reports (14 days, ~80% fill rate)`);
}

seed().catch(console.error);
