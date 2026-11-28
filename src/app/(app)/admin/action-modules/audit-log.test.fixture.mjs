import assert from "node:assert/strict";
import test, { before, mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

let db, auditAction, failAudit, rollbackFailure, auditAttempts, authWrites, invalidated;
let teams, members, exemptions;
const mockFile = (path, namedExports) => mock.module(pathToFileURL(resolve(path)).href, { namedExports });

before(async () => {
  mockFile("src/lib/supabase/server.ts", { createClient: async () => db });
  mockFile("src/lib/supabase/admin.ts", { createAdminClient: () => db });
  mock.module("next/cache", { namedExports: { revalidatePath: (path) => invalidated.push(path) } });
  teams = await import("./teams.ts");
  members = await import("./members.ts");
  exemptions = await import("./exemptions.ts");
});

async function setup(action, fail, scenario) {
  const { memoryDatabase } = await import("../../../../lib/testing/maintenance.test.fixture.ts");
  auditAction = action; failAudit = fail; rollbackFailure = false;
  auditAttempts = []; authWrites = []; invalidated = [];
  const targetTeam = scenario === "transfer" || scenario === "orphan" ? null : "team-1";
  const target = { id: "target", name: "成员", role: "member", company_role: "member", permissions: {}, team_id: targetTeam, membership_status: scenario === "restore" ? "archived" : "active", archive_snapshot: { team_id: "team-1" } };
  db = memoryDatabase({
    profiles: [{ id: "owner", name: "负责人", role: "owner", company_role: "company_owner", team_id: "team-1", membership_status: "active" }, target],
    teams: [{ id: "team-1", name: "本公司" }],
    exemption_request: [{ id: "request-1", applicant_user_id: "target", team_id: "team-1", request_status: "pending" }],
    audit_logs: [],
  });
  db.auth = {
    getUser: async () => ({ data: { user: { id: "owner" } }, error: null }),
    admin: {
      getUserById: async (id) => ({ data: { user: { id, user_metadata: {}, banned_until: "none" } }, error: null }),
      updateUserById: async (id, patch) => { authWrites.push({ id, patch }); return { data: { user: { id } }, error: null }; },
    },
  };
  db.rpc = async (name, args) => {
    assert.equal(name, "review_exemption_request_dates_atomically");
    assert.equal(args.p_request_id, "request-1");
    db.tables.exemption_request[0].request_status = args.p_decision;
    return { data: { status: args.p_decision }, error: null };
  };
  const from = db.from;
  db.from = (table) => {
    const query = from(table);
    if (table === "audit_logs") {
      const insert = query.insert;
      query.insert = (payload) => {
        auditAttempts.push(payload);
        if (failAudit && payload.action === auditAction) return Promise.resolve({ error: { message: "synthetic audit unavailable" } });
        return insert(payload);
      };
    }
    if (scenario === "delete" && table === "profiles") {
      // 数据库在删除前的成员清点结果为空（身份快照仍是已解析的负责人）。
      query.limit = () => Promise.resolve({ data: [], error: null });
    }
    if (table === "teams") {
      const remove = query.delete;
      query.delete = () => rollbackFailure ? { eq: async () => ({ error: { message: "rollback unavailable" } }) } : remove();
    }
    return query;
  };
}

const cases = [
  { title: "创建团队", action: "create_team", run: () => teams.createTeam("新团队"), scenario: "create", error: "创建团队失败：审计写入失败，已回滚", check: (fail) => assert.equal(db.tables.teams.some((row) => row.name === "新团队"), !fail) },
  { title: "删除团队", action: "delete_team", run: () => teams.deleteTeam("team-1"), scenario: "delete", check: () => assert.equal(db.tables.teams.length, 0) },
  { title: "移出团队", action: "remove_from_team", run: () => members.updateMemberTeam("target", null), scenario: "remove", check: () => assert.equal(db.tables.profiles[1].team_id, null) },
  { title: "调配团队", action: "transfer_team", run: () => members.updateMemberTeam("target", "team-1"), scenario: "transfer", check: () => assert.equal(db.tables.profiles[1].team_id, "team-1") },
  { title: "归档成员", action: "archive_member", run: () => members.archiveMember("target", "离职"), scenario: "archive", check: () => assert.equal(db.tables.profiles[1].membership_status, "archived") },
  { title: "恢复成员", action: "restore_member", run: () => members.restoreMember("target"), scenario: "restore", check: () => assert.equal(db.tables.profiles[1].membership_status, "active") },
  { title: "重置密码", action: "reset_member_password", run: () => members.resetMemberPassword("target", "new-password"), scenario: "password", check: () => assert.deepEqual(authWrites, [{ id: "target", patch: { password: "new-password" } }]) },
  { title: "修改角色", action: "change_role", run: () => members.changeRole("target", "admin"), scenario: "role", error: "修改角色失败：审计写入失败，已回滚", check: (fail) => assert.equal(db.tables.profiles[1].role, fail ? "member" : "admin") },
  { title: "豁免审批", action: "approve_exemption_request", run: () => exemptions.reviewExemptionRequest({ requestId: "request-1", decision: "approved" }), scenario: "review", check: () => assert.equal(db.tables.exemption_request[0].request_status, "approved") },
  { title: "豁免审批", action: "reject_exemption_request", run: () => exemptions.reviewExemptionRequest({ requestId: "request-1", decision: "rejected" }), scenario: "review", check: () => assert.equal(db.tables.exemption_request[0].request_status, "rejected") },
  { title: "归属分配", action: "reject_orphan_exemption_request", run: () => exemptions.assignOrphanExemptionMember("request-1", "target", "team-1"), scenario: "orphan", check: () => { assert.equal(db.tables.profiles[1].team_id, "team-1"); assert.equal(db.tables.exemption_request[0].request_status, "rejected"); } },
  { title: "驳回归属异常申请", action: "reject_orphan_exemption_request", run: () => exemptions.rejectOrphanExemptionRequest("request-1", "target"), scenario: "orphan", check: () => assert.equal(db.tables.exemption_request[0].request_status, "rejected") },
];

for (const item of cases) for (const fail of [false, true]) {
  test(`${item.action} ${item.scenario}：审计${fail ? "失败返回明确错误" : "成功留下实际记录"}`, async () => {
    await setup(item.action, fail, item.scenario);
    const result = await item.run();
    if (fail) {
      assert.equal(result.error, item.error ?? `${item.title}已生效，但审计写入失败，请人工核对留痕`);
      assert.deepEqual(invalidated, item.title === "归属分配" ? ["/admin", "/admin/modules"] : []);
    } else {
      assert.equal(result.error, undefined);
      assert.equal(db.tables.audit_logs.some((row) => row.action === item.action), true);
    }
    assert.equal(auditAttempts.filter((row) => row.action === item.action).length, 1);
    item.check(fail);
  });
}

test("创建团队审计失败且回滚失败时不谎报已回滚", async () => {
  await setup("create_team", true, "create");
  rollbackFailure = true;
  const result = await teams.createTeam("新团队");
  assert.equal(result.error, "创建团队失败：审计写入失败且回滚未完成，请人工核对");
  assert.equal(db.tables.teams.some((row) => row.name === "新团队"), true);
});
