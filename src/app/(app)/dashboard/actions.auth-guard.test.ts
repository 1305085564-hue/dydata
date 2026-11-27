import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after, before, beforeEach, mock } from "node:test";

// npm test 没有打开 Node 模块替身功能；在同一个测试文件的子进程内运行真实 Action。
// 仅替换数据库适配器和 Next 缓存边界，鉴权、权限、团队范围及业务模块全部真实导入。
if (process.env.DYDATA_AUTH_GUARD_CHILD !== "1") {
  test("真实工作台 Action 鉴权场景全部执行且不是零测试假绿", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, DYDATA_AUTH_GUARD_CHILD: "1" };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-test-module-mocks", "--import", "tsx", "--test", "--test-reporter=tap",
      fileURLToPath(import.meta.url),
    ], { cwd: process.cwd(), encoding: "utf8", timeout: 45_000, env });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /# tests 25\b/);
    assert.match(result.stdout, /# pass 25\b/);
    assert.match(result.stdout, /# fail 0\b/);
  });
} else {
  const ACTOR = "123e4567-e89b-42d3-a456-426614174001";
  const ACCOUNT = "223e4567-e89b-42d3-a456-426614174002";
  const REPORT = "323e4567-e89b-42d3-a456-426614174003";
  const OTHER = "423e4567-e89b-42d3-a456-426614174004";
  let actions: typeof import("./actions");
  let signedIn = true;
  let membership = "active";
  let role = "member";
  let accountOwner = ACTOR;
  let reportOwner = ACTOR;
  let memberTeam = "team-other";
  let failProfile = false;
  let writeCalls: Array<{ table: string; operation: string; payload: unknown }> = [];
  let rpcCalls = 0;
  let refreshed: string[] = [];

  function db() {
    return {
      auth: { getUser: async () => ({ data: { user: signedIn ? { id: ACTOR, user_metadata: {} } : null }, error: null }) },
      from(table: string) {
        const filters = new Map<string, unknown>();
        const query = {
          select() { return query; },
          eq(key: string, value: unknown) { filters.set(key, value); return query; },
          in() { return query; },
          update(payload: unknown) { writeCalls.push({ table, operation: "update", payload }); return query; },
          insert(payload: unknown) { writeCalls.push({ table, operation: "insert", payload }); return query; },
          delete() { writeCalls.push({ table, operation: "delete", payload: null }); return query; },
          then(done: (value: unknown) => void) {
            done({ data: table === "profiles" ? [{ id: OTHER, team_id: memberTeam, membership_status: "active" }] : [], error: null });
          },
          single: async () => row(),
          maybeSingle: async () => row(),
        };
        function row() {
          if (table === "accounts") return { data: { id: ACCOUNT, profile_id: accountOwner }, error: null };
          if (table === "daily_reports") return { data: {
            id: REPORT, user_id: reportOwner, account_id: ACCOUNT, report_date: "2026-11-02",
            video_id: null, published_at: null, is_void: false,
            script_author_user_id: ACTOR, video_editor_user_id: null, operator_user_id: ACTOR,
          }, error: null };
          assert.equal(table, "profiles");
          assert.equal(filters.get("id"), ACTOR);
          return { data: failProfile ? null : {
            id: ACTOR, name: "合成测试成员", team_id: "team-own", membership_status: membership,
            role, company_role: role,
          }, error: failProfile ? { message: "private database detail", code: "PGRST116" } : null };
        }
        return query;
      },
      rpc: async () => { rpcCalls += 1; return { error: null }; },
    };
  }

  before(async () => {
    const modules = mock as unknown as { module: (id: string, options: { namedExports: Record<string, unknown> }) => void };
    for (const [file, namedExports] of [
      ["src/lib/supabase/server.ts", { createClient: async () => db() }],
      ["src/lib/supabase/admin.ts", { createAdminClient: () => db() }],
    ] as const) modules.module(pathToFileURL(resolve(process.cwd(), file)).href, { namedExports });
    modules.module("next/cache", { namedExports: { revalidatePath: (path: string) => { refreshed.push(path); } } });
    actions = await import("./actions");
  });

  beforeEach(() => {
    signedIn = true; membership = "active"; role = "member"; accountOwner = ACTOR;
    reportOwner = ACTOR; memberTeam = "team-other"; failProfile = false;
    writeCalls = []; rpcCalls = 0; refreshed = [];
  });
  after(() => mock.restoreAll());

  function form(external = false) {
    const data = new FormData();
    for (const [key, value] of Object.entries({
      account_id: ACCOUNT, report_id: REPORT, report_date: "2026-11-02", title: "合成日报",
      play_count: "100", likes: "2", comments: "1", shares: "1", favorites: "1", follower_gain: "0",
      script_author_user_id: external ? OTHER : ACTOR, video_editor_user_id: "", operator_user_id: ACTOR,
    })) data.set(key, value);
    return data;
  }
  const exemption = { mode: "yesterday" as const, category: "leave" as const, reason: "测试原因", dates: ["2026-11-02"] };
  const operations = [
    ["修改日报", () => actions.saveDailyReportOnlyEdit(form())],
    ["申请豁免", () => actions.submitExemptionRequest(exemption)],
    ["修改显示名称", () => actions.updateProfile("合成姓名")],
    ["创建账号", () => actions.createAccount("合成账号")],
    ["修改账号名", () => actions.updateAccountName(ACCOUNT, "合成新名")],
    ["修改账号备注", () => actions.updateAccountRemark(ACCOUNT, "合成备注")],
  ] as const;

  function noWrite() {
    assert.deepEqual(writeCalls, []);
    assert.equal(rpcCalls, 0);
    assert.deepEqual(refreshed, []);
  }
  for (const [name, run] of operations) {
    test(`${name}：未登录在写库前返回安全错误`, async () => {
      signedIn = false;
      assert.deepEqual(await run(), { error: "请先登录" });
      noWrite();
    });
    test(`${name}：归档账号在写库前被拒绝`, async () => {
      membership = "archived";
      const result = await run();
      assert.deepEqual(Object.keys(result), ["error"]);
      assert.equal(result.error, name === "申请豁免" ? "请先申请加入团队"
        : name === "修改日报" ? "当前账号暂不能修改日报" : "当前账号暂不能使用");
      noWrite();
    });
  }
  for (const [name, run] of operations.slice(2)) {
    test(`${name}：身份资料缺失不授予操作权限`, async () => {
      failProfile = true;
      assert.deepEqual(await run(), { error: "当前账号暂不能使用" });
      noWrite();
    });
  }
  test("修改日报：账号属于他人时拒绝", async () => {
    accountOwner = OTHER;
    assert.match((await actions.saveDailyReportOnlyEdit(form())).error ?? "", /无权限/);
    noWrite();
  });
  test("修改日报：伪造他人日报编号时拒绝", async () => {
    reportOwner = OTHER;
    assert.equal((await actions.saveDailyReportOnlyEdit(form())).error, "这条日报与当前账号或日期不一致，或已关联作品，请重新打开修改");
    noWrite();
  });
  test("修改日报：跨团队责任人不能在管理客户端落库", async () => {
    assert.deepEqual(await actions.saveDailyReportOnlyEdit(form(true)), { error: "责任人必须是当前团队中的在职成员" });
    noWrite();
  });
  test("修改日报：读取资料失败只返回安全错误", async () => {
    failProfile = true;
    assert.deepEqual(await actions.saveDailyReportOnlyEdit(form()), { error: "当前账号暂不能修改日报" });
    noWrite();
  });
  test("修改日报：本人在职且责任人同团队时允许原子保存", async () => {
    memberTeam = "team-own";
    assert.deepEqual(await actions.saveDailyReportOnlyEdit(form(true)), {
      success: true, isUpdate: true, snapshotSyncStatus: "not_applicable",
    });
    assert.equal(rpcCalls, 1);
    assert.deepEqual(refreshed, ["/dashboard"]);
  });
  test("创建账号：本人在职时可以正常创建，证明替身没有把所有写入都拒绝", async () => {
    assert.deepEqual(await actions.createAccount("合成账号"), { success: true });
    assert.deepEqual(writeCalls, [{ table: "accounts", operation: "insert", payload: {
      profile_id: ACTOR, name: "合成账号", content_direction: null, remark: null,
    } }]);
  });
  for (const [name, run] of operations.slice(2, 5).filter(([name]) => name !== "创建账号")) {
    test(`${name}：未知身份不能获得写权限`, async () => {
      role = "unknown-role";
      assert.deepEqual(await run(), { error: "当前账号暂不能使用" });
      noWrite();
    });
  }
  test("修改账号备注：未知身份不能获得写权限", async () => {
    role = "unknown-role";
    assert.deepEqual(await actions.updateAccountRemark(ACCOUNT, "备注"), { error: "当前账号暂不能使用" });
    noWrite();
  });
}
