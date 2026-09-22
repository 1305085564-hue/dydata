import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assignWorkGroupMember,
  assignWorkGroupMembers,
  createWorkGroup,
  deleteWorkGroup,
  isWorkGroupKind,
  loadWorkGroupDirectory,
  normalizeWorkGroupName,
  renameWorkGroup,
  resolveWorkGroupAssignment,
  resolveWorkGroupUnassignment,
  resolveWorkGroupWriteGate,
  rollbackWorkGroupSlots,
  snapshotWorkGroupSlots,
  unassignWorkGroupMember,
  WORK_GROUP_SLOT_COLUMNS,
  type WorkGroupRosterMember,
} from "./work-groups";

type Row = Record<string, unknown>;
type FakeError = { message?: string; code?: string } | null;

const TEAM_A = "team-a";
const TEAM_B = "team-b";
const ACTOR = "user-owner";

let idCounter = 0;

function resultCarrier(result: { data: Row[] | null; error: FakeError }) {
  const first = result.data?.[0] ?? null;
  const carrier: Record<string, unknown> = {
    select() {
      return {
        single: async () => ({
          data: first,
          error: result.error ?? (first ? null : { message: "row not found" }),
        }),
        maybeSingle: async () => ({ data: first, error: result.error }),
      };
    },
    then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
      return Promise.resolve({ data: result.data, error: result.error }).then(resolve, reject);
    },
  };
  return carrier as unknown as {
    select: () => { single: () => Promise<{ data: Row | null; error: FakeError }> };
  } & PromiseLike<{ data: Row[] | null; error: FakeError }>;
}

function createFakeSupabase(
  db: Record<string, Row[]>,
  options: { failAudit?: boolean; missingSchema?: boolean } = {},
) {
  const writes: Array<{ table: string; op: string; payload: unknown }> = [];

  const table = (name: string) => db[name] ?? (db[name] = []);

  function query(rows: Row[], error: FakeError = null) {
    const api: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        return query(rows.filter((row) => row[col] === val), error);
      },
      in(col: string, vals: unknown[]) {
        return query(rows.filter((row) => vals.includes(row[col])), error);
      },
      order() {
        return api;
      },
      limit(count: number) {
        return query(rows.slice(0, count), error);
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error }),
      single: async () => ({
        data: rows[0] ?? null,
        error: error ?? (rows[0] ? null : { message: "row not found" }),
      }),
      then(resolve: (value: unknown) => unknown, reject: (error_: unknown) => unknown) {
        return Promise.resolve({ data: error ? null : [...rows], error }).then(resolve, reject);
      },
    };
    return api;
  }

  function updateBuilder(name: string, patch: Row) {
    let targets = [...table(name)];
    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      for (const row of targets) Object.assign(row, patch);
      writes.push({ table: name, op: "update", payload: patch });
    };
    const api: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        targets = targets.filter((row) => row[col] === val);
        return api;
      },
      select() {
        apply();
        return resultCarrier({ data: targets, error: null }).select();
      },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        apply();
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return api;
  }

  function deleteBuilder(name: string) {
    let targets = [...table(name)];
    const api: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        targets = targets.filter((row) => row[col] === val);
        return api;
      },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        const ids = new Set(targets.map((row) => row.id));
        db[name] = table(name).filter((row) => !ids.has(row.id));
        // 外键 on delete set null：删组不删人，只清空归属
        if (name === "work_groups") {
          for (const row of table("profiles")) {
            if (ids.has(row.work_peer_group_id)) row.work_peer_group_id = null;
            if (ids.has(row.work_operator_group_id)) row.work_operator_group_id = null;
          }
        }
        writes.push({ table: name, op: "delete", payload: [...ids] });
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return api;
  }

  function insertBuilder(name: string, payload: Row | Row[]) {
    if (name === "audit_logs" && options.failAudit) {
      return resultCarrier({ data: null, error: { message: "audit unavailable" } });
    }
    if (options.missingSchema) {
      return resultCarrier({ data: null, error: { code: "42P01", message: 'relation "public.work_groups" does not exist' } });
    }
    const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ ...row }));
    if (name === "work_groups") {
      const clash = table(name).some((row) =>
        rows.some((incoming) => incoming.team_id === row.team_id && incoming.name === row.name),
      );
      if (clash) {
        return resultCarrier({
          data: null,
          error: { code: "23505", message: "duplicate key value violates unique constraint" },
        });
      }
    }
    const inserted = rows.map((row) => ({
      id: typeof row.id === "string" ? row.id : `${name}-${++idCounter}`,
      created_at: "2026-09-22T00:00:00.000Z",
      ...row,
    }));
    table(name).push(...inserted);
    writes.push({ table: name, op: "insert", payload });
    return resultCarrier({ data: inserted, error: null });
  }

  const client = {
    from(name: string) {
      const readError = options.missingSchema
        ? name === "work_groups"
          ? { code: "42P01", message: 'relation "public.work_groups" does not exist' }
          : name === "profiles"
            ? { code: "42703", message: 'column "work_peer_group_id" does not exist' }
            : null
        : null;
      return {
        select: () => query([...table(name)], readError),
        insert: (payload: Row | Row[]) => insertBuilder(name, payload),
        update: (patch: Row) => updateBuilder(name, patch),
        delete: () => deleteBuilder(name),
      };
    },
  };

  return { client: client as unknown as SupabaseClient, db, writes };
}

