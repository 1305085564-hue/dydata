import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildFulfillmentAppealsGetResponse } from "./route";
import { buildReopenFulfillmentAppealResponse } from "../appeal/reopen/route";
import { buildHandleFulfillmentAppealResponse, type HandleFulfillmentAppealDeps } from "../appeal/handle/route";
import { handleResumeFulfillmentAppealPost } from "./resume/route";
import type { MutationObservation } from "@/lib/observed-mutation";

const APPEAL_ID = "123e4567-e89b-42d3-a456-426614174000";
const ACTOR_ID = "123e4567-e89b-42d3-a456-426614174002";
const OWNER_ID = "123e4567-e89b-42d3-a456-426614174003";

function captureErrorLogs() {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  return {
    lines,
    restore() {
      console.error = original;
    },
  };
}

function makeObservation(requestId: string): MutationObservation {
  return {
    requestId,
    mark() {},
    setDetail() {},
  };
}

test("GET /api/admin/fulfillment/appeals 库查询报错收口，返回中文 error + requestId + 同编号日志", async () => {
  const logs = captureErrorLogs();
  try {
    const query = {
      select() { return this; },
      order() { return this; },
      eq() { return this; },
      in() { return this; },
      or() { return this; },
      range() {
        return Promise.resolve({
          data: null,
          error: { message: "permission denied for table fulfillment_appeals" },
        });
      },
    };
    const req = new NextRequest("http://localhost/api/admin/fulfillment/appeals", {
      headers: { "x-request-id": "appeals-get-001" },
    });
    const res = await buildFulfillmentAppealsGetResponse(req, {
      requireAdminServiceClient: async () => ({
        supabase: { from: () => query } as never,
        actor: { userId: ACTOR_ID } as never,
        scope: { kind: "team", visibleUserIds: [OWNER_ID], activeVisibleUserIds: [OWNER_ID] } as never,
      }) as never,
      requireOwnerOrAdminRole: () => null,
    });
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("x-dydata-request-id"), "appeals-get-001");
    const body = await res.json();
    assert.equal(body.requestId, "appeals-get-001");
    assert.equal(body.error, "读取履约申诉失败（编号：appeals-get-001）");
    assert.doesNotMatch(JSON.stringify(body), /permission denied|fulfillment_appeals/i);
    assert.ok(logs.lines.some((line) => line.includes("appeals-get-001") && line.includes("/api/admin/fulfillment/appeals")));
  } finally {
    logs.restore();
  }
});

test("POST /api/admin/fulfillment/appeal/reopen RPC 原始报错不外泄，返回中文 error + requestId + 同编号日志", async () => {
  const logs = captureErrorLogs();
  try {
    const supabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: APPEAL_ID,
                user_id: OWNER_ID,
                account_id: null,
                record_date: "2026-11-26",
                reason: "超72h",
                status: "rejected",
                review_mode: "post_submit",
                video_id: "vid-1",
                daily_report_id: "rep-1",
              },
              error: null,
            });
          },
        };
      },
    };
    const userSupabase = {
      rpc: async () => ({
        data: null,
        error: { message: "deadlock detected on relation videos (SQLSTATE 40P01)" },
      }),
    };
    const req = new NextRequest("http://localhost/api/admin/fulfillment/appeal/reopen", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "reopen-rpc-002" },
      body: JSON.stringify({ appealId: APPEAL_ID }),
    });
    const layers = {
      businessSucceeded: false,
      auditStatus: "skipped" as const,
      employeeNotificationStatus: "skipped" as const,
      todoStatus: "skipped" as const,
    };
    const res = await buildReopenFulfillmentAppealResponse(
      req,
      makeObservation("reopen-rpc-002"),
      layers,
      {
        requireAdminServiceClient: async () => ({
          supabase,
          userSupabase,
          actor: { userId: ACTOR_ID },
          scope: { kind: "team", visibleUserIds: [OWNER_ID], activeVisibleUserIds: [OWNER_ID] },
        }) as never,
        requireOwnerOrAdminRole: () => null,
        requireActiveVisibleUsers: () => null,
        emit: async () => ({ ok: true, inserted: 0 }),
      },
    );
    assert.equal(res.status, 409);
    assert.equal(res.headers.get("x-dydata-request-id"), "reopen-rpc-002");
    const body = await res.json();
    assert.equal(body.requestId, "reopen-rpc-002");
    assert.equal(body.error, "打回事后核查单失败，请刷新后重试（编号：reopen-rpc-002）");
    assert.doesNotMatch(JSON.stringify(body), /deadlock|SQLSTATE|relation videos/i);
    assert.ok(logs.lines.some((line) => line.includes("reopen-rpc-002") && line.includes("/api/admin/fulfillment/appeal/reopen")));
  } finally {
    logs.restore();
  }
});

