import test from "node:test";
import assert from "node:assert/strict";

import {
  buildModifyUserRequest,
  CloudBaseManagementError,
  createCloudBaseManagerClient,
  createCloudBaseUserManagement,
  getCloudBaseManagerConfig,
  mapSupabaseBanDuration,
} from "./management";

test("ban_duration maps only the archive constant to BLOCKED and none to ACTIVE", () => {
  assert.equal(mapSupabaseBanDuration("none"), "ACTIVE");
  assert.equal(mapSupabaseBanDuration("876000h"), "BLOCKED");
  assert.equal(mapSupabaseBanDuration("1h30m"), null);
  assert.equal(mapSupabaseBanDuration("1h"), null);
  assert.equal(mapSupabaseBanDuration("0s"), null);
  assert.equal(mapSupabaseBanDuration("NaNh"), null);
  assert.equal(mapSupabaseBanDuration("forever"), null);
});

test("updateUserById sends only the supported status and returns the verified auth user", async () => {
  const calls: unknown[] = [];
  const subject = "employee-test-subject";
  const user = { id: subject, email: "employee@example.com", user_metadata: { role: "member" }, banned_until: "infinity" };
  const management = createCloudBaseUserManagement({
    createManager: () => ({
      user: {
        async modifyUser(options) {
          calls.push(options);
          return { Data: { Success: true }, RequestId: "request-1" };
        },
      },
    }),
    async getUserById(id) {
      calls.push({ lookup: id });
      return { user };
    },
  });

  const result = await management.updateUserById(subject, { ban_duration: "876000h" });
  assert.deepEqual(calls, [
    { uid: subject, userStatus: "BLOCKED" },
    { lookup: subject },
  ]);
  assert.deepEqual(result, { data: { user }, error: null });
});

test("none unfreezes with ACTIVE and reads the user back again", async () => {
  let modifiedStatus = "";
  const user = { id: "subject", banned_until: null };
  const management = createCloudBaseUserManagement({
    createManager: () => ({ user: { async modifyUser(options) { modifiedStatus = options.userStatus; return { Data: { Success: true } }; } } }),
    async getUserById() { return { user }; },
  });
  const result = await management.updateUserById("subject", { ban_duration: "none" });
  assert.equal(modifiedStatus, "ACTIVE");
  assert.equal(result.data?.user, user);
  assert.equal(result.error, null);
});

test("waits for the read-only user projection to reflect BLOCKED without repeating the SDK write", async () => {
  const modifyCalls: unknown[] = [];
  const readStates = [null, "infinity"];
  const sleeps: number[] = [];
  const management = createCloudBaseUserManagement({
    createManager: () => ({
      user: { async modifyUser(options) { modifyCalls.push(options); return { Data: { Success: true } }; } },
    }),
    async getUserById(id) {
      return { user: { id, banned_until: readStates.shift() ?? null } };
    },
    readBackAttempts: 3,
    readBackIntervalMs: 7,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
  });
  const result = await management.updateUserById("subject", { ban_duration: "876000h" });
  assert.equal(result.error, null);
  assert.equal((result.data?.user as { banned_until?: unknown }).banned_until, "infinity");
  assert.deepEqual(modifyCalls, [{ uid: "subject", userStatus: "BLOCKED" }]);
  assert.deepEqual(sleeps, [7]);
});

test("stale user projection times out with explicit pending and never reports success", async () => {
  let modifyCalls = 0;
  let readCalls = 0;
  const management = createCloudBaseUserManagement({
    createManager: () => ({
      user: { async modifyUser() { modifyCalls += 1; return { Data: { Success: true } }; } },
    }),
    async getUserById(id) {
      readCalls += 1;
      return { user: { id, banned_until: null } };
    },
    readBackAttempts: 3,
    sleep: async () => {},
  });
  const result = await management.updateUserById("subject", { ban_duration: "876000h" });
  assert.equal(result.data?.user, null);
  assert.equal(result.error?.code, "status_pending");
  assert.equal(modifyCalls, 1);
  assert.equal(readCalls, 3);
});