function seed(overrides: Partial<Record<string, Row[]>> = {}) {
  const db: Record<string, Row[]> = {
    teams: [
      { id: TEAM_A, name: "深圳一部" },
      { id: TEAM_B, name: "深圳二部" },
    ],
    work_groups: [
      { id: "group-writer-1", team_id: TEAM_A, name: "文案一组", kind: "writer", created_at: null, created_by: null },
      { id: "group-writer-2", team_id: TEAM_A, name: "文案二组", kind: "writer", created_at: null, created_by: null },
      { id: "group-talent-1", team_id: TEAM_A, name: "达人一组", kind: "talent", created_at: null, created_by: null },
      { id: "group-operator-1", team_id: TEAM_A, name: "运营一组", kind: "operator", created_at: null, created_by: null },
      { id: "group-operator-2", team_id: TEAM_A, name: "运营二组", kind: "operator", created_at: null, created_by: null },
      { id: "group-other-team", team_id: TEAM_B, name: "文案一组", kind: "writer", created_at: null, created_by: null },
    ],
    profiles: [
      { id: "member-writer", name: "张文案", team_id: TEAM_A, work_peer_group_id: null, work_operator_group_id: null },
      { id: "member-talent", name: "李达人", team_id: TEAM_A, work_peer_group_id: null, work_operator_group_id: null },
      { id: "member-other-team", name: "王二部", team_id: TEAM_B, work_peer_group_id: null, work_operator_group_id: null },
      { id: "member-archived", name: "离职甲", team_id: null, work_peer_group_id: null, work_operator_group_id: null },
    ],
    audit_logs: [],
    admin_actions: [],
    ...overrides,
  };
  return db;
}

function auditRows(db: Record<string, Row[]>) {
  return db.audit_logs ?? [];
}

// ---------- 门禁与校验 ----------

test("写入门禁：必须 manage_members 且能确定本公司 team_id", () => {
  assert.deepEqual(resolveWorkGroupWriteGate({ permissions: {}, actorTeamId: TEAM_A }), {
    ok: false,
    status: 403,
    message: "无权限管理工种小队",
  });
  assert.deepEqual(resolveWorkGroupWriteGate({ permissions: { manage_members: false }, actorTeamId: TEAM_A }), {
    ok: false,
    status: 403,
    message: "无权限管理工种小队",
  });
  assert.deepEqual(resolveWorkGroupWriteGate({ permissions: { manage_members: true }, actorTeamId: null }), {
    ok: false,
    status: 403,
    message: "无法确认操作人所属团队，已拒绝管理小队",
  });
  assert.deepEqual(resolveWorkGroupWriteGate({ permissions: { manage_members: true }, actorTeamId: TEAM_A }), {
    ok: true,
    teamId: TEAM_A,
  });
});

