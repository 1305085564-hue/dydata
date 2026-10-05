import assert from "node:assert/strict";
import test from "node:test";

import {
  POST as postSubTopics,
  defaultSubTopicsRouteDeps,
  buildSubTopicsResponse,
} from "@/app/api/topics/sub-topics/route";
import {
  PATCH as patchSubTopic,
  DELETE as deleteSubTopic,
  defaultSubTopicDetailRouteDeps,
  buildSubTopicPatchResponse,
  buildSubTopicDeleteResponse,
} from "@/app/api/topics/sub-topics/[id]/route";
import {
  POST as postClaim,
  defaultClaimRouteDeps,
  buildClaimResponse,
} from "@/app/api/topics/sub-topics/[id]/claim/route";
import {
  POST as postReturn,
  defaultReturnRouteDeps,
  buildReturnResponse,
} from "@/app/api/topics/sub-topics/[id]/return/route";
import {
  POST as postStartScripting,
  defaultStartScriptingRouteDeps,
  buildStartScriptingResponse,
} from "@/app/api/topics/sub-topics/[id]/start-scripting/route";

const ID = "11111111-1111-4111-8111-111111111111";
const LAYERED_FIELDS = [
  "businessSucceeded",
  "permissionChecked",
  "auditStatus",
  "employeeNotificationStatus",
  "todoStatus",
  "compensationRequired",
] as const;

