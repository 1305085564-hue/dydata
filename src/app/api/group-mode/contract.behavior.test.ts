import assert from "node:assert/strict";
import test from "node:test";

import {
  POST as postEnter,
  defaultGroupModeEnterDeps,
  buildGroupModeEnterResponse,
} from "@/app/api/group-mode/enter/route";
import {
  POST as postExit,
  defaultGroupModeExitDeps,
  buildGroupModeExitResponse,
} from "@/app/api/group-mode/exit/route";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const LAYERED_FIELDS = [
  "businessSucceeded",
  "permissionChecked",
  "auditStatus",
  "employeeNotificationStatus",
  "todoStatus",
  "compensationRequired",
] as const;

function request() {
  return new Request("http://localhost/api/group-mode", {
    method: "POST",
    headers: { "x-dydata-request-id": REQUEST_ID },
  });
}

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function assertLayered(body: Record<string, unknown>, label: string) {
  for (const field of LAYERED_FIELDS) assert.ok(field in body, `${label} 缺少 ${field}`);
}

function auth() {
  return { user: { id: "owner-1" }, supabase: {} as never } as never;
}

test("group-mode/enter：资格拒绝、依赖抛错、成功响应都带分层结果", async () => {
  const rejected = await buildGroupModeEnterResponse(request(), {
    getGroupModeUser: async () => auth(),
    enterGroupMode: async () => ({ ok: false as const, status: 403 as const, message: "没有集团权限资格" }),
    groupModeCookieOptions: () => ({ httpOnly: true, secure: false, sameSite: "strict" as const, path: "/" }),
  } as never);
  assert.equal(rejected.status, 403);
  const rejectedBody = await bodyOf(rejected);
  assertLayered(rejectedBody, "group-mode/enter rejected");
  assert.equal(rejectedBody.businessSucceeded, false);
  assert.equal(rejectedBody.error, "没有集团权限资格");

  const thrown = await buildGroupModeEnterResponse(request(), {
    getGroupModeUser: async () => auth(),
    enterGroupMode: async () => { throw new Error("db down"); },
    groupModeCookieOptions: () => ({ httpOnly: true, secure: false, sameSite: "strict" as const, path: "/" }),
  } as never);
  assert.equal(thrown.status, 500);
  const thrownBody = await bodyOf(thrown);
  assertLayered(thrownBody, "group-mode/enter thrown");
  assert.equal(thrownBody.businessSucceeded, false);

  const success = await buildGroupModeEnterResponse(request(), {
    getGroupModeUser: async () => auth(),
    enterGroupMode: async () => ({ ok: true as const, token: "token-1", expiresAt: null }),
    groupModeCookieOptions: () => ({ httpOnly: true, secure: false, sameSite: "strict" as const, path: "/" }),
  } as never);
  assert.equal(success.status, 200);
  const successBody = await bodyOf(success);
  assertLayered(successBody, "group-mode/enter success");
  assert.equal(successBody.businessSucceeded, true);
  assert.equal(successBody.active, true);
  assert.ok(success.headers.get("set-cookie")?.includes("dydata-group-mode"));
});

test("group-mode/exit：退出依赖失败明确 500，成功撤销后清理 cookie", async () => {
  const base = {
    getGroupModeUser: async () => auth(),
    groupModeCookieOptions: () => ({ httpOnly: true, secure: false, sameSite: "strict" as const, path: "/" }),
    getCookies: async () => ({ get: () => ({ value: "token-1" }) }) as never,
  };
  const failed = await buildGroupModeExitResponse(request(), {
    ...base,
    exitGroupMode: async () => { throw new Error("revoke failed"); },
  } as never);
  assert.equal(failed.status, 500);
  const failedBody = await bodyOf(failed);
  assertLayered(failedBody, "group-mode/exit failed");
  assert.equal(failedBody.businessSucceeded, false);

  let revoked: string | undefined;
  const success = await buildGroupModeExitResponse(request(), {
    ...base,
    exitGroupMode: async (_userId: string, token: string | undefined) => { revoked = token; },
  } as never);
  assert.equal(success.status, 200);
  const successBody = await bodyOf(success);
  assertLayered(successBody, "group-mode/exit success");
  assert.equal(successBody.businessSucceeded, true);
  assert.equal(successBody.active, false);
  assert.equal(revoked, "token-1");
  assert.ok(success.headers.get("set-cookie")?.includes("Max-Age=0"));
});

