import test from "node:test";
import assert from "node:assert/strict";

import { registerUser, type RegisterDependencies } from "./auth-registration";

function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }

function dependencies(overrides: Partial<RegisterDependencies> = {}): RegisterDependencies {
  const admin = { auth: { admin: { deleteUser: async () => ({ error: null }) } }, from: () => ({ insert: async () => ({ error: null }) }) };
  return {
    getTeamOptions: async () => [{ id: "t1", name: "一队" }],
    createClient: async () => ({ auth: { signUp: async () => ({ data: { user: { id: "u1", identities: [{}] }, session: {} }, error: null }), signOut: async () => ({ error: null }) } }),
    createAdminClient: () => admin as never,
    ensureDefaultDashboardAccount: async () => ({ created: true }),
    redirect: ((path: string) => { throw new Error(`redirect:${path}`); }) as never,
    logError: () => {},
    ...overrides,
  };
}

test("注册成功保留安全 next 并跳转", async () => {
  await assert.rejects(
    () => registerUser({ error: null }, form({ name: "小陈", email: "a@example.com", password: "123456", teamId: "t1" }), dependencies(), "/growth"),
    /redirect:\/growth/,
  );
});

test("空字段、短密码和无效团队返回错误", async () => {
  assert.deepEqual(await registerUser({ error: null }, form({}), dependencies()), { error: "请完整填写姓名、邮箱和密码。" });
  assert.deepEqual(await registerUser({ error: null }, form({ name: "小陈", email: "a@example.com", password: "123", teamId: "t1" }), dependencies()), { error: "密码至少需要 6 位。" });
  assert.deepEqual(await registerUser({ error: null }, form({ name: "小陈", email: "a@example.com", password: "123456", teamId: "missing" }), dependencies()), { error: "请选择要申请加入的团队。" });
});

test("注册服务错误返回安全提示", async () => {
  const deps = dependencies({ createClient: async () => ({ auth: { signUp: async () => ({ data: { user: null, session: null }, error: { message: "duplicate" } }), signOut: async () => ({ error: null }) } }) });
  assert.deepEqual(await registerUser({ error: null }, form({ name: "小陈", email: "a@example.com", password: "123456", teamId: "t1" }), deps), { error: "注册失败，请稍后重试。" });
});