function request(method = "POST", body?: unknown) {
  return new Request("http://localhost/api/topics", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;
}

function context() {
  return {
    ok: true as const,
    context: {
      userId: "user-1",
      supabase: {
        from: () => ({ insert: async () => ({ error: null }) }),
      },
      teamId: "team-1",
      teamScope: { kind: "team", visibleUserIds: ["user-1"] },
      permissionContext: {
        permissionInfo: {
          companyRole: "company_owner",
          teamId: "team-1",
          membershipStatus: "active",
        },
        scope: { kind: "team", visibleUserIds: ["user-1"] },
      },
    },
  } as never;
}

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function assertLayered(body: Record<string, unknown>, label: string) {
  for (const field of LAYERED_FIELDS) assert.ok(field in body, `${label} 缺少 ${field}`);
}

const ctx = { params: Promise.resolve({ id: ID }) };

test("topics/sub-topics：依赖失败和成功都走真实 handler 并补齐分层字段", async () => {
  const failure = await buildSubTopicsResponse(request("POST", {}), {
    requireActiveTeamContext: async () => context(),
    createSubTopic: async () => ({ ok: false, status: 500, message: "创建失败" }),
  });
  assert.equal(failure.status, 500);
  const failedBody = await bodyOf(failure);
  assertLayered(failedBody, "sub-topics failure");
  assert.equal(failedBody.businessSucceeded, false);
  assert.equal(failedBody.error, "创建失败");

  const success = await buildSubTopicsResponse(request("POST", { title: "题目" }), {
    requireActiveTeamContext: async () => context(),
    createSubTopic: async () => ({ ok: true, value: { id: ID } }),
  });
  assert.equal(success.status, 200);
  const successBody = await bodyOf(success);
  assertLayered(successBody, "sub-topics success");
  assert.equal(successBody.businessSucceeded, true);
  assert.deepEqual(successBody.id, ID);
});

test("topics/sub-topics/[id]：PATCH/DELETE 失败不静默，成功结果保留业务字段", async () => {
  const deps = {
    requireActiveTeamContext: async () => context(),
    updateSubTopic: async () => ({ ok: false as const, status: 409 as const, message: "更新冲突" }),
    removeSubTopic: async () => ({ ok: true as const, value: { removed: true as const } }),
  };
  const patchFailure = await buildSubTopicPatchResponse(request("PATCH", { title: "x" }), ctx, deps);
  assert.equal(patchFailure.status, 409);
  const patchBody = await bodyOf(patchFailure);
  assertLayered(patchBody, "sub-topics/[id] PATCH");
  assert.equal(patchBody.businessSucceeded, false);
  assert.equal(patchBody.error, "更新冲突");

  const deleteSuccess = await buildSubTopicDeleteResponse(request("DELETE"), ctx, deps);
  assert.equal(deleteSuccess.status, 200);
  const deleteBody = await bodyOf(deleteSuccess);
  assertLayered(deleteBody, "sub-topics/[id] DELETE");
  assert.equal(deleteBody.businessSucceeded, true);
  assert.equal(deleteBody.removed, true);
});

test("topics 认领链：claim/return/start-scripting 均传播依赖失败和成功分层结果", async () => {
  const cases = [
    {
      label: "claim",
      build: buildClaimResponse,
      deps: defaultClaimRouteDeps,
      failed: () => ({ ok: false as const, status: 500 as const, message: "认领失败" }),
      success: () => ({ ok: true as const, value: { status: "writing" } }),
    },
    {
      label: "return",
      build: buildReturnResponse,
      deps: defaultReturnRouteDeps,
      failed: () => ({ ok: false as const, status: 404 as const, message: "未找到正在写的记录" }),
      success: () => ({ ok: true as const, value: { status: "cancelled" } }),
    },
    {
      label: "start-scripting",
      build: buildStartScriptingResponse,
      deps: defaultStartScriptingRouteDeps,
      failed: () => ({ ok: false as const, status: 500 as const, message: "开始失败" }),
      success: () => ({ ok: true as const, value: { status: "writing" } }),
    },
  ] as const;

  for (const item of cases) {
    const base = { requireActiveTeamContext: async () => context() };
    const failedDeps = item.label === "return"
      ? { ...base, cancelWritingClaim: async () => item.failed() }
      : { ...base, startWritingClaim: async () => item.failed() };
    const failed = await item.build(request(), ctx, failedDeps as never);
    assert.equal(failed.status, item.label === "return" ? 404 : 500, item.label);
    const failedBody = await bodyOf(failed);
    assertLayered(failedBody, item.label);
    assert.equal(failedBody.businessSucceeded, false);

    const successDeps = item.label === "return"
      ? { ...base, cancelWritingClaim: async () => item.success() }
      : { ...base, startWritingClaim: async () => item.success() };
    const success = await item.build(request(), ctx, successDeps as never);
    assert.equal(success.status, 200, item.label);
    const successBody = await bodyOf(success);
    assertLayered(successBody, `${item.label} success`);
    assert.equal(successBody.businessSucceeded, true);
  }
});

test("topics 认领链：一次请求只写一条结构化观测日志，且 request id 原样回传", async () => {
  const originalAuth = defaultSubTopicsRouteDeps.requireActiveTeamContext;
  const originalCreate = defaultSubTopicsRouteDeps.createSubTopic;
  const originalInfo = console.info;
  const logs: string[] = [];
  defaultSubTopicsRouteDeps.requireActiveTeamContext = async () => context();
  defaultSubTopicsRouteDeps.createSubTopic = async () => ({ ok: false, status: 500, message: "写入失败" });
  console.info = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    const response = await postSubTopics(new Request("http://localhost/api/topics", {
      method: "POST",
      headers: { "x-dydata-request-id": ID, "content-type": "application/json" },
      body: "{}",
    }) as never);
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("x-dydata-request-id"), ID);
  } finally {
    defaultSubTopicsRouteDeps.requireActiveTeamContext = originalAuth;
    defaultSubTopicsRouteDeps.createSubTopic = originalCreate;
    console.info = originalInfo;
  }
  assert.equal(logs.filter((line) => line.includes("/api/topics/sub-topics")).length, 1);
});

