import { createPublishTimeEvidence, publishImageDigest } from "@/lib/publish-time-evidence";
import { before, after } from "node:test";
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { checkCreateDuplicateSubmission, evaluateSubmissionDeadlineGuard, type NormalizedVideoSubmit } from "./prechecks";
import { createPostSubmitReviewAndNotify } from "./post-review";
import { buildVideoSubmitResponse, type VideoSubmitDeps } from "./route-core";

const oldSecret = process.env.SCREENSHOT_GRANT_SECRET;
before(() => { process.env.SCREENSHOT_GRANT_SECRET = "local-p0-regression"; });
after(() => {
  if (oldSecret === undefined) delete process.env.SCREENSHOT_GRANT_SECRET;
  else process.env.SCREENSHOT_GRANT_SECRET = oldSecret;
});

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const TEAM_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_ID = "44444444-4444-4444-8444-444444444444";

function makeNormalized(overrides: Partial<NormalizedVideoSubmit> = {}): NormalizedVideoSubmit {
  return {
    account_id: ACCOUNT_ID,
    mode: "create",
    video_id: null,
    video_url: null,
    video_title: "超期测试作品",
    content: "测试文案内容",
    published_at: "2026-01-01T10:00:00+08:00",
    published_at_text: "2026-01-01 10:00",
    published_at_source: "ocr",
    ocr_published_at: "2026-01-01T10:00:00+08:00",
    ocr_published_at_text: "2026-01-01 10:00",
    biz_date: "2026-01-01",
    anomaly_status: "normal",
    punish_type: null,
    platform_notice: null,
    appeal: null,
    topic_tag: "干货",
    topic_id: null,
    script_author_user_id: USER_ID,
    video_editor_user_id: USER_ID,
    operator_user_id: USER_ID,
    video_form: "口播",
    content_keywords: [],
    manual_edit: false,
    screenshots_refreshed: false,
    assets: [
      { role: "screenshot_1", url: `/api/submission-screenshots/file?path=${USER_ID}/s1.png`, confirmed: true, confidence_score: 0.99 },
      { role: "screenshot_2", url: `/api/submission-screenshots/file?path=${USER_ID}/s2.png`, confirmed: true, confidence_score: 0.99, recognized_fields: {
        publish_time_evidence: createPublishTimeEvidence({
          userId: USER_ID, path: publishImageDigest(Buffer.from("test screenshot")), publishedAt: "2026-01-01T10:00:00+08:00",
        }),
      } },
    ],
    metrics: {
      play_count: 18000,
      likes: 600,
      comments: 80,
      shares: 40,
      favorites: 200,
      follower_gain: 50,
      follower_loss: 0,
      follower_convert: 12,
      avg_play_duration: 55,
      avg_play_ratio: 0.28,
      bounce_rate_2s: 22,
      completion_rate_5s: 65,
      completion_rate: 12,
    },
    ...overrides,
  };
}

function fakeAppealSupabase(rows: Array<{ id: string; submission_payload: unknown }> = []) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    order: async () => ({ data: rows, error: null }),
  };
  return { from: () => chain } as never;
}

