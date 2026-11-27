import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { observeMutation, type MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult } from "@/lib/observed-mutation-result";
import {
  buildVideoSubmitResponse,
  defaultVideoSubmitDeps,
  type VideoSubmitDeps,
} from "./route-core";

function makeRequest() {
  return new NextRequest("http://localhost/api/video-submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

function observe(handler: (observation: MutationObservation) => Promise<Response>) {
  const logs: Array<Record<string, unknown>> = [];
  return {
    logs,
    response: observeMutation(
      "/api/video-submit",
      (observation) => handler(observation).then(response => appendObservedMutationResult(response, observation)),
      {
        createRequestId: () => "123e4567-e89b-42d3-a456-426614174000",
        release: () => "test-release",
        log: (entry) => logs.push(entry as unknown as Record<string, unknown>),
      },
    ),
  };
}

test("video-submit 未登录时明确失败并补齐契约分层字段，且只记录一条观测", async () => {
  const deps: VideoSubmitDeps = {
    ...defaultVideoSubmitDeps,
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as unknown as Awaited<ReturnType<typeof defaultVideoSubmitDeps.createClient>>),
  };
  const { response, logs } = observe((observation) =>
    buildVideoSubmitResponse(makeRequest(), deps, observation),
  );

  const result = await response;
  assert.equal(result.status, 401);
  assert.equal(result.headers.get("x-dydata-request-id"), "123e4567-e89b-42d3-a456-426614174000");
  assert.deepEqual(await result.json(), {
    error: "未登录",
    businessSucceeded: false,
    permissionChecked: false,
    auditSucceeded: null,
    notificationSucceeded: null,
    todoMarked: null,
    compensationRequired: false,
    auditStatus: "skipped",
    employeeNotificationStatus: "skipped",
    todoStatus: "skipped",
    employeeNotificationSucceeded: null,
    notificationMarked: null,
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.outcome, "rejected");
});

test("video-submit 鉴权依赖抛错时不静默成功且只记录一条 thrown 观测", async () => {
  const deps: VideoSubmitDeps = {
    ...defaultVideoSubmitDeps,
    createClient: async () => {
      throw new Error("auth dependency failed");
    },
  };
  const { response, logs } = observe((observation) =>
    buildVideoSubmitResponse(makeRequest(), deps, observation),
  );

  await assert.rejects(response, /auth dependency failed/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.outcome, "thrown");
  const detail = logs[0]?.detail as Record<string, unknown>;
  assert.equal(detail.primaryStage, "auth");
  assert.deepEqual(detail.stages, ["auth"]);
});

function fakeMemberClient(profileResult: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "member-1" } } }) },
    from(table: string) {
      assert.equal(table, "profiles");
      const query = {
        select() { return query; },
        eq() { return query; },
        single: async () => profileResult,
        insert() { throw new Error("失败路径不得写入"); },
        update() { throw new Error("失败路径不得写入"); },
      };
      return query;
    },
  } as never;
}

test("video-submit 请求体不是 JSON 时 400，不进入落库", async () => {
  const deps: VideoSubmitDeps = {
    ...defaultVideoSubmitDeps,
    createClient: async () => fakeMemberClient({
      data: { name: "成员", team_id: "team-1", membership_status: "active" },
      error: null,
    }),
    createAdminClient: () => { throw new Error("失败路径不得写入"); },
  };
  const response = await buildVideoSubmitResponse(
    new NextRequest("http://localhost/api/video-submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
    deps,
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "请求体格式不正确");
});

test("video-submit 参数校验失败时 400，不进入落库", async () => {
  const deps: VideoSubmitDeps = {
    ...defaultVideoSubmitDeps,
    createClient: async () => fakeMemberClient({
      data: { name: "成员", team_id: "team-1", membership_status: "active" },
      error: null,
    }),
    createAdminClient: () => { throw new Error("失败路径不得写入"); },
  };
  const response = await buildVideoSubmitResponse(makeRequest(), deps);
  assert.equal(response.status, 400);
  assert.equal(typeof (await response.json()).error, "string");
});

test("video-submit 读取成员资料失败时返回字符串错误并可按编号查日志", async () => {
  const deps: VideoSubmitDeps = {
    ...defaultVideoSubmitDeps,
    createClient: async () => fakeMemberClient({
      data: null,
      error: { message: "database connection failed api_key=hidden-key" },
    }),
  };
  const serverLogs: string[] = [];
  const originalError = console.error;
  console.error = (line: string) => serverLogs.push(line);
  try {
    const { response, logs } = observe((observation) =>
      buildVideoSubmitResponse(makeRequest(), deps, observation),
    );
    const result = await response;
    const body = await result.json() as { error: unknown; requestId: string };
    assert.equal(result.status, 500);
    assert.equal(typeof body.error, "string");
    const errorText = String(body.error);
    assert.match(errorText, /后台服务暂时不可用/);
    assert.doesNotMatch(errorText, /database connection failed|hidden-key/);
    assert.equal(body.requestId, "123e4567-e89b-42d3-a456-426614174000");
    assert.equal(logs.length, 1);
    const apiLog = JSON.parse(serverLogs[0] ?? "{}") as Record<string, unknown>;
    assert.equal(apiLog.requestId, body.requestId);
    assert.equal(apiLog.error, "database connection failed api_key=[REDACTED]");
  } finally {
    console.error = originalError;
  }
});

for (const membership of ["unauthenticated", "archived"] as const) {
  test(`B03 作品提交 ${membership} 在外部 AI 和写入前拒绝`, async () => {
    const counts = { admin: 0, reads: 0, writes: 0, outbound: 0 };
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      counts.outbound += 1;
      throw new Error("B03 拒绝场景不得发生外部请求");
    };
    const deps: VideoSubmitDeps = {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: membership === "unauthenticated" ? null : { id: "b03-synthetic" } } }) },
        from(table: string) {
          counts.reads += 1;
          assert.equal(table, "profiles");
          const query = {
            select() { return query; },
            eq() { return query; },
            single: async () => ({ data: { name: "合成归档成员", team_id: "team-synthetic", membership_status: "archived" }, error: null }),
            insert() { counts.writes += 1; throw new Error("不得写入"); },
            update() { counts.writes += 1; throw new Error("不得写入"); },
          };
          return query;
        },
      }) as never,
      createAdminClient: () => {
        counts.admin += 1;
        throw new Error("拒绝场景不应创建管理客户端");
      },
    };
    try {
      const response = await buildVideoSubmitResponse(makeRequest(), deps);
      assert.equal(response.status, membership === "unauthenticated" ? 401 : 403);
      assert.equal((await response.json()).error, membership === "unauthenticated" ? "未登录" : "已归档账号不能提交视频");
      assert.deepEqual(counts, { admin: 0, reads: membership === "unauthenticated" ? 0 : 1, writes: 0, outbound: 0 });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
}

