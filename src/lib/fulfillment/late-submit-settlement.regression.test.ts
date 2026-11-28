import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { resolveVideoSubmitDeadline } from "../video-submit-deadline";
import { buildContentQualityRecord, type ContentQualitySnapshot } from "../content-quality";
import { buildStaff } from "../collaboration/domain/role-metrics";
import { buildPersonWriterQuality } from "../collaboration/domain/quality-rules";
import type { CollaborationReport, VideoSnapshotMetrics } from "../collaboration/domain/types";
import { validateVideoSubmitPayload } from "@/app/api/video-submit/validation";
import { createPostSubmitReviewAndNotify } from "@/app/api/video-submit/post-review";

const ACTOR = "123e4567-e89b-42d3-a456-426614174001";
const MEMBER = "223e4567-e89b-42d3-a456-426614174002";
const VIDEO = "323e4567-e89b-42d3-a456-426614174003";
const REPORT = "423e4567-e89b-42d3-a456-426614174004";
const APPEAL = "523e4567-e89b-42d3-a456-426614174005";
const ACCOUNT = "623e4567-e89b-42d3-a456-426614174006";
let db: PGlite;

// 实际执行完整生产迁移，断言数据库结果；不截取函数、不匹配 SQL/源码文字。
// 仅最小化前置表结构与身份边界，审批/重开/双表状态同步逻辑全部来自生产 SQL。
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table profiles (id uuid primary key, role text, company_role text, membership_status text);
    create function active_visible_user_ids(uuid) returns table(user_id uuid)
      language sql as $$ select id from profiles where role = 'member' $$;
    create table videos (id uuid primary key);
    create table daily_reports (id uuid primary key, video_id uuid, is_void boolean default false);
    create table fulfillment_appeals (
      id uuid primary key, user_id uuid, account_id uuid, record_date date, reason text,
      status text default 'pending', handler_id uuid, handled_at timestamptz, decision_reason text,
      submission_payload jsonb
    );
    create table audit_logs (user_id uuid, action text, target text, detail text);
  `);
  await db.exec(readFileSync(new URL("../../../supabase/migrations/20261127100000_late_submit_post_review.sql", import.meta.url), "utf8"));
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("truncate fulfillment_appeals, daily_reports, videos, profiles, audit_logs cascade");
  await db.query("insert into profiles values ($1, 'admin', 'admin', 'active'), ($2, 'member', 'member', 'active')", [ACTOR, MEMBER]);
  await db.query("insert into videos (id) values ($1)", [VIDEO]);
  await db.query("insert into daily_reports (id, video_id) values ($1, $2)", [REPORT, VIDEO]);
  await db.query(`insert into fulfillment_appeals
    (id,user_id,account_id,record_date,review_mode,video_id,daily_report_id)
    values ($1,$2,$3,'2026-11-20','post_submit',$4,$5)`, [APPEAL, MEMBER, ACCOUNT, VIDEO, REPORT]);
});

async function handle(decision: string, reason: string | null = null) {
  const result = await db.query<{ result: Record<string, unknown> }>(
    "select handle_fulfillment_appeal($1::uuid,$2::text,$3::uuid,$4::text) as result", [APPEAL, decision, ACTOR, reason]);
  return result.rows[0].result;
}
async function reopen() {
  return db.query("select reopen_fulfillment_appeal_atomically($1::uuid,$2::uuid)", [APPEAL, ACTOR]);
}
async function storedFlags() {
  const result = await db.query<{ source: string; excluded: boolean; reason: string | null }>(`
    select 'video' as source, settlement_excluded as excluded, settlement_excluded_reason as reason from videos
    union all select 'report', settlement_excluded, settlement_excluded_reason from daily_reports
    order by source`);
  return result.rows;
}

for (const [uploadedAt, decision, hours] of [
  ["2026-11-23T07:59:59.999Z", "allow", 71.99999972222223],
  ["2026-11-23T08:00:00.000Z", "allow", 72],
  ["2026-11-23T08:00:00.001Z", "post_review", 72.00000027777777],
] as const) {
  test(`72小时边界 ${uploadedAt} → ${decision}`, () => {
    const result = resolveVideoSubmitDeadline({
      mode: "create", publishedAt: "2026-11-20T08:00:00.000Z", uploadedAt,
      businessDate: "2026-11-20", publishedAtConfirmed: true, publishedAtSource: "ocr",
    });
    assert.equal(result.decision, decision);
    assert.equal(result.reason, decision === "allow" ? "within_window" : "expired");
    assert.ok(Math.abs(result.elapsedHours! - hours) < 0.000000001);
    assert.equal(result.publishedDate, "2026-11-20");
  });
}

test("跨月但未超72小时仍正常提交，不能额外卡审批", () => {
  assert.equal(resolveVideoSubmitDeadline({
    mode: "create", publishedAt: "2026-10-31T08:00:00.000Z", uploadedAt: "2026-11-01T08:00:00.000Z",
    businessDate: "2026-10-31", publishedAtConfirmed: true, publishedAtSource: "ocr",
  }).decision, "allow");
});

test("确认正常后，视频和日报同时恢复计优并清除原因", async () => {
  await db.exec("update videos set settlement_excluded=true, settlement_excluded_reason='旧原因'; update daily_reports set settlement_excluded=true, settlement_excluded_reason='旧原因'");
  assert.equal((await handle("approve")).status, "approved");
  assert.deepEqual(await storedFlags(), [
    { source: "report", excluded: false, reason: null }, { source: "video", excluded: false, reason: null },
  ]);
});

test("判无效同时排除视频和日报，重开后对称恢复计优，作品数据保留", async () => {
  assert.equal((await handle("reject", "发布时间无法核实")).settlement_excluded, true);
  assert.deepEqual(await storedFlags(), [
    { source: "report", excluded: true, reason: "发布时间无法核实" },
    { source: "video", excluded: true, reason: "发布时间无法核实" },
  ]);
  await reopen();
  assert.deepEqual(await storedFlags(), [
    { source: "report", excluded: false, reason: null }, { source: "video", excluded: false, reason: null },
  ]);
  const audit = await db.query<{ action: string }>("select action from audit_logs order by action");
  assert.deepEqual(audit.rows.map((row) => row.action), ["handle_fulfillment_appeal", "reopen_fulfillment_appeal"]);
  assert.equal((await handle("approve")).status, "approved");
});

test("已确认正常的核查单重开不会误标为不计优", async () => {
  await handle("approve");
  await reopen();
  assert.deepEqual(await storedFlags(), [
    { source: "report", excluded: false, reason: null }, { source: "video", excluded: false, reason: null },
  ]);
});

test("判无效必须填原因，失败时不改变申请和双表结算状态", async () => {
  await assert.rejects(handle("reject"), /reason required/);
  assert.equal((await db.query<{ status: string }>("select status from fulfillment_appeals")).rows[0].status, "pending");
  assert.deepEqual(await storedFlags(), [
    { source: "report", excluded: false, reason: null }, { source: "video", excluded: false, reason: null },
  ]);
});

test("双表同步中日报写入失败时整个审批回滚，不留半结算状态", async () => {
  await db.exec(`create function fail_report_write() returns trigger language plpgsql as $$
    begin raise exception 'synthetic report write failure'; end $$;
    create trigger fail_report_write before update on daily_reports for each row execute function fail_report_write()`);
  try {
    await assert.rejects(handle("reject", "核查不符"), /synthetic report write failure/);
    assert.deepEqual(await storedFlags(), [
      { source: "report", excluded: false, reason: null }, { source: "video", excluded: false, reason: null },
    ]);
    assert.equal((await db.query<{ status: string }>("select status from fulfillment_appeals")).rows[0].status, "pending");
    assert.equal((await db.query("select * from audit_logs")).rows.length, 0);
  } finally {
    await db.exec("drop trigger fail_report_write on daily_reports; drop function fail_report_write()");
  }
});

const snapshot: ContentQualitySnapshot = {
  playCount: 20000, likes: 700, comments: 100, shares: 100, favorites: 200,
  avgPlayDuration: 55, avgPlayRatio: 0.3, bounceRate2s: 20, completionRate5s: 65, completionRate: 14,
};
const topics = { state: "ready" as const, tags: new Map([[VIDEO, "干货"]]) };
const accounts = [{ id: ACCOUNT, name: "测试账号", profile_id: MEMBER }];

for (const excluded of [false, true]) {
  test(`协作优条数、个人评级与复盘输出一致处理 settlement_excluded=${excluded}`, () => {
    const row: CollaborationReport = {
      id: REPORT, user_id: MEMBER, account_id: ACCOUNT, report_date: "2026-11-20",
      video_id: VIDEO, title: "合成优秀作品", play_count: 20000, follower_convert: 10,
      script_author_user_id: MEMBER, video_editor_user_id: null, operator_user_id: null,
      settlement_excluded: excluded, settlement_excluded_reason: excluded ? "核查不符" : null,
    };
    const snapshots = new Map<string, VideoSnapshotMetrics>([[VIDEO, { ...snapshot, videoId: VIDEO, followerGain: 80 }]]);
    const [staff] = buildStaff([row], "writer", [{ id: MEMBER, name: "文案", team_id: "team" }],
      accounts, [{ userId: MEMBER, certified: true, certifiedByName: "负责人" }], snapshots, topics);
    const personal = buildPersonWriterQuality({ targetUserId: MEMBER, role: "writers",
      currentRows: [row], growthRows: [row], accounts, snapshots, topics });
    const review = buildContentQualityRecord([VIDEO], new Map([[VIDEO, snapshot]]), topics, undefined,
      new Map([[VIDEO, { excluded, reason: row.settlement_excluded_reason }]]));
    assert.equal(staff.reportCount, 1);
    assert.equal(staff.writerQuality?.summary?.overallGradeCounts.excellent, 1);
    assert.equal(personal.monthSummary?.overallGradeCounts.excellent, 1);
    assert.equal(staff.writerQuality?.summary?.settlementEligibleExcellentCount, excluded ? 0 : 1);
    assert.equal(personal.monthSummary?.settlementEligibleExcellentCount, excluded ? 0 : 1);
    assert.equal(personal.monthWorks[0].contentQuality?.overallGrade, "优");
    assert.deepEqual(personal.monthWorks[0].contentQuality, review[VIDEO]);
    assert.equal(review[VIDEO].settlementExcluded === true, excluded);
    if (excluded) assert.equal(review[VIDEO].settlementExcludedReason, "核查不符");
  });
}

// 现行口径：超72小时先交后核待核查期间默认仍计优（false），仅管理员驳回判无效后标记不计优（true）。
async function createLateReview() {
  await db.exec("delete from fulfillment_appeals");
  const validated = validateVideoSubmitPayload({
    mode: "create", account_id: ACCOUNT, biz_date: "2026-11-20", anomaly_status: "abnormal",
    video_title: "超期测试", content: "文案", published_at: "2026-11-20T08:00:00.000Z", assets: [],
    metrics: { play_count: 100, likes: 2, comments: 1, shares: 1, favorites: 1, follower_gain: 0,
      follower_loss: 0, follower_convert: 0, avg_play_duration: 10, bounce_rate_2s: 20,
      completion_rate_5s: 30, completion_rate: 40 },
  });
  assert.ok(validated.ok);
  let inserted: Record<string, unknown> = {};
  const admin = {
    from(table: string) {
      assert.equal(table, "fulfillment_appeals");
      return { insert(row: Record<string, unknown>) {
        inserted = row;
        return { select: () => ({ single: async () => {
          await db.query(`insert into fulfillment_appeals
            (id,user_id,account_id,record_date,review_mode,video_id,daily_report_id)
            values ($1,$2,$3,$4,$5,$6,$7)`, [APPEAL, row.user_id, row.account_id, row.record_date, row.review_mode, row.video_id, row.daily_report_id]);
          return { data: { id: APPEAL }, error: null };
        } }) };
      } };
    },
  };
  const result = await createPostSubmitReviewAndNotify({
    admin: admin as never, userId: MEMBER, submitter: "合成成员", teamId: null,
    accountId: ACCOUNT, accountName: "测试账号", recordDate: "2026-11-20", videoId: VIDEO,
    dailyReportId: REPORT, nowIso: "2026-11-24T08:00:00.000Z", normalized: validated.normalized,
    trigger: { reason: "expired", publishedDate: "2026-11-20", elapsedHours: 96, ocrPublishedAtText: null },
  }, async () => ({ ok: true, inserted: 0 }));
  assert.equal(result.status, "partial");
  assert.equal(result.todoStatus, "failed");
  assert.equal(inserted.review_mode, "post_submit");
  return result;
}

test("超期作品已入库后，实际入口创建事后核查单并关联原作品和日报", async () => {
  const result = await createLateReview();
  assert.equal(result.appealId, APPEAL);
  const rows = await db.query<{ video_id: string; daily_report_id: string; status: string }>(
    "select video_id,daily_report_id,status from fulfillment_appeals");
  assert.deepEqual(rows.rows, [{ video_id: VIDEO, daily_report_id: REPORT, status: "pending" }]);
});

test("超72小时先入库待核查期间默认仍计优结算，仅驳回判无效后才标记不计优", async () => {
  await createLateReview();
  assert.deepEqual((await storedFlags()).map((row) => row.excluded), [false, false]);
});