test("rejects password and unrelated auth fields without calling CloudBase", async () => {
  let managerCalls = 0;
  let lookupCalls = 0;
  const management = createCloudBaseUserManagement({
    createManager: () => { managerCalls += 1; throw new Error("must not run"); },
    async getUserById() { lookupCalls += 1; return { user: null }; },
  });
  const password = await management.updateUserById("subject", { password: "new-password" });
  const metadata = await management.updateUserById("subject", { user_metadata: { team_id: "team" } });
  const mixed = await management.updateUserById("subject", { ban_duration: "none", email: "changed@example.com" });
  assert.equal(password.error?.code, "unsupported_operation");
  assert.equal(metadata.error?.code, "unsupported_operation");
  assert.equal(mixed.error?.code, "unsupported_operation");
  assert.equal(managerCalls, 0);
  assert.equal(lookupCalls, 0);
});

test("invalid duration is rejected without calling manager or claiming success", async () => {
  let calls = 0;
  const management = createCloudBaseUserManagement({
    createManager: () => { calls += 1; return { user: { async modifyUser() { calls += 1; return { Data: { Success: true } }; } } }; },
    async getUserById() { calls += 1; return { user: { id: "subject" } }; },
  });
  const result = await management.updateUserById("subject", { ban_duration: "forever" });
  assert.equal(result.error?.code, "invalid_ban_duration");
  assert.equal(calls, 0);
});

test("management client fails clearly when server credentials are absent", () => {
  assert.throws(
    () => createCloudBaseManagerClient({} as unknown as NodeJS.ProcessEnv),
    (error: Error & { code?: string }) => error.code === "management_unconfigured" && error.message.includes("未配置服务端凭据"),
  );
});

test("manager config supports dedicated credentials without a session token and optional STS token", () => {
  const base = { CLOUDBASE_ENV_ID: "test-env", CLOUDBASE_SECRET_ID: "test-id", CLOUDBASE_SECRET_KEY: "test-key" } as unknown as NodeJS.ProcessEnv;
  const permanent = getCloudBaseManagerConfig(base);
  assert.equal(permanent.envId, "test-env");
  assert.equal(permanent.secretId, "test-id");
  assert.equal(permanent.secretKey, "test-key");
  assert.equal("token" in permanent, false);

  const temporary = getCloudBaseManagerConfig({ ...base, CLOUDBASE_SESSION_TOKEN: "test-session" });
  assert.equal(temporary.token, "test-session");
});

test("ModifyUser request matches a fixed TC3 signature vector", () => {
  const request = buildModifyUserRequest({
    envId: "env-for-test",
    secretId: "AKIDEXAMPLE123",
    secretKey: "test-secret-key-for-tc3-vector",
  }, { uid: "user-42", userStatus: "BLOCKED" }, 1_793_491_200);

  assert.equal(request.url, "https://tcb.tencentcloudapi.com/");
  assert.equal(request.body, '{"EnvId":"env-for-test","Uid":"user-42","UserStatus":"BLOCKED"}');
  assert.deepEqual(request.headers, {
    Authorization: "TC3-HMAC-SHA256 Credential=AKIDEXAMPLE123/2026-11-01/tcb/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=f877119e1206327ecce791cc2124e2c131dad41d1ac37d650885297bae4f8c2a",
    "Content-Type": "application/json; charset=utf-8",
    Host: "tcb.tencentcloudapi.com",
    "X-TC-Action": "ModifyUser",
    "X-TC-Timestamp": "1793491200",
    "X-TC-Version": "2018-06-08",
  });
});

test("ModifyUser includes and signs the optional CloudBase session token", () => {
  const request = buildModifyUserRequest({
    envId: "env-for-test",
    secretId: "AKIDEXAMPLE123",
    secretKey: "test-secret-key-for-tc3-vector",
    token: "StS-Token-Mixed-Case-123",
  }, { uid: "user-42", userStatus: "BLOCKED" }, 1_793_491_200);

  assert.equal(request.headers["X-TC-Token"], "StS-Token-Mixed-Case-123");
  assert.equal(request.headers.Authorization, "TC3-HMAC-SHA256 Credential=AKIDEXAMPLE123/2026-11-01/tcb/tc3_request, SignedHeaders=content-type;host;x-tc-action;x-tc-token, Signature=bc60b54bb4557fa0549192663a50b6dde0c604d9ad94faf4ca694af68005b6e1");
});

