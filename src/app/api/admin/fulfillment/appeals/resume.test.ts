import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, after } from "node:test";
import { NextRequest } from "next/server";
import { PGlite } from "@electric-sql/pglite";
import { abnormalSubmission, memoryDatabase, submissionDatabase } from "@/lib/testing/maintenance.test.fixture";
import { defaultVideoSubmitDeps } from "@/app/api/video-submit/route-core";
import { buildFulfillmentAppealsGetResponse, buildFulfillmentAppealsPostResponse } from "./route";
import { handleResumeFulfillmentAppealPost } from "./resume/route";
import { resumeAppealSubmission } from "../appeal/_resume-submission";
import { buildHandleFulfillmentAppealResponse, defaultHandleAppealRpc } from "../appeal/handle/route";
import { requireActiveVisibleUsers, requireOwnerOrAdminRole } from "../_shared";
import { withRetry } from "@/lib/retry";
import { withTimeout } from "@/lib/timeout";

const appealId = "123e4567-e89b-42d3-a456-426614174000";
const observation = { requestId: "appeal-resume-test", mark() {}, setDetail() {} };
const layers = () => ({ businessSucceeded: false, auditStatus: "skipped" as const, employeeNotificationStatus: "skipped" as const, todoStatus: "skipped" as const });
const request = (body: unknown) => new NextRequest("http://localhost/api/admin/fulfillment/appeals/resume", { method: "POST", body: JSON.stringify(body) });

// 通知是外部边界；测试显式禁用 webhook，避免受开发者环境变量影响。
const originalWebhook = process.env.FEISHU_WEBHOOK_URL;
before(() => { delete process.env.FEISHU_WEBHOOK_URL; });
after(() => {
  if (originalWebhook === undefined) delete process.env.FEISHU_WEBHOOK_URL;
  else process.env.FEISHU_WEBHOOK_URL = originalWebhook;
});

test("申请补交保存完整原始载荷；无效数据和账号日期不一致都拒绝且不写库", async () => {
  for (const [payload, status] of [[abnormalSubmission(), 200], [{}, 400], [abnormalSubmission({ account_id: "another" }), 400], [abnormalSubmission({ biz_date: "2026-11-27" }), 400]] as const) {
    const db = submissionDatabase();
    const response = await buildFulfillmentAppealsPostResponse(request({ accountId: "account-1", recordDate: "2026-11-28", reason: "申请补交", submissionPayload: payload }), observation, layers(), {
      createClient: async () => db as never, createAdminClient: () => db as never,
      emit: async () => ({ ok: true, inserted: 0 }),
    });
    assert.equal(response.status, status, JSON.stringify(await response.clone().json()));
    const saved = db.tables.fulfillment_appeals ?? [];
    assert.equal(saved.length, status === 200 ? 1 : 0);
    if (status === 200) assert.deepEqual(saved[0].submission_payload, payload);
  }
});

for (const role of ["admin", "member"] as const) {
  test(`待审列表按角色和可见范围返回申请：${role}`, async () => {
    const db = memoryDatabase({
      fulfillment_appeals: [
        { id: appealId, user_id: "member-1", status: "pending", submission_payload: abnormalSubmission(), record_date: "2026-11-28" },
        { id: "foreign", user_id: "outsider", status: "pending" },
      ], profiles: [{ id: "member-1", name: "申请人" }],
    });
    const response = await buildFulfillmentAppealsGetResponse(new NextRequest("http://localhost/appeals?status=pending"), {
      requireAdminServiceClient: async () => ({ supabase: db, actor: { role, companyRole: role }, scope: { visibleUserIds: ["member-1"], activeVisibleUserIds: ["member-1"] } }) as never,
      requireOwnerOrAdminRole,
    });
    assert.equal(response.status, role === "admin" ? 200 : 403);
    if (role === "admin") {
      const body = await response.json();
      assert.deepEqual(body.appeals.map((item: { id: string }) => item.id), [appealId]);
      assert.equal("submission_payload" in body.appeals[0], false);
    } else assert.deepEqual(db.reads, []);
  });
}