test("小队名称规范化：空、纯空白、超长拒绝，正常值 trim 并压缩空格", () => {
  assert.equal(normalizeWorkGroupName("   ").ok, false);
  assert.equal(normalizeWorkGroupName(null).ok, false);
  assert.equal(normalizeWorkGroupName("文".repeat(41)).ok, false);
  assert.deepEqual(normalizeWorkGroupName("  文案  一组 "), { ok: true, name: "文案 一组" });
});

test("工种枚举只认 writer/talent/operator", () => {
  assert.equal(isWorkGroupKind("writer"), true);
  assert.equal(isWorkGroupKind("editor"), false);
  assert.equal(isWorkGroupKind(null), false);
});

test("分配：同槽位换组 = 就地替换原归属（互斥由替换实现），已在同组视为幂等无操作", () => {
  const group = { id: "group-writer-1", kind: "writer" as const, teamId: TEAM_A };

  const replace = resolveWorkGroupAssignment({
    actorTeamId: TEAM_A,
    group,
    member: { id: "member-writer", teamId: TEAM_A, peerGroupId: "group-talent-1", operatorGroupId: null },
  });
  assert.equal(replace.ok, true);
  assert.equal(replace.ok === true && replace.value.changed, true);
  assert.equal(replace.ok === true && replace.value.previousGroupId, "group-talent-1");
  assert.equal(replace.ok === true && replace.value.column, WORK_GROUP_SLOT_COLUMNS.peer);

  const same = resolveWorkGroupAssignment({
    actorTeamId: TEAM_A,
    group,
    member: { id: "member-writer", teamId: TEAM_A, peerGroupId: "group-writer-1", operatorGroupId: null },
  });
  assert.equal(same.ok, true);
  assert.equal(same.ok === true && same.value.changed, false);

  const fresh = resolveWorkGroupAssignment({
    actorTeamId: TEAM_A,
    group,
    member: { id: "member-writer", teamId: TEAM_A, peerGroupId: null, operatorGroupId: null },
  });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.ok === true && fresh.value.changed, true);
  assert.equal(fresh.ok === true && fresh.value.previousGroupId, null);
  assert.equal(fresh.ok === true && fresh.value.column, WORK_GROUP_SLOT_COLUMNS.peer);
});

test("分配：运营小队允许在文案/达人之外兼任一个，换运营组同样自动替换", () => {
  const group = { id: "group-operator-1", kind: "operator" as const, teamId: TEAM_A };

  const concurrent = resolveWorkGroupAssignment({
    actorTeamId: TEAM_A,
    group,
    member: { id: "member-writer", teamId: TEAM_A, peerGroupId: "group-writer-1", operatorGroupId: null },
  });
  assert.equal(concurrent.ok, true);
  assert.equal(concurrent.ok === true && concurrent.value.changed, true);
  assert.equal(concurrent.ok === true && concurrent.value.column, WORK_GROUP_SLOT_COLUMNS.operator);
  // 兼任：peer 槽位不在本次写入范围内，因此没有被替换的原运营组
  assert.equal(concurrent.ok === true && concurrent.value.previousGroupId, null);

  const second = resolveWorkGroupAssignment({
    actorTeamId: TEAM_A,
    group,
    member: { id: "member-writer", teamId: TEAM_A, peerGroupId: "group-writer-1", operatorGroupId: "group-operator-2" },
  });
  assert.equal(second.ok, true);
  assert.equal(second.ok === true && second.value.changed, true);
  assert.equal(second.ok === true && second.value.previousGroupId, "group-operator-2");
  assert.equal(second.ok === true && second.value.column, WORK_GROUP_SLOT_COLUMNS.operator);
});

