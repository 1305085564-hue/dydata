import assert from "node:assert/strict";
import test from "node:test";
import { memoryDatabase, type TestRow } from "./testing/maintenance.test.fixture";
import { assignWorkGroupMember, createWorkGroup, deleteWorkGroup, renameWorkGroup, unassignWorkGroupMember, resolveWorkGroupAssignment, resolveWorkGroupUnassignment } from "./work-groups";

const group = { id: "group", team_id: "team", name: "文案一组", kind: "writer" };
const member = { id: "member", team_id: "team", work_peer_group_id: null, work_operator_group_id: null };
const base = { actorId: "admin", actorTeamId: "team", groupId: "group", userId: "member" };
type Db = ReturnType<typeof memoryDatabase>;
type Result = { ok: boolean; message?: string };
const create = (db: Db) => createWorkGroup(db as never, { ...base, name: "新小队", kind: "writer" });
const rename = (db: Db) => renameWorkGroup(db as never, { ...base, name: "新小队" });
const remove = (db: Db) => deleteWorkGroup(db as never, base);
const assign = (db: Db) => assignWorkGroupMember(db as never, base);
const unassign = (db: Db) => unassignWorkGroupMember(db as never, base);

type Case = { name: string; run: (db: Db) => Promise<Result>; failTable?: string; failOperation?: string; groups?: TestRow[]; members?: TestRow[]; error?: { code?: string; message: string }; corrupt?: boolean; expected: string };
const cases: Case[] = [
  { name: "非法工种", run: (db) => createWorkGroup(db as never, { ...base, name: "新小队", kind: "editor" }), expected: "工种必须是 writer / talent / operator" },
  { name: "空名称", run: (db) => createWorkGroup(db as never, { ...base, name: " ", kind: "writer" }), expected: "小队名称不能为空" },
  { name: "创建查重失败", run: create, failTable: "work_groups", failOperation: "select", expected: "校验小队名称失败" },
  { name: "创建重名", run: (db) => createWorkGroup(db as never, { ...base, name: "文案一组", kind: "writer" }), expected: "同一部/二部内已有同名小队" },
  { name: "创建写入失败", run: create, failTable: "work_groups", failOperation: "insert", expected: "创建小队失败" },
  { name: "创建审计失败", run: create, failTable: "audit_logs", expected: "创建小队失败：审计写入失败，已回滚" },
  ...[["改名", rename], ["删除", remove], ["分配", assign], ["取消分配", unassign]].flatMap(([name, run]) => [
    { name: `${name}无小队`, run, groups: [], expected: "小队不存在" },
    { name: `${name}读取失败`, run, failTable: "work_groups", failOperation: "select", expected: "加载小队失败" },
    { name: `${name}跨团队`, run, groups: [{ ...group, team_id: "other" }], expected: "不能管理其他团队的小队" },
  ]) as Case[],
  { name: "改名查重失败", run: rename, error: { message: "lookup failed" }, expected: "校验小队名称失败" },
  { name: "改名查重缺表", run: rename, error: { code: "42P01", message: "work_groups does not exist" }, expected: "工种小队功能尚未上线" },
  { name: "创建返回无效工种", run: create, corrupt: true, expected: "创建小队失败" },
  { name: "改名返回无效工种", run: rename, corrupt: true, expected: "重命名小队失败" },
  { name: "改名重名", run: rename, groups: [group, { ...group, id: "duplicate", name: "新小队" }], expected: "同一部/二部内已有同名小队" },
  ...[["创建", create, "insert"], ["改名", rename, "update"]].map(([name, run, operation]) => ({ name: `${name}并发重名`, run, failTable: "work_groups", failOperation: operation, error: { code: "23505", message: "duplicate key" }, expected: "同一部/二部内已有同名小队" })) as Case[],
  ...[["创建查重", create, "work_groups", "select"], ["改名读小队", rename, "work_groups", "select"], ["分配读成员", assign, "profiles", "select"], ["分配更新", assign, "profiles", "update"], ["删除", remove, "work_groups", "delete"]].map(([name, run, table, operation]) => ({ name: `${name}缺表`, run, failTable: table, failOperation: operation, error: { code: "42P01", message: "work_groups does not exist" }, expected: "工种小队功能尚未上线" })) as Case[],
  { name: "改名写入失败", run: rename, failTable: "work_groups", failOperation: "update", expected: "重命名小队失败" },
  { name: "删除写入失败", run: remove, failTable: "work_groups", failOperation: "delete", expected: "删除小队失败" },
  { name: "分配成员查询失败", run: assign, failTable: "profiles", failOperation: "select", expected: "加载成员失败" },
  { name: "分配成员不存在", run: assign, members: [], expected: "成员不存在" },
  { name: "分配跨团队成员", run: assign, members: [{ ...member, team_id: "other" }], expected: "不能分配其他团队的成员" },
  { name: "取消跨团队成员", run: unassign, members: [{ ...member, team_id: "other" }], expected: "不能调整其他团队的成员" },
  { name: "分配更新失败", run: assign, failTable: "profiles", failOperation: "update", expected: "小队归属更新未生效，请刷新后重试" },
];

for (const item of cases) test(`工种小队错误回执：${item.name}`, async () => {
  const db = memoryDatabase({ work_groups: item.groups ?? [group], profiles: item.members ?? [member] }, { failTable: item.failTable, failOperation: item.failOperation, error: item.error });
  if (item.name === "改名查重失败" || item.name === "改名查重缺表") {
    const from = db.from;
    let groupReads = 0;
    db.from = (table) => {
      const query = from(table);
      if (table === "work_groups" && ++groupReads === 2) query.maybeSingle = () => Object.assign(query, { then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: item.error }).then(resolve) }) as never;
      return query;
    };
  }
  if (item.corrupt) {
    const from = db.from;
    db.from = (table) => {
      const query = from(table);
      const single = query.single;
      // 只让写入回执返回无效 kind；读取原组与查重仍真实执行筛选。
      query.single = () => Object.assign(single(), { then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: { ...group, kind: "invalid" }, error: null }).then(resolve) }) as never;
      return query;
    };
  }
  const result = await item.run(db);
  assert.equal(result.ok, false);
  assert.equal(result.message, item.expected);
  assert.equal(result.message!.includes("编制"), false);
});

for (const [name, resolve] of [["分配", resolveWorkGroupAssignment], ["取消分配", resolveWorkGroupUnassignment]] as const) {
  test(`${name}不存在的成员返回用户可理解的提示`, () => {
    const result = resolve({ actorTeamId: "team", group: { id: "group", teamId: "team", kind: "writer" }, member: null });
    assert.deepEqual(result, { ok: false, status: 404, message: "成员不存在" });
  });
}
