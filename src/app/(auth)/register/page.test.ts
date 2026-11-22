import test from "node:test";
import assert from "node:assert/strict";

import { registerUser, type RegisterDependencies } from "@/lib/auth-registration";

function createFormData() {
  const formData = new FormData();
  formData.set("name", "测试用户");
  formData.set("email", "test@example.com");
  formData.set("password", "password-123");
  formData.set("teamId", "team-1");
  return formData;
}

function createDependencies(overrides: Partial<RegisterDependencies> = {}) {
  const state = {
    rolledBack: false,
    hasSession: true,
    logs: [] as unknown[][],
    redirectPath: null as string | null,
  };

  const dependencies: RegisterDependencies = {
    getTeamOptions: async () => [{ id: "team-1", name: "测试团队" }],
    createClient: async () => ({
      auth: {
        signInWithPassword: async () => ({
          data: { user: { id: "user-1" }, session: { access_token: "token" } },
          error: null,
        }),
        signOut: async () => {
          state.hasSession = false;
          return { error: null };
        },
      },
    }),
    createAdminClient: () => ({ rpc: async () => ({ data: null, error: null }) }),
    redirect: (path: string): never => {
      state.redirectPath = path;
      throw new Error(`unexpected redirect: ${path}`);
    },
    logError: (...args: unknown[]) => state.logs.push(args),
    getCloudBaseProject: () => "dydata-d6g0gd1v37fcddf21",
    registerCloudBaseEmployee: async (_admin, input) => ({
      ok: true,
      userId: "user-1",
      email: input.email,
    }),
    rollbackCloudBaseEmployee: async () => {
      state.rolledBack = true;
      return { ok: true };
    },
    createRequestId: () => "req-page-1",
    ...overrides,
  };

  return { state, dependencies };
}

test("建号成功但自检登录失败会撤销刚建账号和本地会话", async () => {
  const { state, dependencies } = createDependencies({
    createClient: async () => ({
      auth: {
        signInWithPassword: async () => ({
          data: { user: null, session: null },
          error: { message: "invalid_credentials", code: "invalid_credentials", status: 401 },
        }),
        signOut: async () => {
          state.hasSession = false;
          return { error: null };
        },
      },
    }),
  });

  const result = await registerUser({ error: null }, createFormData(), dependencies);

  assert.equal(result.error, "注册失败，请联系管理员（编号 req-page-1）");
  assert.equal(state.rolledBack, true);
  assert.equal(state.hasSession, false);
  assert.equal(state.redirectPath, null);
});

test("重复邮箱直接拦截且不误删既有账号", async () => {
  const { state, dependencies } = createDependencies({
    registerCloudBaseEmployee: async () => ({
      ok: false,
      code: "email_already_exists",
      detail: "duplicate_email",
    }),
  });

  const result = await registerUser({ error: null }, createFormData(), dependencies);

  assert.equal(result.error, "这个邮箱已经注册过，请直接登录或联系管理员（编号 req-page-1）");
  assert.equal(state.rolledBack, false);
  assert.equal(state.hasSession, true);
  assert.equal(state.redirectPath, null);
  assert.equal(state.logs.length, 1);
});

test("注册后直接回到登录前请求的安全页面", async () => {
  const { state, dependencies } = createDependencies();

  await assert.rejects(
    () => registerUser({ error: null }, createFormData(), dependencies, "/violations?view=manage"),
    /unexpected redirect/,
  );

  assert.equal(state.redirectPath, "/violations?view=manage");
});