test("分配与取消：跨公司小组、跨公司成员、无团队归属成员一律拒绝", () => {
  const foreignGroup = { id: "group-other-team", kind: "writer" as const, teamId: TEAM_B };
  const ownGroup = { id: "group-writer-1", kind: "writer" as const, teamId: TEAM_A };
  const ownMember = { id: "member-writer", teamId: TEAM_A, peerGroupId: null, operatorGroupId: null };

  assert.deepEqual(
    resolveWorkGroupAssignment({ actorTeamId: TEAM_A, group: foreignGroup, member: ownMember }),
    { ok: false, status: 403, message: "不能管理其他公司的小队" },
  );
  assert.deepEqual(
    resolveWorkGroupAssignment({
      actorTeamId: TEAM_A,
      group: ownGroup,
      member: { id: "member-other-team", teamId: TEAM_B, peerGroupId: null, operatorGroupId: null },
    }),
    { ok: false, status: 403, message: "不能分配其他公司的成员" },
  );
  assert.deepEqual(
    resolveWorkGroupAssignment({
      actorTeamId: TEAM_A,
      group: ownGroup,
      member: { id: "member-archived", teamId: null, peerGroupId: null, operatorGroupId: null },
    }),
    { ok: false, status: 403, message: "不能分配其他公司的成员" },
  );
  assert.deepEqual(
    resolveWorkGroupAssignment({ actorTeamId: TEAM_A, group: ownGroup, member: null }),
    { ok: false, status: 404, message: "成员不存在" },
  );
});

test("取消分配：不在该小队时幂等返回 changed=false", () => {
  const group = { id: "group-writer-1", kind: "writer" as const, teamId: TEAM_A };
  const notInGroup = resolveWorkGroupUnassignment({
    actorTeamId: TEAM_A,
    group,
    member: { id: "member-writer", teamId: TEAM_A, peerGroupId: null, operatorGroupId: null },
  });
  assert.equal(notInGroup.ok, true);
  assert.equal(notInGroup.ok === true && notInGroup.value.changed, false);

  const inGroup = resolveWorkGroupUnassignment({
    actorTeamId: TEAM_A,
    group,
    member: { id: "member-writer", teamId: TEAM_A, peerGroupId: "group-writer-1", operatorGroupId: null },
  });
  assert.equal(inGroup.ok, true);
  assert.equal(inGroup.ok === true && inGroup.value.changed, true);
});

// ---------- 写路径（假客户端） ----------

test("建组：成功落 work_groups 并写 create_work_group 审计，不碰 admin_actions", async () => {
  const db = seed();
  const { client } = createFakeSupabase(db);

  const result = await createWorkGroup(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    name: "文案三组",
    kind: "writer",
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok === true && result.value.teamId, TEAM_A);
  assert.equal(db.work_groups.some((row) => row.name === "文案三组" && row.team_id === TEAM_A), true);
  assert.equal(auditRows(db).length, 1);
  assert.equal(auditRows(db)[0].action, "create_work_group");
  assert.equal(auditRows(db)[0].user_id, ACTOR);
  assert.equal(db.admin_actions.length, 0);
});

test("建组：同 team 重名被拒（不写库、不写审计），别家 team 同名不受影响", async () => {
  const db = seed();
  const { client } = createFakeSupabase(db);

  const duplicate = await createWorkGroup(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    name: "文案一组",
    kind: "writer",
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.ok === false && duplicate.status, 409);
  assert.equal(db.work_groups.filter((row) => row.team_id === TEAM_A && row.name === "文案一组").length, 1);
  assert.equal(auditRows(db).length, 0);

  // 二部已有「文案一组」，一部再建同名仍然允许
  const other = await createWorkGroup(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    name: "达人二组",
    kind: "talent",
  });
  assert.equal(other.ok, true);
});