test("topics 每个写入 handler：一请求只落一条日志（含动态 id 路由）", async () => {
  const originalInfo = console.info;
  const logs: string[] = [];
  console.info = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  const original = {
    detailAuth: defaultSubTopicDetailRouteDeps.requireActiveTeamContext,
    update: defaultSubTopicDetailRouteDeps.updateSubTopic,
    remove: defaultSubTopicDetailRouteDeps.removeSubTopic,
    claimAuth: defaultClaimRouteDeps.requireActiveTeamContext,
    claim: defaultClaimRouteDeps.startWritingClaim,
    returnAuth: defaultReturnRouteDeps.requireActiveTeamContext,
    cancel: defaultReturnRouteDeps.cancelWritingClaim,
    startAuth: defaultStartScriptingRouteDeps.requireActiveTeamContext,
    start: defaultStartScriptingRouteDeps.startWritingClaim,
  };
  defaultSubTopicDetailRouteDeps.requireActiveTeamContext = async () => context();
  defaultSubTopicDetailRouteDeps.updateSubTopic = async () => ({ ok: false, status: 500, message: "更新失败" });
  defaultSubTopicDetailRouteDeps.removeSubTopic = async () => ({ ok: false, status: 500, message: "移出失败" });
  defaultClaimRouteDeps.requireActiveTeamContext = async () => context();
  defaultClaimRouteDeps.startWritingClaim = async () => ({ ok: false, status: 500, message: "认领失败" });
  defaultReturnRouteDeps.requireActiveTeamContext = async () => context();
  defaultReturnRouteDeps.cancelWritingClaim = async () => ({ ok: false, status: 500, message: "取消失败" });
  defaultStartScriptingRouteDeps.requireActiveTeamContext = async () => context();
  defaultStartScriptingRouteDeps.startWritingClaim = async () => ({ ok: false, status: 500, message: "开始失败" });
  try {
    await patchSubTopic(request("PATCH", {}), ctx as never);
    await deleteSubTopic(request("DELETE"), ctx as never);
    await postClaim(request(), ctx as never);
    await postReturn(request(), ctx as never);
    await postStartScripting(request(), ctx as never);
  } finally {
    defaultSubTopicDetailRouteDeps.requireActiveTeamContext = original.detailAuth;
    defaultSubTopicDetailRouteDeps.updateSubTopic = original.update;
    defaultSubTopicDetailRouteDeps.removeSubTopic = original.remove;
    defaultClaimRouteDeps.requireActiveTeamContext = original.claimAuth;
    defaultClaimRouteDeps.startWritingClaim = original.claim;
    defaultReturnRouteDeps.requireActiveTeamContext = original.returnAuth;
    defaultReturnRouteDeps.cancelWritingClaim = original.cancel;
    defaultStartScriptingRouteDeps.requireActiveTeamContext = original.startAuth;
    defaultStartScriptingRouteDeps.startWritingClaim = original.start;
    console.info = originalInfo;
  }
  for (const route of [
    "/api/topics/sub-topics/[id]",
    "/api/topics/sub-topics/[id]/claim",
    "/api/topics/sub-topics/[id]/return",
    "/api/topics/sub-topics/[id]/start-scripting",
  ]) {
    assert.equal(logs.filter((line) => line.includes(`\"route\":\"${route}\"`)).length, route === "/api/topics/sub-topics/[id]" ? 2 : 1, route);
  }
});

test("topics handler：鉴权依赖抛错时保留 thrown 观测语义", async () => {
  const response = await buildSubTopicsResponse(request("POST", {}), {
    requireActiveTeamContext: async () => {
      throw new Error("auth exploded");
    },
    createSubTopic: async () => ({ ok: true, value: {} }),
  }).catch((error) => error as Error);
  assert.equal((response as Error).message, "auth exploded");
});

test("topics POST：鉴权 thrown 仍只落一条 thrown 观测日志", async () => {
  const originalAuth = defaultSubTopicsRouteDeps.requireActiveTeamContext;
  const originalInfo = console.info;
  const logs: string[] = [];
  defaultSubTopicsRouteDeps.requireActiveTeamContext = async () => {
    throw new Error("auth exploded");
  };
  console.info = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    await assert.rejects(() => postSubTopics(request("POST", {})), /auth exploded/);
  } finally {
    defaultSubTopicsRouteDeps.requireActiveTeamContext = originalAuth;
    console.info = originalInfo;
  }
  const routeLogs = logs.filter((line) => line.includes("/api/topics/sub-topics"));
  assert.equal(routeLogs.length, 1);
  assert.match(routeLogs[0]!, /\"outcome\":\"thrown\"/);
});
