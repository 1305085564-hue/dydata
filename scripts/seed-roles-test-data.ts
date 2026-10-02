import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Local-only fixture for tests/roles.
 *
 * The fixture is deliberately keyed by its own IDs/names and resolves test
 * users by their local Auth emails. It must never be pointed at a production
 * Supabase project.
 */

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const FIXTURE_TEAM_ID = "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e01";
const WRITER_GROUP_ID = "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e02";
const TALENT_GROUP_ID = "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e03";
const OPERATOR_GROUP_ID = "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e04";
const MEMBER_ACCOUNT_ID = "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e10";
const LEADER_ACCOUNT_ID = "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e11";
const UNRATED_VIDEO_ID = "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e20";
const TOPIC_PARENT_ID = "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e30";
const TOPIC_ID = "60f6dad7-dbc1-47c3-aea8-beb3e9e08b8f";
const VIDEO_IDS = [
  "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e21",
  "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e22",
  "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e23",
  "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e24",
];
const CURRENT_VIDEO_ID = "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e25";
const REPORT_IDS = [
  "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e41",
  "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e42",
  "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e43",
  "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e44",
];
const CURRENT_REPORT_ID = "d4a6a9d1-6c7e-4df7-9f0d-0b6e2a2c7e45";
const FIXTURE_VIDEO_IDS = [...VIDEO_IDS, CURRENT_VIDEO_ID];
const FIXTURE_REPORT_IDS = [...REPORT_IDS, CURRENT_REPORT_ID];