for (const [stage, expectedCode, expectedMessage] of [
  ["video", "VIDEO_PERSIST_FAILED", "视频记录创建失败"],
  ["snapshot", "SNAPSHOT_PERSIST_FAILED", "视频快照创建失败"],
  ["report", "REPORT_PERSIST_FAILED", "日报记录创建失败"],
  ["tags", "TAGS_PERSIST_FAILED", "保存作品标签失败，请稍后重试"],
  ["source", "REPORT_SOURCE_PERSIST_FAILED", "保存日报来源失败，请稍后重试"],
] as const) {
  test(`video-submit ${stage} 写入失败保持业务错误码、回滚和固定中文提示`, async () => {
    const raw = new Error('permission denied for relation private_table (42501)');
    const userId = "123e4567-e89b-42d3-a456-426614174001";
    const writes: string[] = [];
    const rollbacks: string[] = [];
    const database = {
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
      from(table: string) {
        let action = "read";
        let payload: Record<string, unknown> = {};
        const resolve = () => {
          if (action === "read") {
            if (table === "profiles") return { data: { name: "成员", team_id: "team-1", membership_status: "active" }, error: null };
            if (table === "accounts") return { data: { id: "account-1", profile_id: userId }, error: null };
            if (table === "video_tags" && stage === "tags") return { data: null, error: raw };
            return { data: [], error: null };
          }
          const writeStage = table === "videos" ? "video" : table === "video_metrics_snapshots" ? "snapshot" : action === "insert" ? "report" : "source";
          // 回滚只恢复旧视频或删除本次新增的快照/日报，不访问真实数据库。
          if (action === "delete" || (table === "videos" && !("content" in payload))) {
            rollbacks.push(table);
            return { data: null, error: null };
          }
          writes.push(writeStage);
          return { data: { id: `${table}-1`, user_id: userId, report_date: "2026-11-28" }, error: writeStage === stage ? raw : null };
        };
        const query = {
          select() { return query; }, eq() { return query; }, in() { return query; },
          limit: async () => ({ data: [], error: null }),
          single: async () => resolve(),
          maybeSingle: async () => table === "videos"
            ? { data: { id: "videos-1", user_id: userId, account_id: "account-1", lifecycle_state: "active" }, error: null }
            : { data: null, error: null },
          insert(value: Record<string, unknown>) { action = "insert"; payload = value; return query; },
          update(value: Record<string, unknown>) { action = "update"; payload = value; return query; },
          delete() { action = "delete"; return query; },
          then(resolveResult: (value: unknown) => unknown) { return Promise.resolve(resolve()).then(resolveResult); },
        };
        return query;
      },
    };
    const original = console.error;
    const serverLogs: unknown[][] = [];
    console.error = (...args: unknown[]) => { serverLogs.push(args); };
    try {
      const { response: pendingResponse } = observe((observation) => buildVideoSubmitResponse(new NextRequest("http://localhost/api/video-submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "abnormal", anomaly_status: "abnormal", account_id: "account-1", content: "异常作品说明",
          biz_date: "2026-11-28", assets: [],
          metrics: { play_count: 100, likes: 10, comments: 2, shares: 1, favorites: 3, follower_gain: 4, follower_loss: 0, follower_convert: 0, avg_play_duration: 12, bounce_rate_2s: 20, completion_rate_5s: 30, completion_rate: 40 },
        }),
      }), { createClient: async () => database as never, createAdminClient: () => database as never }, observation));
      const response = await pendingResponse;
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.equal(body.error, expectedMessage);
      assert.equal(body.code, expectedCode);
      assert.equal(body.businessSucceeded, false);
      assert.doesNotMatch(JSON.stringify(body), /private_table|42501|permission denied/);
      assert.ok(serverLogs.some((args) => args[1] === raw || (args[1] as { message?: string })?.message === raw.message));
      assert.ok(rollbacks.includes("videos"));
      if (stage === "video") assert.deepEqual(writes, ["video"]);
      if (stage === "snapshot") assert.deepEqual(writes, ["video", "snapshot"]);
      if (stage === "report") assert.deepEqual(writes, ["video", "snapshot", "report"]);
    } finally { console.error = original; }
  });
}
