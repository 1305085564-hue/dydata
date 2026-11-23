import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";

import { buildAccountPasswordResponse, type AccountPasswordDeps } from "./route-core";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

function signedIn() {
  return { supabase: {} as never, user: { id: USER_ID } };
}

function deps(input: {
  auth?: () => Promise<ReturnType<typeof signedIn> | { response: Response }>;
  rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown | null }>;
}): AccountPasswordDeps {
  return {
    requireSignedInUser: (input.auth ?? (async () => signedIn())) as never,
    createAdminClient: () => ({ rpc: input.rpc ?? (async () => ({ data: { ok: true, subject: USER_ID }, error: null })) }),
    cloudBaseEnvironmentId: () => "dydata-test",
  };
}

async function json(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function request(body: unknown) {
  return new Request("http://localhost/api/account/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("未登录先于参数校验返回 401，并带 requestId", async () => {
  const response = await buildAccountPasswordResponse(
    request({ currentPassword: "old-pass", newPassword: "new-pass" }),
    deps({ auth: async () => ({ response: NextResponse.json({ error: "未登录" }, { status: 401 }) }) }),
    REQUEST_ID,
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await json(response), { error: "未登录", requestId: REQUEST_ID });
});

test("会话依赖异常返回脱敏 500，不把底层信息回给调用方", async () => {
  const response = await buildAccountPasswordResponse(
    request({ currentPassword: "old-pass", newPassword: "new-pass" }),
    deps({ auth: async () => { throw new Error("session-secret"); } }),
    REQUEST_ID,
  );
  assert.equal(response.status, 500);
  const body = await json(response);
  assert.equal(body.requestId, REQUEST_ID);
  assert.equal(body.error, `修改密码失败，请稍后重试（编号：${REQUEST_ID}）`);
  assert.doesNotMatch(JSON.stringify(body), /session-secret/);
});

test("非法 JSON、参数非法和新旧密码相同均返回 400", async () => {
  const malformed = await buildAccountPasswordResponse(
    new Request("http://localhost/api/account/password", { method: "POST", body: "{" }),
    deps({}),
    REQUEST_ID,
  );
  assert.equal(malformed.status, 400);
  assert.equal((await json(malformed)).requestId, REQUEST_ID);

  const invalid = await buildAccountPasswordResponse(request({ currentPassword: "old-pass" }), deps({}), REQUEST_ID);
  assert.equal(invalid.status, 400);

  const same = await buildAccountPasswordResponse(
    request({ currentPassword: "same-pass", newPassword: "same-pass" }),
    deps({}),
    REQUEST_ID,
  );
  assert.equal(same.status, 400);
  assert.equal((await json(same)).error, "新密码不能与当前密码相同");
});

test("旧密码错误返回稳定 400 文案，不回传底层信息", async () => {
  const response = await buildAccountPasswordResponse(
    request({ currentPassword: "wrong-pass", newPassword: "new-pass" }),
    deps({ rpc: async () => ({ data: { ok: false, code: "invalid_old_password" }, error: null }) }),
    REQUEST_ID,
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await json(response), {
    error: "当前密码不正确",
    code: "invalid_old_password",
    requestId: REQUEST_ID,
  });
});

test("无密码账号返回明确业务错误", async () => {
  const response = await buildAccountPasswordResponse(
    request({ currentPassword: "old-pass", newPassword: "new-pass" }),
    deps({ rpc: async () => ({ data: { ok: false, code: "password_not_set" }, error: null }) }),
    REQUEST_ID,
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await json(response), {
    error: "当前账号尚未设置密码，请联系管理员重置",
    code: "password_not_set",
    requestId: REQUEST_ID,
  });
});

test("RPC 异常返回 500、requestId 和脱敏文案", async () => {
  const response = await buildAccountPasswordResponse(
    request({ currentPassword: "old-pass", newPassword: "new-pass" }),
    deps({ rpc: async () => { throw new Error("secret-password hash=private"); } }),
    REQUEST_ID,
  );
  assert.equal(response.status, 500);
  const body = await json(response);
  assert.equal(body.requestId, REQUEST_ID);
  assert.equal(body.error, `修改密码失败，请稍后重试（编号：${REQUEST_ID}）`);
  assert.doesNotMatch(JSON.stringify(body), /secret-password|private/);
});

test("成功使用登录态 user.id 调用 RPC，规范化新密码且不接受前端 userId", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let unexpectedCalls = 0;
  const response = await buildAccountPasswordResponse(
    request({ currentPassword: "old-pass", newPassword: "  new-pass  " }),
    deps({ rpc: async (name, args) => { calls.push({ name, args }); return { data: { ok: true, subject: USER_ID }, error: null }; } }),
    REQUEST_ID,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), { ok: true, requestId: REQUEST_ID });
  assert.deepEqual(calls, [{
    name: "cloudbase_change_own_password",
    args: {
      p_subject: USER_ID,
      p_old_password: "old-pass",
      p_new_password: "new-pass",
      p_project: "dydata-test",
    },
  }]);

  const ignoredUserId = await buildAccountPasswordResponse(
    request({ currentPassword: "old-pass", newPassword: "new-pass", userId: "other-user" }),
    deps({ rpc: async () => { unexpectedCalls += 1; return { data: null, error: null }; } }),
    REQUEST_ID,
  );
  assert.equal(ignoredUserId.status, 400);
  assert.equal(calls.length, 1);
  assert.equal(unexpectedCalls, 0);
});