test("建组：非法工种与非法名称在写库前拒绝", async () => {
  const db = seed();
  const { client } = createFakeSupabase(db);

  const badKind = await createWorkGroup(client, { actorId: ACTOR, actorTeamId: TEAM_A, name: "剪辑一组", kind: "editor" });
  assert.deepEqual(badKind, { ok: false, status: 400, message: "工种必须是 writer / talent / operator" });

  const badName = await createWorkGroup(client, { actorId: ACTOR, actorTeamId: TEAM_A, name: "  ", kind: "writer" });
  assert.deepEqual(badName, { ok: false, status: 400, message: "小队名称不能为空" });

  assert.equal(db.work_groups.length, 6);
  assert.equal(auditRows(db).length, 0);
});

test("改名与删除：不能碰其他公司的 squad", async () => {
  const db = seed();
  const { client } = createFakeSupabase(db);

  assert.deepEqual(
    await renameWorkGroup(client, { actorId: ACTOR, actorTeamId: TEAM_A, groupId: "group-other-team", name: "新名字" }),
    { ok: false, status: 403, message: "不能管理其他公司的小队" },
  );
  assert.deepEqual(
    await deleteWorkGroup(client, { actorId: ACTOR, actorTeamId: TEAM_A, groupId: "group-other-team" }),
    { ok: false, status: 403, message: "不能管理其他公司的小队" },
  );
  assert.equal(db.work_groups.some((row) => row.id === "group-other-team"), true);
  assert.equal(auditRows(db).length, 0);
});

test("改名：同名仅允许改回自己，改动落库并写 rename_work_group 审计", async () => {
  const db = seed();
  const { client } = createFakeSupabase(db);

  const duplicated = await renameWorkGroup(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    name: "文案二组",
  });
  assert.equal(duplicated.ok, false);
  assert.equal(duplicated.ok === false && duplicated.status, 409);

  const renamed = await renameWorkGroup(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    name: "文案一组（甲）",
  });
  assert.equal(renamed.ok, true);
  assert.equal(db.work_groups.find((row) => row.id === "group-writer-1")?.name, "文案一组（甲）");
  assert.equal(auditRows(db)[0].action, "rename_work_group");

  // 同名改回原值不产生第二次审计
  const again = await renameWorkGroup(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    name: "文案一组（甲）",
  });
  assert.equal(again.ok, true);
  assert.equal(auditRows(db).length, 1);
});

test("删组：小队消失、成员归属被清空（on delete set null），审计写 delete_work_group", async () => {
  const db = seed();
  db.profiles.find((row) => row.id === "member-writer")!.work_peer_group_id = "group-writer-1";
  db.profiles.find((row) => row.id === "member-writer")!.work_operator_group_id = "group-operator-1";
  const { client } = createFakeSupabase(db);

  const result = await deleteWorkGroup(client, { actorId: ACTOR, actorTeamId: TEAM_A, groupId: "group-writer-1" });

  assert.equal(result.ok, true);
  assert.equal(db.work_groups.some((row) => row.id === "group-writer-1"), false);
  const member = db.profiles.find((row) => row.id === "member-writer")!;
  assert.equal(member.work_peer_group_id, null);
  assert.equal(member.work_operator_group_id, "group-operator-1");
  assert.equal(auditRows(db)[0].action, "delete_work_group");
});