type User = { id: string; email?: string };

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少 ${name}，角色门禁种子拒绝运行`);
  return value;
}

function assertLocalOnly() {
  const apiUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const dbUrl = required("SUPABASE_DB_URL");
  const apiHost = new URL(apiUrl).hostname;
  const dbHost = new URL(dbUrl).hostname;
  if (!LOCAL_HOSTS.has(apiHost) || !LOCAL_HOSTS.has(dbHost)) {
    throw new Error(`角色门禁种子只允许本地隔离库：api=${apiHost}, db=${dbHost}`);
  }
}

function client() {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findOrCreateUser(supabase: SupabaseClient, emailEnv: string, passwordEnv: string, name: string, role: "member" | "admin") {
  const email = required(emailEnv);
  const password = required(passwordEnv);
  for (let page = 1; page <= 10; page += 1) {
    const result = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    const found = result.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found as User;
    if (result.data.users.length < 1000) break;
  }
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role, company_role: role },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error(`创建 ${email} 失败`);
  return created.data.user as User;
}

async function assertOk<T extends { error: unknown }>(result: T, label: string) {
  if (result.error) throw new Error(`${label}：${(result.error as { message?: string }).message ?? String(result.error)}`);
  return result;
}

async function seed() {
  assertLocalOnly();
  const supabase = client();
  const member = await findOrCreateUser(supabase, "DYDATA_TEST_MEMBER_EMAIL", "DYDATA_TEST_MEMBER_PASSWORD", "测试组员", "member");
  const leader = await findOrCreateUser(supabase, "DYDATA_TEST_LEADER_EMAIL", "DYDATA_TEST_LEADER_PASSWORD", "测试组长", "admin");
  const owner = process.env.DYDATA_E2E_OWNER_EMAIL?.trim() && process.env.DYDATA_E2E_OWNER_PASSWORD
    ? await findOrCreateUser(supabase, "DYDATA_E2E_OWNER_EMAIL", "DYDATA_E2E_OWNER_PASSWORD", "本地测试所有者", "admin")
    : null;

  await assertOk(await supabase.from("teams").upsert({ id: FIXTURE_TEAM_ID, name: "gate:roles 隔离团队", is_demo: true }, { onConflict: "id" }), "写入隔离团队失败");
  const profileRows = [
    { id: member.id, name: "测试组员", role: "member", company_role: "member", team_id: FIXTURE_TEAM_ID, membership_status: "active", data_scope: "self", permissions: {} },
    { id: leader.id, name: "测试组长", role: "admin", company_role: "admin", team_id: FIXTURE_TEAM_ID, membership_status: "active", data_scope: "team", permissions: { manage_members: true, manage_fulfillment: true, review_content: true, view_analytics: true } },
  ];
  if (owner) profileRows.push({
    id: owner.id, name: "本地测试所有者", role: "owner", company_role: "company_owner", team_id: FIXTURE_TEAM_ID,
    membership_status: "active", data_scope: "all", permissions: { manage_members: true, manage_fulfillment: true, review_content: true, view_analytics: true },
  });
  await assertOk(await supabase.from("profiles").upsert(profileRows, { onConflict: "id" }), "写入本地测试成员失败");
  await assertOk(await supabase.from("work_groups").upsert([
    { id: WRITER_GROUP_ID, team_id: FIXTURE_TEAM_ID, name: "门禁文案组", kind: "writer", created_by: leader.id },
    { id: TALENT_GROUP_ID, team_id: FIXTURE_TEAM_ID, name: "门禁达人组", kind: "talent", created_by: leader.id },
    { id: OPERATOR_GROUP_ID, team_id: FIXTURE_TEAM_ID, name: "门禁运营组", kind: "operator", created_by: leader.id },
  ], { onConflict: "id" }), "写入工种小队失败");
  await assertOk(await supabase.from("profiles").update({ work_peer_group_id: WRITER_GROUP_ID, work_operator_group_id: OPERATOR_GROUP_ID }).eq("id", member.id), "分配组员工种小队失败");
  await assertOk(await supabase.from("profiles").update({ work_peer_group_id: TALENT_GROUP_ID, work_operator_group_id: OPERATOR_GROUP_ID }).eq("id", leader.id), "分配组长工种小队失败");

  await assertOk(await supabase.from("video_tags").delete().in("video_id", [...FIXTURE_VIDEO_IDS, UNRATED_VIDEO_ID]), "清理视频标签失败");
  await assertOk(await supabase.from("video_metrics_snapshots").delete().in("video_id", [...FIXTURE_VIDEO_IDS, UNRATED_VIDEO_ID]), "清理视频快照失败");
  await assertOk(await supabase.from("daily_reports").delete().in("id", FIXTURE_REPORT_IDS), "清理角色日报失败");
  await assertOk(await supabase.from("videos").delete().in("id", [...FIXTURE_VIDEO_IDS, UNRATED_VIDEO_ID]), "清理角色视频失败");
  await assertOk(await supabase.from("accounts").delete().in("id", [MEMBER_ACCOUNT_ID, LEADER_ACCOUNT_ID]), "清理角色账号失败");
  await assertOk(await supabase.from("sub_topics").delete().eq("id", TOPIC_ID), "清理角色子题失败");

  await assertOk(await supabase.from("accounts").insert([
    { id: MEMBER_ACCOUNT_ID, profile_id: member.id, name: "门禁测试账号·组员", content_direction: "复盘" },
    { id: LEADER_ACCOUNT_ID, profile_id: leader.id, name: "门禁测试账号·组长", content_direction: "复盘" },
  ]), "写入角色账号失败");
  await assertOk(await supabase.from("topics").upsert({ id: TOPIC_PARENT_ID, name: "门禁测试母题", sort_order: 9999 }, { onConflict: "id" }), "写入角色母题失败");
  await assertOk(await supabase.from("sub_topics").insert({
    id: TOPIC_ID, title: "门禁质量样本选题", hook: "门禁质量样本", topic_id: TOPIC_PARENT_ID,
    created_by: leader.id, source_type: "internal", library_status: "in_library",
  }), "写入角色子题失败");

  const videos = [
    { id: VIDEO_IDS[0], account_id: MEMBER_ACCOUNT_ID, user_id: member.id, video_title: "门禁增长样本一", content: "门禁测试作品一", published_at: "2026-09-10T02:00:00Z", uploaded_at: "2026-09-10T02:00:00Z", topic_id: null },
    { id: VIDEO_IDS[1], account_id: LEADER_ACCOUNT_ID, user_id: member.id, video_title: "门禁剪辑样本", content: "门禁测试作品二", published_at: "2026-09-15T02:00:00Z", uploaded_at: "2026-09-15T02:00:00Z", topic_id: null },
    { id: VIDEO_IDS[2], account_id: MEMBER_ACCOUNT_ID, user_id: member.id, video_title: "门禁质量样本", content: "门禁测试作品三", published_at: "2026-09-20T02:00:00Z", uploaded_at: "2026-09-20T02:00:00Z", topic_id: TOPIC_ID },
    { id: VIDEO_IDS[3], account_id: MEMBER_ACCOUNT_ID, user_id: member.id, video_title: "门禁增长样本四", content: "门禁测试作品四", published_at: "2026-10-01T02:00:00Z", uploaded_at: "2026-10-01T02:00:00Z", topic_id: null },
    { id: CURRENT_VIDEO_ID, account_id: LEADER_ACCOUNT_ID, user_id: member.id, video_title: "门禁当前月样本", content: "门禁当前月作品", published_at: "2026-10-02T03:00:00Z", uploaded_at: "2026-10-02T03:00:00Z", topic_id: null },
    { id: UNRATED_VIDEO_ID, account_id: MEMBER_ACCOUNT_ID, user_id: member.id, video_title: "门禁未评级样本", content: "门禁未评级内容", published_at: "2026-09-28T02:00:00Z", uploaded_at: "2026-09-28T02:00:00Z", topic_id: null },
  ].map((row) => ({ ...row, lifecycle_state: "active", anomaly_status: "正常", review_status: "pending" }));
  await assertOk(await supabase.from("videos").insert(videos), "写入角色视频失败");

  const reports = [
    { id: REPORT_IDS[0], account_id: MEMBER_ACCOUNT_ID, video_id: VIDEO_IDS[0], report_date: "2026-09-10", title: "门禁增长样本一", play_count: 18000 },
    { id: REPORT_IDS[1], account_id: LEADER_ACCOUNT_ID, video_id: VIDEO_IDS[1], report_date: "2026-09-15", title: "门禁剪辑样本", play_count: 12000 },
    { id: REPORT_IDS[2], account_id: MEMBER_ACCOUNT_ID, video_id: VIDEO_IDS[2], report_date: "2026-09-20", title: "门禁质量样本", play_count: 20000 },
    { id: REPORT_IDS[3], account_id: MEMBER_ACCOUNT_ID, video_id: VIDEO_IDS[3], report_date: "2026-10-01", title: "门禁增长样本四", play_count: 16000 },
    { id: CURRENT_REPORT_ID, account_id: LEADER_ACCOUNT_ID, video_id: CURRENT_VIDEO_ID, report_date: "2026-10-02", title: "门禁当前月样本", play_count: 15000 },
  ].map((row) => ({
    // Keep fixture reports owned by the local leader so the fulfillment spec's
    // cleanup (which targets its own member fixture IDs) cannot erase them.
    // The collaboration scope still exposes both users through FIXTURE_TEAM_ID.
    ...row, user_id: leader.id, submitter: "测试组长", content: row.title, is_void: false,
    script_author_user_id: member.id, video_editor_user_id: member.id, operator_user_id: leader.id,
    follower_gain: 200, likes: 500, comments: 300, shares: 70, favorites: 80,
    review_status: "confirmed", data_source: "ai", published_at: `${row.report_date}T02:00:00Z`,
  }));
  await assertOk(await supabase.from("daily_reports").insert(reports), "写入角色日报失败");

  const snapshots = FIXTURE_VIDEO_IDS.map((videoId, index) => ({
    video_id: videoId, snapshot_type: "24h", play_count: index === 1 ? 12000 : index === 2 ? 20000 : 18000,
    likes: index === 2 ? 500 : 500, comments: index === 2 ? 300 : 120, shares: index === 2 ? 70 : 30,
    favorites: index === 2 ? 0 : 40, follower_gain: 200,
    captured_at: new Date(Date.UTC(2026, 8, 11 + index * 5, 2)).toISOString(),
  }));
  await assertOk(await supabase.from("video_metrics_snapshots").insert(snapshots), "写入角色快照失败");
  await assertOk(await supabase.from("video_tags").insert(FIXTURE_VIDEO_IDS.map((videoId) => ({ video_id: videoId, tag_dimension: "话题", tag_value: "复盘", source: "manual", confidence: 1 }))), "写入角色话题标签失败");

  console.log(`gate:roles fixture ready: member=${member.id}, leader=${leader.id}, reports=${FIXTURE_REPORT_IDS.length}, videos=${videos.length}`);
}

seed().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
