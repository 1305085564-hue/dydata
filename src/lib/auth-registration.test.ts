import test from "node:test";
import assert from "node:assert/strict";

import { registerUser, type RegisterDependencies } from "./auth-registration";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function cloudBaseDependencies(overrides: Partial<RegisterDependencies> = {}) {
  const calls = {
    registerInput: null as Record<string, unknown> | null,
    signInInput: null as { email?: string; password: string } | null,
    signOutCount: 0,
    rollbackInput: null as Record<string, unknown> | null,
    logs: [] as unknown[][],
  };

  const admin = {
    rpc: async () => ({ data: null, error: null }),
  };

  const deps: RegisterDependencies = {
    getTeamOptions: async () => [{ id: "t1", name: "一队" }],
    createClient: async () => ({
      auth: {
        signInWithPassword: async (credentials) => {
          calls.signInInput = credentials;
          return { data: { user: { id: "11111111-1111-4111-8111-111111111111" }, session: null }, error: null };
        },
        signOut: async () => {
          calls.signOutCount += 1;
          return { error: null };
        },
      },
    }),
    createAdminClient: () => admin as never,
    redirect: ((path: string) => { throw new Error(`redirect:${path}`); }) as never,
    logError: (...args: unknown[]) => calls.logs.push(args),
    getCloudBaseProject: () => "dydata-d6g0gd1v37fcddf21",
    createRequestId: () => "req-cb-1",
    registerCloudBaseEmployee: async (_admin, input) => {
      calls.registerInput = input;
      return { ok: true, userId: "11111111-1111-4111-8111-111111111111", email: input.email };
    },
    rollbackCloudBaseEmployee: async (_admin, input) => {
      calls.rollbackInput = input;
      return { ok: true };
    },
    ...overrides,
  };

  return { calls, deps };
}

test("空字段、无效邮箱、短密码、超长密码和无效团队返回明确提示", async () => {
  const { deps } = cloudBaseDependencies();
  assert.deepEqual(await registerUser({ error: null }, form({}), deps), { error: "请完整填写姓名、邮箱和密码。" });
  assert.deepEqual(await registerUser({ error: null }, form({ name: "小陈", email: "not-an-email", password: "123456", teamId: "t1" }), deps), { error: "请输入有效的邮箱地址。" });
  assert.deepEqual(await registerUser({ error: null }, form({ name: "小陈", email: "a@example.com", password: "123", teamId: "t1" }), deps), { error: "密码至少需要 6 位。" });
  assert.deepEqual(await registerUser({ error: null }, form({ name: "小陈", email: "a@example.com", password: "a".repeat(73), teamId: "t1" }), deps), { error: "密码长度不能超过 72 位。" });
  assert.deepEqual(await registerUser({ error: null }, form({ name: "小陈", email: "a@example.com", password: "123456", teamId: "missing" }), deps), { error: "还没选要申请加入的团队。" });
});

test("CloudBase 正常注册：服务端单事务建号并通过正式登录自检后跳转", async () => {
  const { calls, deps } = cloudBaseDependencies();

  await assert.rejects(
    () => registerUser({ error: null }, form({ name: "小陈", email: "  New@Example.com ", password: "secret123", teamId: "t1" }), deps, "/topics"),
    /redirect:\/topics/,
  );

  assert.deepEqual(calls.registerInput, {
    project: "dydata-d6g0gd1v37fcddf21",
    email: "new@example.com",
    password: "secret123",
    name: "小陈",
    teamId: "t1",
  });
  assert.deepEqual(calls.signInInput, { email: "new@example.com", password: "secret123" });
  assert.equal(calls.rollbackInput, null);
  assert.equal(calls.logs.length, 0);
});

test("CloudBase 重复注册：返回具体中文提示与请求编号，不触发登录自检且落日志", async () => {
  const { calls, deps } = cloudBaseDependencies({
    createRequestId: () => "req-dup-01",
    registerCloudBaseEmployee: async () => ({
      ok: false,
      code: "email_already_exists",
      detail: "duplicate_email",
    }),
  });

  const result = await registerUser(
    { error: null },
    form({ name: "小陈", email: "dup@example.com", password: "secret123", teamId: "t1" }),
    deps,
  );

  assert.deepEqual(result, { error: "这个邮箱已经注册过，请直接登录或联系管理员（编号 req-dup-01）" });
  assert.equal(calls.signInInput, null);
  assert.equal(calls.rollbackInput, null);
  assert.equal(calls.logs.length, 1);
  assert.match(JSON.stringify(calls.logs[0]), /req-dup-01/);
  assert.doesNotMatch(JSON.stringify(calls.logs[0]), /secret123/);
});

test("CloudBase 建号失败：返回具体中文提示与请求编号并记录服务端原因", async () => {
  const { calls, deps } = cloudBaseDependencies({
    createRequestId: () => "req-fail-01",
    registerCloudBaseEmployee: async () => ({
      ok: false,
      code: "account_create_failed",
      detail: "profile_write_failed",
    }),
  });

  const result = await registerUser(
    { error: null },
    form({ name: "小陈", email: "fail@example.com", password: "secret123", teamId: "t1" }),
    deps,
  );

  assert.deepEqual(result, { error: "账号创建失败，请稍后重试或联系管理员（编号 req-fail-01）" });
  assert.equal(calls.signInInput, null);
  assert.equal(calls.rollbackInput, null);
  assert.equal(calls.logs.length, 1);
  assert.match(JSON.stringify(calls.logs[0]), /profile_write_failed/);
});