test("POST /api/admin/fulfillment/appeal/handle 500 失败不回传底层 RPC 报错，带 requestId 与同编号服务端日志", async () => {
  const logs = captureErrorLogs();
  try {
    const auth = {
      supabase: {},
      actor: { userId: ACTOR_ID },
      permissionInfo: {},
      scope: { kind: "team", visibleUserIds: [OWNER_ID], activeVisibleUserIds: [OWNER_ID] },
    };
    const deps: HandleFulfillmentAppealDeps = {
      requireAdminServiceClient: async () => auth as never,
      requireOwnerOrAdminRole: () => null,
      requireActiveVisibleUsers: () => null,
      loadAppealOwner: async () => ({
        data: { user_id: OWNER_ID, account_id: null, record_date: "2026-11-26", review_mode: "post_submit" },
        error: null,
      }),
      handleAppealRpc: async () => ({
        data: null,
        error: new Error("duplicate key value violates unique constraint audit_logs_pkey"),
      }),
      emit: async () => ({ ok: true, inserted: 1 }),
      markDone: async () => true,
      markAppealTodosDone: async () => ({ count: 0 }),
      withRetry: async <T>(task: (attempt: number) => Promise<T>) => task(1),
      withTimeout: async <T>(task: (signal: AbortSignal) => Promise<T>) => task(new AbortController().signal),
      resumeSubmission: async () => ({ success: true, videoId: null, cleared: true }),
    };
    const res = await buildHandleFulfillmentAppealResponse(
      { appealId: APPEAL_ID, decision: "approve" },
      deps,
      makeObservation("handle-rpc-003"),
    );
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("x-dydata-request-id"), "handle-rpc-003");
    const body = await res.json();
    assert.equal(body.requestId, "handle-rpc-003");
    assert.equal(typeof body.error, "string");
    assert.doesNotMatch(JSON.stringify(body), /duplicate key|audit_logs_pkey/i);
    assert.ok(logs.lines.some((line) => line.includes("handle-rpc-003") && line.includes("/api/admin/fulfillment/appeal/handle")));
  } finally {
    logs.restore();
  }
});

test("POST /api/admin/fulfillment/appeals/resume 内部写入失败不透传底层报错，带 requestId 与同编号日志", async () => {
  const logs = captureErrorLogs();
  try {
    const req = new NextRequest("http://localhost/api/admin/fulfillment/appeals/resume", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "resume-err-004" },
      body: JSON.stringify({ appealId: APPEAL_ID }),
    });
    const layers = {
      businessSucceeded: false,
      auditStatus: "skipped" as const,
      employeeNotificationStatus: "skipped" as const,
      todoStatus: "skipped" as const,
    };
    const res = await handleResumeFulfillmentAppealPost(
      req,
      makeObservation("resume-err-004"),
      layers,
      {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: { id: OWNER_ID } } }) },
        }) as never,
        createAdminClient: () => ({}) as never,
        resumeAppealSubmission: async () => ({
          success: false,
          error: "insert or update on table videos violates foreign key constraint",
        }),
      },
    );
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("x-dydata-request-id"), "resume-err-004");
    const body = await res.json();
    assert.equal(body.requestId, "resume-err-004");
    assert.equal(body.error, "补交数据续交失败，请回到填报页重试（编号：resume-err-004）");
    assert.doesNotMatch(JSON.stringify(body), /foreign key constraint|videos/i);
    assert.ok(logs.lines.some((line) => line.includes("resume-err-004") && line.includes("/api/admin/fulfillment/appeals/resume")));
  } finally {
    logs.restore();
  }
});