test("超 72 小时提交不再 409 拦截，而是放行并携带 expired 事后核查触发器", async () => {
  const result = await evaluateSubmissionDeadlineGuard({
    downloadScreenshot: async () => ({ ok: true, body: Buffer.from("test screenshot"), contentType: "image/png" }) as never,
    supabase: fakeAppealSupabase(),
    userId: USER_ID,
    normalized: makeNormalized(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.approvedAppealUsed, null);
  assert.equal(result.postReviewTrigger?.reason, "expired");
  assert.ok((result.postReviewTrigger?.elapsedHours ?? 0) > 72);
});

test("手改发布时间提交不再 409 拦截，放行并携带 manual_published_at 与 OCR 原值", async () => {
  const recentPublishedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const result = await evaluateSubmissionDeadlineGuard({
    downloadScreenshot: async () => ({ ok: true, body: Buffer.from("test screenshot"), contentType: "image/png" }) as never,
    supabase: fakeAppealSupabase(),
    userId: USER_ID,
    normalized: makeNormalized({
      published_at: recentPublishedAt,
      published_at_text: "2026-11-27 09:00",
      published_at_source: "manual",
      ocr_published_at_text: "2026-11-20 20:00",
    }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.postReviewTrigger?.reason, "manual_published_at");
  assert.equal(result.postReviewTrigger?.ocrPublishedAtText, "2026-11-20 20:00");
});

test("编辑模式与异常上报模式不触发事后核查；未确认发布时间仍 409", async () => {
  const editResult = await evaluateSubmissionDeadlineGuard({
    downloadScreenshot: async () => ({ ok: true, body: Buffer.from("test screenshot"), contentType: "image/png" }) as never,
    supabase: fakeAppealSupabase(),
    userId: USER_ID,
    normalized: makeNormalized({ mode: "edit", video_id: "55555555-5555-4555-8555-555555555555" }),
  });
  assert.equal(editResult.ok, true);
  if (editResult.ok) assert.equal(editResult.postReviewTrigger, null);

  const abnormalResult = await evaluateSubmissionDeadlineGuard({
    downloadScreenshot: async () => ({ ok: true, body: Buffer.from("test screenshot"), contentType: "image/png" }) as never,
    supabase: fakeAppealSupabase(),
    userId: USER_ID,
    normalized: makeNormalized({ mode: "abnormal", anomaly_status: "abnormal" }),
  });
  assert.equal(abnormalResult.ok, true);
  if (abnormalResult.ok) assert.equal(abnormalResult.postReviewTrigger, null);

  const unconfirmed = await evaluateSubmissionDeadlineGuard({
    downloadScreenshot: async () => ({ ok: true, body: Buffer.from("test screenshot"), contentType: "image/png" }) as never,
    supabase: fakeAppealSupabase(),
    userId: USER_ID,
    normalized: makeNormalized({ published_at_text: null }),
  });
  assert.equal(unconfirmed.ok, false);
  if (!unconfirmed.ok) {
    assert.equal(unconfirmed.response.status, 409);
    assert.equal((await unconfirmed.response.json()).code, "PUBLISH_TIME_CONFIRM_REQUIRED");
  }
});

test("同作品重复提交仍然 409 SUBMISSION_DUPLICATE 拦截（旧行为保持）", async () => {
  const makeDuplicateClient = () => ({
    from(table: string) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        gte() { return chain; },
        lt() { return chain; },
        limit: async () => ({
          data: table === "videos" ? [{ id: "existing-video-1" }] : [],
          error: null,
        }),
      };
      return chain;
    },
  });
  const duplicateResponse = await checkCreateDuplicateSubmission({
    supabase: makeDuplicateClient() as never,
    createAdminClient: () => makeDuplicateClient() as never,
    userId: USER_ID,
    submissionVideoId: "66666666-6666-4666-8666-666666666666",
    normalized: makeNormalized(),
  });
  assert.ok(duplicateResponse);
  assert.equal(duplicateResponse.status, 409);
  assert.equal((await duplicateResponse.json()).code, "SUBMISSION_DUPLICATE");
});

test("createPostSubmitReviewAndNotify 成功写入事后核查单并推送管理端待办", async () => {
  const insertedRows: Array<Record<string, unknown>> = [];
  const emitted: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      if (table === "fulfillment_appeals") {
        return {
          insert(row: Record<string, unknown>) {
            insertedRows.push(row);
            return {
              select: () => ({
                single: async () => ({ data: { id: "appeal-post-1" }, error: null }),
              }),
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            in: async () => ({
              data: [
                { id: ADMIN_ID, role: "owner", company_role: "company_owner", permissions: {}, team_id: TEAM_ID, membership_status: "active" },
                { id: USER_ID, role: "admin", company_role: "admin", permissions: { manage_members: true }, team_id: TEAM_ID, membership_status: "active" },
              ],
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const result = await createPostSubmitReviewAndNotify(
    {
      admin: admin as never,
      userId: USER_ID,
      submitter: "小李",
      teamId: TEAM_ID,
      accountId: ACCOUNT_ID,
      accountName: "测试号",
      recordDate: "2026-01-01",
      videoId: "77777777-7777-4777-8777-777777777777",
      dailyReportId: "88888888-8888-4888-8888-888888888888",
      nowIso: "2026-01-05T10:00:00.000Z",
      normalized: makeNormalized(),
      trigger: { reason: "expired", publishedDate: "2026-01-01", elapsedHours: 96, ocrPublishedAtText: "2026-01-01 10:00" },
      requestId: "req-post-1",
    },
    async (payload) => {
      emitted.push(payload as unknown as Record<string, unknown>);
      return { ok: true, inserted: 1 };
    },
  );

  assert.equal(result.status, "created");
  assert.equal(result.appealId, "appeal-post-1");
  assert.equal(result.todoStatus, "succeeded");
  assert.equal(insertedRows[0]?.review_mode, "post_submit");
  assert.equal(insertedRows[0]?.video_id, "77777777-7777-4777-8777-777777777777");
  assert.equal(insertedRows[0]?.daily_report_id, "88888888-8888-4888-8888-888888888888");
  assert.equal(insertedRows[0]?.trigger_reason, "expired");
  assert.deepEqual(emitted[0]?.recipients, [ADMIN_ID]);
  assert.equal(emitted[0]?.sourceType, "fulfillment_appeal");
  assert.equal(emitted[0]?.sourceId, "appeal-post-1");
});

test("事后核查单写入失败或待办推送失败时绝不伪造成功，返回编号与告警并记日志", async () => {
  const logs: string[] = [];
  const origError = console.error;
  console.error = (line: string) => logs.push(String(line));
  try {
    const failingInsertAdmin = {
      from() {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { message: "column review_mode does not exist" } }),
            }),
          }),
        };
      },
    };
    const failed = await createPostSubmitReviewAndNotify({
      admin: failingInsertAdmin as never,
      userId: USER_ID,
      submitter: "小李",
      teamId: TEAM_ID,
      accountId: ACCOUNT_ID,
      accountName: "测试号",
      recordDate: "2026-01-01",
      videoId: "77777777-7777-4777-8777-777777777777",
      dailyReportId: "88888888-8888-4888-8888-888888888888",
      nowIso: "2026-01-05T10:00:00.000Z",
      normalized: makeNormalized(),
      trigger: { reason: "expired", publishedDate: "2026-01-01", elapsedHours: 96, ocrPublishedAtText: null },
      requestId: "req-fail-1",
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.appealId, null);
    assert.match(failed.warning ?? "", /req-fail-1/);
    assert.doesNotMatch(failed.warning ?? "", /column review_mode/);
    assert.ok(logs.some((line) => line.includes("req-fail-1")));

    const partialAdmin = {
      from(table: string) {
        if (table === "fulfillment_appeals") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: "appeal-partial-1" }, error: null }),
              }),
            }),
          };
        }
        return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
      },
    };
    const partial = await createPostSubmitReviewAndNotify(
      {
        admin: partialAdmin as never,
        userId: USER_ID,
        submitter: "小李",
        teamId: TEAM_ID,
        accountId: ACCOUNT_ID,
        accountName: "测试号",
        recordDate: "2026-01-01",
        videoId: "77777777-7777-4777-8777-777777777777",
        dailyReportId: "88888888-8888-4888-8888-888888888888",
        nowIso: "2026-01-05T10:00:00.000Z",
        normalized: makeNormalized(),
        trigger: { reason: "manual_published_at", publishedDate: "2026-01-01", elapsedHours: 10, ocrPublishedAtText: "2026-01-01 08:00" },
        requestId: "req-partial-1",
      },
      async () => ({ ok: false, inserted: 0, error: "notifications insert failed" }),
    );
    assert.equal(partial.status, "partial");
    assert.equal(partial.appealId, "appeal-partial-1");
    assert.equal(partial.todoStatus, "failed");
    assert.match(partial.warning ?? "", /req-partial-1/);
  } finally {
    console.error = origError;
  }
});