test("CloudBase 建号成功但登录自检失败：删掉刚建账号与资料，提示联系管理员带编号并落日志", async () => {
  const { calls, deps } = cloudBaseDependencies({
    createRequestId: () => "req-selfcheck-01",
    createClient: async () => ({
      auth: {
        signInWithPassword: async (credentials) => {
          calls.signInInput = credentials;
          return { data: { user: null, session: null }, error: { code: "invalid_credentials", message: "邮箱或密码不正确", status: 401 } };
        },
        signOut: async () => {
          calls.signOutCount += 1;
          return { error: null };
        },
      },
    }),
  });

  const result = await registerUser(
    { error: null },
    form({ name: "小陈", email: "selfcheck@example.com", password: "secret123", teamId: "t1" }),
    deps,
  );

  assert.deepEqual(result, { error: "注册失败，请联系管理员（编号 req-selfcheck-01）" });
  assert.deepEqual(calls.rollbackInput, {
    project: "dydata-d6g0gd1v37fcddf21",
    userId: "11111111-1111-4111-8111-111111111111",
    email: "selfcheck@example.com",
  });
  assert.equal(calls.signOutCount, 1);
  assert.equal(calls.logs.length, 1);
  assert.match(JSON.stringify(calls.logs[0]), /cloudbase-login-self-check/);
  assert.match(JSON.stringify(calls.logs[0]), /req-selfcheck-01/);
  assert.doesNotMatch(JSON.stringify(calls.logs[0]), /secret123/);
});

test("CloudBase 自检失败且回滚也失败：两条失败都记入服务端日志，仍提示联系管理员带编号", async () => {
  const { calls, deps } = cloudBaseDependencies({
    createRequestId: () => "req-rollback-fail",
    createClient: async () => ({
      auth: {
        signInWithPassword: async () => ({
          data: { user: { id: "wrong-user-id" }, session: null },
          error: null,
        }),
        signOut: async () => {
          calls.signOutCount += 1;
          return { error: null };
        },
      },
    }),
    rollbackCloudBaseEmployee: async (_admin, input) => {
      calls.rollbackInput = input;
      return { ok: false, detail: "rollback_rpc_timeout" };
    },
  });

  const result = await registerUser(
    { error: null },
    form({ name: "小陈", email: "mismatch@example.com", password: "secret123", teamId: "t1" }),
    deps,
  );

  assert.deepEqual(result, { error: "注册失败，请联系管理员（编号 req-rollback-fail）" });
  assert.equal(calls.signOutCount, 1);
  assert.equal(calls.logs.length, 2);
  assert.match(JSON.stringify(calls.logs[0]), /subject_mismatch/);
  assert.match(JSON.stringify(calls.logs[1]), /rollback_rpc_timeout/);
});

test("R1 长度限制：64 字符邮箱通过并建号，65 字符邮箱与 101 字符姓名直接拦截且不调用建号函数", async () => {
  const email64 = `${"a".repeat(52)}@example.com`;
  assert.equal(email64.length, 64);

  const okCase = cloudBaseDependencies();
  await assert.rejects(
    () =>
      registerUser(
        { error: null },
        form({ name: "陈".repeat(100), email: email64, password: "secret123", teamId: "t1" }),
        okCase.deps,
        "/topics",
      ),
    /redirect:\/topics/,
  );
  assert.equal(okCase.calls.registerInput?.email, email64);

  const email65 = `${"a".repeat(53)}@example.com`;
  assert.equal(email65.length, 65);
  const longEmailCase = cloudBaseDependencies();
  const longEmailRes = await registerUser(
    { error: null },
    form({ name: "小陈", email: email65, password: "secret123", teamId: "t1" }),
    longEmailCase.deps,
  );
  assert.deepEqual(longEmailRes, { error: "邮箱太长，最多 64 个字符" });
  assert.equal(longEmailCase.calls.registerInput, null);
  assert.equal(longEmailCase.calls.signInInput, null);

  const longNameCase = cloudBaseDependencies();
  const longNameRes = await registerUser(
    { error: null },
    form({ name: "陈".repeat(101), email: "ok@example.com", password: "secret123", teamId: "t1" }),
    longNameCase.deps,
  );
  assert.deepEqual(longNameRes, { error: "姓名太长，最多 100 个字符" });
  assert.equal(longNameCase.calls.registerInput, null);
});

test("R10 团队查询异常：返回带请求编号的中文提示并记录服务端原因", async () => {
  const { calls, deps } = cloudBaseDependencies({
    createRequestId: () => "req-team-err",
    getTeamOptions: async () => {
      throw new Error("teams query timeout");
    },
  });

  const result = await registerUser(
    { error: null },
    form({ name: "小陈", email: "ok@example.com", password: "secret123", teamId: "t1" }),
    deps,
  );

  assert.deepEqual(result, { error: "团队列表加载失败，请稍后重试或联系管理员（编号 req-team-err）" });
  assert.equal(calls.registerInput, null);
  assert.equal(calls.logs.length, 1);
  assert.match(JSON.stringify(calls.logs[0]), /req-team-err/);
  assert.match(JSON.stringify(calls.logs[0]), /team-options/);
  assert.match(JSON.stringify(calls.logs[0]), /teams query timeout/);
});