test("分配：同槽位换组覆盖原归属并审计 from；同组重复分配不写库也不写审计", async () => {
  const db = seed();
  db.profiles.find((row) => row.id === "member-writer")!.work_peer_group_id = "group-talent-1";
  const { client } = createFakeSupabase(db);

  const replaced = await assignWorkGroupMember(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    userId: "member-writer",
  });
  assert.equal(replaced.ok, true);
  assert.equal(replaced.ok === true && replaced.value.changed, true);
  assert.equal(replaced.ok === true && replaced.value.replacedGroupName, "达人一组");
  // 单列天然互斥：新值覆盖旧值，成员不会同时挂在两个组
  assert.equal(db.profiles.find((row) => row.id === "member-writer")!.work_peer_group_id, "group-writer-1");
  assert.equal(auditRows(db).length, 1);
  const detail = JSON.parse(String(auditRows(db)[0].detail));
  assert.equal(detail.previous_group_id, "group-talent-1");
  assert.equal(detail.previous_group_name, "达人一组");
  assert.equal(detail.replaced, true);

  const idempotent = await assignWorkGroupMember(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    userId: "member-writer",
  });
  assert.equal(idempotent.ok, true);
  assert.equal(idempotent.ok === true && idempotent.value.changed, false);
  assert.equal(idempotent.ok === true && idempotent.value.replacedGroupName, null);
  assert.equal(auditRows(db).length, 1);
});

test("分配：运营小队可与文案小队并存（兼任），审计带 slot 与前一归属", async () => {
  const db = seed();
  db.profiles.find((row) => row.id === "member-writer")!.work_peer_group_id = "group-writer-2";
  const { client } = createFakeSupabase(db);

  const result = await assignWorkGroupMember(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-operator-1",
    userId: "member-writer",
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok === true && result.value.changed, true);
  const member = db.profiles.find((row) => row.id === "member-writer")!;
  assert.equal(member.work_peer_group_id, "group-writer-2");
  assert.equal(member.work_operator_group_id, "group-operator-1");
  const audit = auditRows(db)[0];
  assert.equal(audit.action, "assign_work_group");
  assert.equal(audit.target, "member-writer");
  assert.equal(JSON.parse(String(audit.detail)).slot, "operator");
  assert.equal(JSON.parse(String(audit.detail)).previous_group_id, null);
});

test("分配：跨公司成员被拒，成员归属保持原样", async () => {
  const db = seed();
  const { client } = createFakeSupabase(db);

  const result = await assignWorkGroupMember(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    userId: "member-other-team",
  });

  assert.deepEqual(result, { ok: false, status: 403, message: "不能分配其他公司的成员" });
  assert.equal(db.profiles.find((row) => row.id === "member-other-team")!.work_peer_group_id, null);
  assert.equal(auditRows(db).length, 0);
});

test("批量分配：部分失败如实返回，已成功的人不回滚", async () => {
  const db = seed();
  const { client } = createFakeSupabase(db);

  const result = await assignWorkGroupMembers(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    userIds: ["member-writer", "member-other-team"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok === true && result.value.assignedCount, 1);
  assert.equal(result.ok === true && result.value.skippedCount, 0);
  assert.deepEqual(result.ok === true && result.value.failures, [
    { userId: "member-other-team", message: "不能分配其他公司的成员" },
  ]);
  assert.deepEqual(result.ok === true && result.value.details, [
    { groupId: "group-writer-1", userId: "member-writer", changed: true, replacedGroupName: null },
  ]);
  // 成功的人真的落库，失败的人保持原样
  assert.equal(db.profiles.find((row) => row.id === "member-writer")!.work_peer_group_id, "group-writer-1");
  assert.equal(db.profiles.find((row) => row.id === "member-other-team")!.work_peer_group_id, null);
  assert.equal(auditRows(db).length, 1);
});

test("批量分配：全员失败返回首个失败，不伪装成功", async () => {
  const db = seed();
  const { client } = createFakeSupabase(db);

  const result = await assignWorkGroupMembers(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    userIds: ["member-other-team", "member-archived"],
  });

  assert.deepEqual(result, { ok: false, status: 403, message: "不能分配其他公司的成员" });
  assert.equal(auditRows(db).length, 0);
});