test("ModifyUser sends signed headers and unwraps the official API response", async () => {
  const captured: Array<{ url: string; init: RequestInit }> = [];
  const env = {
    CLOUDBASE_ENV_ID: "env-for-test",
    CLOUDBASE_SECRET_ID: "AKIDEXAMPLE123",
    CLOUDBASE_SECRET_KEY: "test-secret-key-for-tc3-vector",
    CLOUDBASE_SESSION_TOKEN: "StS-Token-Mixed-Case-123",
  } as unknown as NodeJS.ProcessEnv;
  const client = createCloudBaseManagerClient(env, {
    now: () => 1_793_491_200_000,
    fetcher: async (input, init) => {
      captured.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ Response: { Data: { Success: true }, RequestId: "request-1" } }), { status: 200 });
    },
  });

  const result = await client.user.modifyUser({ uid: "user-42", userStatus: "BLOCKED" });
  assert.deepEqual(result, { Data: { Success: true }, RequestId: "request-1" });
  assert.equal(captured[0]?.url, "https://tcb.tencentcloudapi.com/");
  assert.equal(new Headers(captured[0]?.init.headers).get("x-tc-action"), "ModifyUser");
  assert.equal(new Headers(captured[0]?.init.headers).get("x-tc-version"), "2018-06-08");
  assert.equal(new Headers(captured[0]?.init.headers).get("x-tc-token"), "StS-Token-Mixed-Case-123");
  assert.equal(captured[0]?.init.body, '{"EnvId":"env-for-test","Uid":"user-42","UserStatus":"BLOCKED"}');
  assert.equal(captured[0]?.init.method, "POST");
});

test("ModifyUser API and timeout errors do not expose credentials or response details", async () => {
  const secretId = "secret-id-sensitive";
  const secretKey = "secret-key-sensitive";
  const sessionToken = "session-token-sensitive";
  const env = {
    CLOUDBASE_ENV_ID: "env-for-test",
    CLOUDBASE_SECRET_ID: secretId,
    CLOUDBASE_SECRET_KEY: secretKey,
    CLOUDBASE_SESSION_TOKEN: sessionToken,
  } as unknown as NodeJS.ProcessEnv;
  const errorResponse = createCloudBaseManagerClient(env, {
    fetcher: async () => new Response(JSON.stringify({ Response: { Error: { Message: `${secretId} ${secretKey} ${sessionToken}` } } }), { status: 403 }),
  });
  const assertSafeError = (error: unknown) => {
    assert.ok(error instanceof CloudBaseManagementError);
    assert.equal(error.message, "CloudBase 用户状态修改失败");
    assert.equal(error.status, 502);
    for (const sensitive of [secretId, secretKey, sessionToken]) assert.equal(error.message.includes(sensitive), false);
    return true;
  };
  await assert.rejects(errorResponse.user.modifyUser({ uid: "user-42", userStatus: "BLOCKED" }), assertSafeError);

  const timeoutResponse = createCloudBaseManagerClient(env, {
    timeoutMs: 5,
    fetcher: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error(`${secretId} ${secretKey} ${sessionToken}`)), { once: true });
    }),
  });
  await assert.rejects(timeoutResponse.user.modifyUser({ uid: "user-42", userStatus: "BLOCKED" }), assertSafeError);
});

test("never reports success when SDK or auth-user readback does not confirm the change", async () => {
  const managerFailure = createCloudBaseUserManagement({
    createManager: () => ({ user: { async modifyUser() { return { Data: { Success: false } }; } } }),
    async getUserById() { return { user: { id: "subject" } }; },
  });
  assert.equal((await managerFailure.updateUserById("subject", { ban_duration: "876000h" })).error?.code, "management_rejected");

  const missingReadback = createCloudBaseUserManagement({
    createManager: () => ({ user: { async modifyUser() { return { Data: { Success: true } }; } } }),
    async getUserById() { return { user: null }; },
    readBackAttempts: 1,
    sleep: async () => {},
  });
  const result = await missingReadback.updateUserById("subject", { ban_duration: "876000h" });
  assert.equal(result.error?.code, "status_pending");
  assert.equal(result.data?.user, null);
});