test("buildVideoSubmitResponse 对重复提交保持 409，不进入事后核查写入", async () => {
  let postReviewCalled = false;
  const fakeDb = {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) },
    from(table: string) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        gte() { return chain; },
        lt() { return chain; },
        limit: async () => ({
          data: table === "videos" ? [{ id: "dup-video" }] : [],
          error: null,
        }),
        single: async () => {
          if (table === "profiles") {
            return { data: { name: "小李", team_id: TEAM_ID, membership_status: "active" }, error: null };
          }
          if (table === "accounts") {
            return { data: { id: ACCOUNT_ID, profile_id: USER_ID, name: "测试号" }, error: null };
          }
          return { data: null, error: null };
        },
      };
      return chain;
    },
  };
  const deps: VideoSubmitDeps = {
    createClient: async () => fakeDb as never,
    createAdminClient: () => fakeDb as never,
    createPostSubmitReview: async () => {
      postReviewCalled = true;
      throw new Error("duplicate submit must not create post review");
    },
  };
  const req = new NextRequest("http://localhost/api/video-submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(makeNormalized()),
  });
  const res = await buildVideoSubmitResponse(req, deps);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "SUBMISSION_DUPLICATE");
  assert.equal(postReviewCalled, false);
});


test("近期发布时间仅有客户端OCR声明仍进入核查，匹配服务端证据才正常放行", async () => {
  const publishedAt = new Date(Date.now() - 2 * 3600_000).toISOString();
  const normalized = makeNormalized({ published_at: publishedAt, published_at_source: "ocr" });
  const check = () => evaluateSubmissionDeadlineGuard({
    downloadScreenshot: async () => ({ ok: true, body: Buffer.from("test screenshot"), contentType: "image/png" }) as never,
    supabase: fakeAppealSupabase(), userId: USER_ID, normalized,
  });
  const untrusted = await check();
  assert.equal(untrusted.ok && untrusted.postReviewTrigger?.reason, "manual_published_at");
  normalized.assets[1].recognized_fields = {
    publish_time_evidence: createPublishTimeEvidence({
      userId: USER_ID, path: publishImageDigest(Buffer.from("test screenshot")), publishedAt,
    }),
  };
  const trusted = await check();
  assert.equal(trusted.ok, true);
  assert.equal(trusted.ok && trusted.postReviewTrigger, null);
  normalized.published_at = new Date(Date.now() - 3600_000).toISOString();
  const changed = await check();
  assert.equal(changed.ok && changed.postReviewTrigger?.reason, "manual_published_at");
});