for (const [status, owner, expected] of [["pending", "member-1", 409], ["rejected", "member-1", 409], ["approved", "other-user", 404], ["approved", "member-1", 200]] as const) {
  test(`续交真实提交链：${status} / ${owner} 返回 ${expected}，只在成功后清空暂存`, async () => {
    const db = submissionDatabase();
    const payload = abnormalSubmission();
    db.tables.fulfillment_appeals = [{ id: appealId, user_id: owner, status, submission_payload: payload }];
    const originals = { ...defaultVideoSubmitDeps };
    // 仅替换数据库与会话边界；续交函数、校验、提交及落库编排全部真实执行。
    defaultVideoSubmitDeps.createClient = async () => db as never;
    defaultVideoSubmitDeps.createAdminClient = () => db as never;
    try {
      const state = layers();
      const response = await handleResumeFulfillmentAppealPost(request({ appealId }), observation, state, {
        createClient: async () => db as never, createAdminClient: () => db as never, resumeAppealSubmission,
      });
      assert.equal(response.status, expected, JSON.stringify(await response.clone().json()));
      assert.equal(state.businessSucceeded, expected === 200);
      assert.equal(db.tables.videos.length, expected === 200 ? 1 : 0);
      assert.deepEqual(db.tables.fulfillment_appeals[0].submission_payload, expected === 200 ? null : payload);
      if (expected === 200) {
        const body = await response.json();
        assert.equal(body.cleared, true);
        assert.equal(body.videoId, db.tables.videos[0].id);
        assert.equal(db.tables.daily_reports[0].content, "异常作品说明");
      }
    } finally { Object.assign(defaultVideoSubmitDeps, originals); }
  });
}

test("续交业务写入失败时保留暂存数据，返回失败", async () => {
  const seed = submissionDatabase().tables;
  seed.fulfillment_appeals = [{ id: appealId, user_id: "member-1", status: "approved", submission_payload: abnormalSubmission() }];
  const db = memoryDatabase(seed, { failTable: "videos", failOperation: "insert" });
  const original = defaultVideoSubmitDeps.createAdminClient;
  defaultVideoSubmitDeps.createAdminClient = () => db as never;
  try {
    const result = await resumeAppealSubmission(appealId, db as never, {}, "member-1");
    assert.deepEqual(result, { success: false, error: "视频记录创建失败" });
    assert.deepEqual(db.tables.fulfillment_appeals[0].submission_payload, abnormalSubmission());
    assert.equal(db.calls.some((call) => call.table === "fulfillment_appeals"), false);
  } finally { defaultVideoSubmitDeps.createAdminClient = original; }
});

test("审批已通过但自动续交未成功时，通知提供原申请的续交入口", async () => {
  let notification: { actionUrl?: string | null; recipients: string[] } | undefined;
  const db = memoryDatabase({ fulfillment_appeals: [{ id: appealId, user_id: "member-1", status: "approved", submission_payload: null }] });
  const response = await buildHandleFulfillmentAppealResponse({ appealId, decision: "approve" }, {
    requireAdminServiceClient: async () => ({ supabase: db, userSupabase: { rpc: async () => ({ data: { status: "approved" }, error: null }) }, actor: { userId: "admin", role: "admin", companyRole: "admin" }, scope: { visibleUserIds: ["member-1"], activeVisibleUserIds: ["member-1"] } }) as never,
    requireOwnerOrAdminRole, requireActiveVisibleUsers,
    loadAppealOwner: async () => ({ data: { user_id: "member-1", account_id: "account-1", record_date: "2026-11-28" }, error: null }),
    handleAppealRpc: defaultHandleAppealRpc,
    emit: async (input) => { notification = input; return { ok: true, inserted: 1 }; },
    markDone: async () => true, markAppealTodosDone: async () => ({ count: 0 }), withRetry, withTimeout,
  });
  assert.equal(response.status, 200);
  assert.equal(notification?.actionUrl, `/dashboard?resumeAppeal=${appealId}`);
  assert.deepEqual(notification?.recipients, ["member-1"]);
});

test("补交暂存数据库列可保存 JSON 并清空，重复执行迁移保持兼容", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table public.fulfillment_appeals(id text primary key)");
    const migration = readFileSync(new URL("../../../../../../supabase/migrations/20261003132000_fulfillment_appeal_submission_payload.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    await db.query("insert into public.fulfillment_appeals values ($1, $2)", [appealId, { content: "原始数据" }]);
    assert.deepEqual((await db.query("select submission_payload from public.fulfillment_appeals")).rows, [{ submission_payload: { content: "原始数据" } }]);
    await db.query("update public.fulfillment_appeals set submission_payload = null where id = $1", [appealId]);
    assert.deepEqual((await db.query("select submission_payload from public.fulfillment_appeals")).rows, [{ submission_payload: null }]);
  } finally { await db.close(); }
});