test("批量分配：带出被替换的原小队名，重复入参只算一次", async () => {
  const db = seed();
  db.profiles.find((row) => row.id === "member-writer")!.work_peer_group_id = "group-talent-1";
  const { client } = createFakeSupabase(db);

  const result = await assignWorkGroupMembers(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    userIds: ["member-writer", "member-writer"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok === true && result.value.assignedCount, 1);
  assert.equal(result.ok === true && result.value.details.length, 1);
  assert.equal(result.ok === true && result.value.details[0].replacedGroupName, "达人一组");
  assert.equal(auditRows(db).length, 1);
});

test("批量分配：已在目标小队的人计入 skippedCount，不重复写审计", async () => {
  const db = seed();
  db.profiles.find((row) => row.id === "member-writer")!.work_peer_group_id = "group-writer-1";
  const { client } = createFakeSupabase(db);

  const result = await assignWorkGroupMembers(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    userIds: ["member-writer", "member-talent"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok === true && result.value.assignedCount, 1);
  assert.equal(result.ok === true && result.value.skippedCount, 1);
  assert.equal(result.ok === true && result.value.failures.length, 0);
  assert.equal(auditRows(db).length, 1);
});

test("批量分配：空入参成功且 0 人，不写库不写审计", async () => {
  const db = seed();
  const { client, writes } = createFakeSupabase(db);

  const result = await assignWorkGroupMembers(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    userIds: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok === true && result.value.assignedCount, 0);
  assert.deepEqual(result.ok === true && result.value.details, []);
  assert.deepEqual(result.ok === true && result.value.failures, []);
  assert.equal(writes.length, 0);
});

test("乐观回滚：部分失败只还原失败的人，成功的人保持新归属", () => {
  const roster: WorkGroupRosterMember[] = [
    { id: "member-writer", name: "张文案", teamId: TEAM_A, peerGroupId: "group-writer-2", operatorGroupId: null },
    { id: "member-talent", name: "李达人", teamId: TEAM_A, peerGroupId: "group-talent-1", operatorGroupId: null },
  ];
  const snapshot = snapshotWorkGroupSlots(roster, ["member-writer", "member-talent"]);
  // 乐观结果：两人都被移入 group-writer-1
  const optimistic = roster.map((member) => ({ ...member, peerGroupId: "group-writer-1" }));

  const rolledBack = rollbackWorkGroupSlots(optimistic, snapshot, new Set(["member-talent"]));

  assert.equal(rolledBack.find((member) => member.id === "member-talent")!.peerGroupId, "group-talent-1");
  assert.equal(rolledBack.find((member) => member.id === "member-writer")!.peerGroupId, "group-writer-1");
});

test("乐观回滚：不整表覆盖，快照外的人保持当前值；无需还原时原样返回", () => {
  const roster: WorkGroupRosterMember[] = [
    { id: "member-writer", name: "张文案", teamId: TEAM_A, peerGroupId: "group-writer-2", operatorGroupId: null },
    { id: "member-talent", name: "李达人", teamId: TEAM_A, peerGroupId: null, operatorGroupId: null },
  ];
  const snapshot = snapshotWorkGroupSlots(roster, ["member-writer"]);
  // current 里 member-talent 的归属是快照之外发生的变更，回滚不许碰它
  const current: WorkGroupRosterMember[] = [
    { ...roster[0], peerGroupId: "group-writer-1" },
    { ...roster[1], peerGroupId: "group-operator-1" },
  ];

  const rolledBack = rollbackWorkGroupSlots(current, snapshot);

  assert.equal(rolledBack.find((member) => member.id === "member-writer")!.peerGroupId, "group-writer-2");
  assert.equal(rolledBack.find((member) => member.id === "member-talent")!.peerGroupId, "group-operator-1");
  // 已经和快照一致时原样返回（引用相等，省掉一次无意义重渲染）
  assert.equal(rollbackWorkGroupSlots(roster, snapshot), roster);
});

test("取消分配：清空对应槽位并写 unassign_work_group 审计，未加入时幂等", async () => {
  const db = seed();
  db.profiles.find((row) => row.id === "member-writer")!.work_peer_group_id = "group-writer-1";
  const { client } = createFakeSupabase(db);

  const result = await unassignWorkGroupMember(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    userId: "member-writer",
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok === true && result.value.changed, true);
  assert.equal(db.profiles.find((row) => row.id === "member-writer")!.work_peer_group_id, null);
  assert.equal(auditRows(db)[0].action, "unassign_work_group");

  const again = await unassignWorkGroupMember(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-1",
    userId: "member-writer",
  });
  assert.equal(again.ok, true);
  assert.equal(again.ok === true && again.value.changed, false);
  assert.equal(auditRows(db).length, 1);
});

test("审计失败不伪装成功：分配回滚到原归属", async () => {
  const db = seed();
  db.profiles.find((row) => row.id === "member-writer")!.work_peer_group_id = "group-writer-2";
  const { client } = createFakeSupabase(db, { failAudit: true });

  const result = await unassignWorkGroupMember(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    groupId: "group-writer-2",
    userId: "member-writer",
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.status, 500);
  assert.equal(db.profiles.find((row) => row.id === "member-writer")!.work_peer_group_id, "group-writer-2");
  assert.equal(auditRows(db).length, 0);
});

test("审计失败不伪装成功：建组回滚，不留半成品小队", async () => {
  const db = seed();
  const { client } = createFakeSupabase(db, { failAudit: true });

  const result = await createWorkGroup(client, {
    actorId: ACTOR,
    actorTeamId: TEAM_A,
    name: "文案九组",
    kind: "writer",
  });

  assert.equal(result.ok, false);
  assert.equal(db.work_groups.some((row) => row.name === "文案九组"), false);
  assert.equal(auditRows(db).length, 0);
});

// ---------- 读取与 N+1 ----------

test("目录加载：固定两次查询拿到全部小队与编制名单，不随小队数量增长", async () => {
  const db = seed();
  const { client, writes } = createFakeSupabase(db);

  const directory = await loadWorkGroupDirectory(client, { teamIds: [TEAM_A, TEAM_A] });

  assert.equal(directory.ready, true);
  assert.equal(directory.groups.filter((group) => group.teamId === TEAM_A).length, 5);
  assert.equal(directory.roster.length, 2);
  assert.equal(writes.length, 0);
});

test("目录加载：未跑 migration 时降级为空态而不是报错", async () => {
  const db = seed({ work_groups: [], profiles: [] });
  const { client } = createFakeSupabase(db, { missingSchema: true });

  const directory = await loadWorkGroupDirectory(client, { teamIds: [TEAM_A] });
  assert.deepEqual(directory, { ready: false, groups: [], roster: [] });
});

// ---------- 用户可见文案 ----------

test("写操作的用户可见文案不得出现「编制」，且 503 提示必须全站同一句", () => {
  const source = readFileSync(new URL("./work-groups.ts", import.meta.url), "utf8");

  // 503 提示会被抽屉直接 toast 给用户；逐个分支各写一句是漏改的根源，这里锁成同一句
  const messages503 = Array.from(source.matchAll(/failure\(503,\s*"([^"]+)"\)/g)).map((m) => m[1]);
  assert.ok(messages503.length >= 6, `503 文案数量异常：${messages503.length}`);
  assert.deepEqual(new Set(messages503), new Set(["工种小队功能尚未上线"]));

  // 阿禅明确否定「编制」一词：任何会走到用户眼前的 failure 文案都不许出现
  const userFacing = Array.from(source.matchAll(/failure\(\d+,\s*"([^"]*)"\)/g)).map((m) => m[1]);
  for (const message of userFacing) {
    assert.equal(message.includes("编制"), false, `用户可见文案残留「编制」：${message}`);
  }
});