test("识别凭据对应截图读取失败时保守进入核查，提交不假装已验证", async () => {
  const normalized = makeNormalized({
    published_at: new Date(Date.now() - 3600_000).toISOString(),
  });
  for (const downloadScreenshot of [
    async () => ({ ok: false, errors: ["unavailable"] }) as never,
    async (): Promise<never> => { throw new Error("storage unavailable"); },
  ]) {
    const result = await evaluateSubmissionDeadlineGuard({
      supabase: fakeAppealSupabase(), userId: USER_ID, normalized, downloadScreenshot,
    });
    assert.equal(result.ok && result.postReviewTrigger?.reason, "manual_published_at");
  }
});

test("数据图 screenshot_1 携带有效发布时间凭据且按分钟对齐时同样正常放行", async () => {
  const ocrPublishedAt = new Date(Math.floor((Date.now() - 2 * 3600_000) / 60_000) * 60_000 + 42_000).toISOString();
  const submittedMinuteIso = new Date(Math.floor(Date.parse(ocrPublishedAt) / 60_000) * 60_000).toISOString();
  const s1Bytes = Buffer.from("data-screenshot-bytes");
  const normalized = makeNormalized({
    published_at: submittedMinuteIso,
    published_at_source: "ocr",
    assets: [
      {
        role: "screenshot_1",
        url: `/api/submission-screenshots/file?path=${USER_ID}/s1.png`,
        confirmed: true,
        confidence_score: 0.99,
        recognized_fields: {
          publish_time_evidence: createPublishTimeEvidence({
            userId: USER_ID,
            path: publishImageDigest(s1Bytes),
            publishedAt: ocrPublishedAt,
          }),
        },
      },
      {
        role: "screenshot_2",
        url: `/api/submission-screenshots/file?path=${USER_ID}/s2.png`,
        confirmed: true,
        confidence_score: 0.99,
        recognized_fields: null,
      },
    ],
  });
  const result = await evaluateSubmissionDeadlineGuard({
    downloadScreenshot: async (path) => ({
      ok: true,
      body: path.endsWith("s1.png") ? s1Bytes : Buffer.from("other"),
      contentType: "image/png",
    }) as never,
    supabase: fakeAppealSupabase(),
    userId: USER_ID,
    normalized,
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.postReviewTrigger, null);
});
