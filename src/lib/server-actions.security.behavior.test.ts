import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { before, beforeEach, mock } from "node:test";

if (process.env.DYDATA_SECURITY_ACTION_CHILD !== "1") {
  test("安全矩阵：真实 Server Actions 行为回归", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, DYDATA_SECURITY_ACTION_CHILD: "1" };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", "--test-reporter=tap", fileURLToPath(import.meta.url)], {
      cwd: process.cwd(), encoding: "utf8", timeout: 45000, env,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /# tests 7\b/);
    assert.match(result.stdout, /# pass 7\b/);
  });
} else {
  const actorId = "123e4567-e89b-42d3-a456-426614174001";
  const accountId = "223e4567-e89b-42d3-a456-426614174002";
  let signedIn = true;
  let membership = "active";
  let dbError = false;
  let writes: Array<{ table: string; filters: Map<string, unknown>; payload: unknown }> = [];
  let refreshed: string[] = [];
  let account: typeof import("./account-actions");
  let admin: typeof import("@/app/(app)/admin/actions");
  let join: typeof import("@/app/(app)/_components/join-actions");
  let reviews: typeof import("@/app/(app)/admin/join-request-actions");
  let dashboard: typeof import("@/app/(app)/dashboard/actions");

  function db() {
    return {
      auth: { getUser: async () => ({ data: { user: signedIn ? { id: actorId } : null }, error: null }) },
      from(table: string) {
        const filters = new Map<string, unknown>();
        let mutation = false;
        const query = {
          select() { return query; },
          eq(key: string, value: unknown) { filters.set(key, value); return query; },
          insert(payload: unknown) { mutation = true; writes.push({ table, filters, payload }); return query; },
          update(payload: unknown) { mutation = true; writes.push({ table, filters, payload }); return query; },
          delete() { mutation = true; writes.push({ table, filters, payload: null }); return query; },
          single: async () => result(),
          maybeSingle: async () => result(),
          then(done: (value: unknown) => void) { done(result()); },
        };
        function result() {
          if (mutation) return dbError ? { data: null, error: { message: "column private_profiles.secret violates constraint accounts_profile_id_fkey", code: "42703" } }
            : { data: filters.get("id") === "323e4567-e89b-42d3-a456-426614174003" ? [] : [{ id: accountId }], error: null, count: 1 };
          return { data: { id: actorId, name: "合成成员", role: "member", company_role: "member", team_id: null, membership_status: membership }, error: null };
        }
        return query;
      },
    };
  }
  before(async () => {
    const modules = mock as unknown as { module: (id: string, options: { namedExports: Record<string, unknown> }) => void };
    for (const [file, namedExports] of [
      ["src/lib/supabase/server.ts", { createClient: async () => db() }],
      ["src/lib/supabase/admin.ts", { createAdminClient: () => db() }],
    ] as const) modules.module(pathToFileURL(resolve(process.cwd(), file)).href, { namedExports });
    modules.module("next/cache", { namedExports: { revalidatePath: (path: string) => refreshed.push(path) } });
    account = await import("./account-actions");
    admin = await import("@/app/(app)/admin/actions");
    join = await import("@/app/(app)/_components/join-actions");
    reviews = await import("@/app/(app)/admin/join-request-actions");
    dashboard = await import("@/app/(app)/dashboard/actions");
  });
  beforeEach(() => { signedIn = true; membership = "active"; dbError = false; writes = []; refreshed = []; });

  test("个人资料与账号：底层数据库错误只返回稳定文案，正常写入仍成功", async () => {
    const operations = [() => account.updateProfile("姓名"), () => account.createAccount("账号"), () => account.updateAccountName(accountId, "新名"), () => account.updateAccountRemark(accountId, "备注")];
    dbError = true;
    for (const run of operations) {
      const response = await run();
      assert.equal(typeof response.error, "string");
      assert.doesNotMatch(JSON.stringify(response), /private_profiles|constraint|accounts_profile_id_fkey|42703/);
    }
    assert.deepEqual(refreshed, []);
    dbError = false;
    for (const run of operations) assert.deepEqual(await run(), { success: true });
    assert.equal(writes.length, 8);
    assert.equal(writes[2].filters.get("profile_id"), actorId);
  });
  test("个人账号：畸形编号、非字符串、过长文本不写库；越权编号不会报告成功", async () => {
    for (const run of [() => account.createAccount("x".repeat(31)), () => account.updateProfile(123 as never), () => account.updateAccountName("bad-id", "名称"), () => account.updateAccountRemark(accountId, {} as never)]) {
      assert.equal(typeof (await run()).error, "string");
    }
    assert.equal(writes.length, 0);
    const result = await account.updateAccountName("323e4567-e89b-42d3-a456-426614174003", "名称");
    assert.equal(result.error, "未保存：账号不存在或无权限修改");
    assert.equal(writes[0].filters.get("profile_id"), actorId);
  });
  test("管理动作：所有编号/枚举/长度异常在业务查询前明确拒绝", async () => {
    for (const run of [
      () => admin.reviewExemptionRequest({ requestId: accountId, decision: "forged" as never }),
      () => admin.updateMemberTeam("bad-id", null),
      () => admin.assignOrphanExemptionMember(accountId, actorId, "bad-id"),
      () => admin.rejectOrphanExemptionRequest("bad-id"),
      () => admin.archiveMember(actorId, "x".repeat(501)),
      () => admin.restoreMember("bad-id"),
      () => admin.resetMemberPassword(actorId, "x".repeat(129)),
      () => admin.changeRole(actorId, "owner" as never),
      () => admin.createTeam("x".repeat(31)),
      () => admin.deleteTeam("bad-id"),
    ]) assert.equal(typeof (await run()).error, "string");
    assert.equal(writes.length, 0);
    assert.deepEqual(await admin.changeRole(accountId, "admin"), { error: "无权限" });
    assert.equal(writes.length, 0);
  });
  test("入团申请：非法编号拒绝，正常申请绑定本人，撤销绑定本人及待审状态", async () => {
    assert.equal((await join.submitJoinRequestAction("bad-id")).ok, false);
    assert.equal((await join.cancelJoinRequestAction("bad-id")).ok, false);
    assert.equal(writes.length, 0);
    assert.deepEqual(await join.submitJoinRequestAction(accountId), { ok: true });
    assert.deepEqual(writes[0].payload, { applicant_user_id: actorId, target_team_id: accountId });
    assert.deepEqual(await join.cancelJoinRequestAction(accountId), { ok: true });
    assert.equal(writes[1].filters.get("applicant_user_id"), actorId);
    assert.equal(writes[1].filters.get("status"), "pending");
  });
  test("入团审批：普通组员不能直接批准或拒绝", async () => {
    assert.deepEqual(await reviews.approveJoinRequestAction(accountId, null), { ok: false, error: "仅管理员可执行" });
    assert.deepEqual(await reviews.rejectJoinRequestAction(accountId, null), { ok: false, error: "仅管理员可执行" });
    assert.equal(writes.length, 0);
  });
  test("个人写入：未登录/归档被统一入口拦截", async () => {
    signedIn = false;
    assert.deepEqual(await account.createAccount("账号"), { error: "请先登录" });
    assert.deepEqual(await join.submitJoinRequestAction(accountId), { ok: false, error: "请先登录" });
    signedIn = true; membership = "archived";
    assert.deepEqual(await account.createAccount("账号"), { error: "当前账号暂不能使用" });
    assert.equal(writes.length, 0);
  });
  test("公开动作模块不再导出可注入连接与身份的测试辅助函数", () => {
    assert.equal(Object.hasOwn(dashboard, "submitExemptionRequestWithClient"), false);
    assert.equal(typeof dashboard.submitExemptionRequest, "function");
  });
}