test("group-mode：单请求只落一条观测日志，并回传 request id", async () => {
  const originalAuth = defaultGroupModeEnterDeps.getGroupModeUser;
  const originalEnter = defaultGroupModeEnterDeps.enterGroupMode;
  const originalInfo = console.info;
  const logs: string[] = [];
  defaultGroupModeEnterDeps.getGroupModeUser = async () => auth();
  defaultGroupModeEnterDeps.enterGroupMode = async () => ({ ok: false, status: 403, message: "写入失败" });
  console.info = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    const response = await postEnter(request());
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("x-dydata-request-id"), REQUEST_ID);
  } finally {
    defaultGroupModeEnterDeps.getGroupModeUser = originalAuth;
    defaultGroupModeEnterDeps.enterGroupMode = originalEnter;
    console.info = originalInfo;
  }
  assert.equal(logs.filter((line) => line.includes("/api/group-mode/enter")).length, 1);
});

test("group-mode/exit：未登录依赖拒绝不静默", async () => {
  const response = await buildGroupModeExitResponse(request(), {
    ...defaultGroupModeExitDeps,
    getGroupModeUser: async () => null,
  } as never);
  assert.equal(response.status, 401);
  const body = await bodyOf(response);
  assertLayered(body, "group-mode/exit unauthenticated");
  assert.equal(body.businessSucceeded, false);
  assert.equal(body.error, "未登录");
});

test("group-mode/exit：一次请求只落一条结构化观测日志", async () => {
  const originalUser = defaultGroupModeExitDeps.getGroupModeUser;
  const originalExit = defaultGroupModeExitDeps.exitGroupMode;
  const originalCookies = defaultGroupModeExitDeps.getCookies;
  const originalInfo = console.info;
  const logs: string[] = [];
  defaultGroupModeExitDeps.getGroupModeUser = async () => auth();
  defaultGroupModeExitDeps.exitGroupMode = async () => { throw new Error("revoke failed"); };
  defaultGroupModeExitDeps.getCookies = async () => ({ get: () => ({ value: "token-1" }) }) as never;
  console.info = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    const response = await postExit(request());
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("x-dydata-request-id"), REQUEST_ID);
  } finally {
    defaultGroupModeExitDeps.getGroupModeUser = originalUser;
    defaultGroupModeExitDeps.exitGroupMode = originalExit;
    defaultGroupModeExitDeps.getCookies = originalCookies;
    console.info = originalInfo;
  }
  assert.equal(logs.filter((line) => line.includes("/api/group-mode/exit")).length, 1);
});

test("group-mode enter POST：鉴权 thrown 仍只落一条 thrown 观测日志", async () => {
  const originalAuth = defaultGroupModeEnterDeps.getGroupModeUser;
  const originalInfo = console.info;
  const logs: string[] = [];
  defaultGroupModeEnterDeps.getGroupModeUser = async () => {
    throw new Error("auth exploded");
  };
  console.info = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    await assert.rejects(() => postEnter(request()), /auth exploded/);
  } finally {
    defaultGroupModeEnterDeps.getGroupModeUser = originalAuth;
    console.info = originalInfo;
  }
  const routeLogs = logs.filter((line) => line.includes("/api/group-mode/enter"));
  assert.equal(routeLogs.length, 1);
  assert.match(routeLogs[0]!, /\"outcome\":\"thrown\"/);
});
