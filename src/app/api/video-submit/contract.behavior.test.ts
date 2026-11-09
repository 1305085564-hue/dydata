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

test("video-submit 读取成员资料失败时 500，不伪装成参数错误", async () => {
  const deps: VideoSubmitDeps = {
    ...defaultVideoSubmitDeps,
    createClient: async () => fakeMemberClient({
      data: null,
      error: { message: "读取个人资料失败" },
    }),
  };
  const response = await buildVideoSubmitResponse(makeRequest(), deps);
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "读取个人资料失败");
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
