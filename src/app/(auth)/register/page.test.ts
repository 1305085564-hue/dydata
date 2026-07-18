import test from "node:test";
import assert from "node:assert/strict";

import { registerUser, type RegisterDependencies } from "@/lib/auth-registration";

type FailureStage = "profile" | "account" | "join-request" | "success";

function createFormData() {
  const formData = new FormData();
  formData.set("name", "测试用户");
  formData.set("email", "test@example.com");
  formData.set("password", "password-123");
  formData.set("teamId", "team-1");
  return formData;
}

function createDependencies(
  stage: FailureStage,
  deleteError: { message: string } | null = null,
  identities: unknown[] | null = [{}],
): { state: { authUsers: Set<string>; hasSession: boolean; logs: unknown[][]; redirectPath: string | null }; dependencies: RegisterDependencies } {
  const state = {
    authUsers: new Set(["user-1"]),
    hasSession: true,
    logs: [] as unknown[][],
    redirectPath: null as string | null,
  };

  const serverClient = {
    auth: {
      signUp: async () => ({
        data: { user: { id: "user-1", identities }, session: { access_token: "token" } },
        error: null,
      }),
      signOut: async () => {
        state.hasSession = false;
        return { error: null };
      },
    },
  };

  const adminClient = {
    auth: {
      admin: {
        deleteUser: async (userId: string) => {
          if (!deleteError) state.authUsers.delete(userId);
          return { error: deleteError };
        },
      },
    },
    from: (table: "profiles" | "team_join_requests") => ({
      insert: async () => ({
        error:
          (table === "profiles" && stage === "profile") ||
          (table === "team_join_requests" && stage === "join-request")
            ? { message: `${table} write failed` }
            : null,
      }),
    }),
  };

  return {
    state,
    dependencies: {
      getTeamOptions: async () => [{ id: "team-1", name: "测试团队" }],
      createClient: async () => serverClient,
      createAdminClient: () => adminClient,
      ensureDefaultDashboardAccount: async () => {
        if (stage === "account") throw new Error("accounts write failed");
        return { created: true };
      },
      redirect: (path: string): never => {
        state.redirectPath = path;
        throw new Error(`unexpected redirect: ${path}`);
      },
      logError: (...args: unknown[]) => state.logs.push(args),
    },
  };
}

async function submitRegistration(dependencies: RegisterDependencies) {
  return registerUser({ error: null }, createFormData(), dependencies);
}

async function submitRegistrationWithNext(dependencies: RegisterDependencies, next: string) {
  return registerUser({ error: null }, createFormData(), dependencies, next);
}

for (const stage of ["profile", "account", "join-request"] as const) {
  test(`${stage} 创建失败会撤销 Auth 用户和本地会话`, async () => {
    const { state, dependencies } = createDependencies(stage);
    const result = await submitRegistration(dependencies);

    assert.equal(result.error, "注册未能完成，本次注册已撤销，请稍后重试。");
    assert.deepEqual([...state.authUsers], []);
    assert.equal(state.hasSession, false);
    assert.equal(state.redirectPath, null);
  });
}

test("撤销 Auth 用户失败时仅显示安全提示并记录服务端错误", async () => {
  const { state, dependencies } = createDependencies("profile", { message: "delete user failed" });

  const result = await submitRegistration(dependencies);

  assert.equal(result.error, "注册未能完成，账号清理遇到问题。请勿重复提交，请联系管理员处理。");
  assert.equal(state.hasSession, false);
  assert.equal(state.logs.length, 2);
  assert.doesNotMatch(result.error ?? "", /delete user failed|profiles write failed/);
});

test("重复邮箱的无身份记录结果不会误删既有 Auth 用户", async () => {
  const { state, dependencies } = createDependencies("profile", null, []);

  const result = await submitRegistration(dependencies);

  assert.equal(result.error, "注册失败，请稍后重试。");
  assert.deepEqual([...state.authUsers], ["user-1"]);
  assert.equal(state.hasSession, true);
  assert.equal(state.redirectPath, null);
  assert.equal(state.logs.length, 0);
});

test("注册后直接回到登录前请求的安全页面", async () => {
  const { state, dependencies } = createDependencies("success");

  await assert.rejects(
    () => submitRegistrationWithNext(dependencies, "/violations?view=manage"),
    /unexpected redirect/,
  );

  assert.equal(state.redirectPath, "/violations?view=manage");
});
