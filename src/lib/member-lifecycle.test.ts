import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArchiveMemberProfilePatch,
  buildRestoreMemberProfilePatch,
  canArchiveMember,
  canRestoreMember,
  filterActiveMemberships,
  normalizeMembershipStatus,
  resolveMembershipStatusFromQuery,
  type MemberLifecycleProfile,
} from "./member-lifecycle";

const activeMember: MemberLifecycleProfile = {
  id: "member-1",
  role: "admin",
  permissions: { manage_members: true, view_analytics: true },
  team_id: "team-1",
  membership_status: "active",
};

test("公司所有者只能归档本公司成员，集团模式可跨公司", () => {
  assert.equal(canArchiveMember({
    actorRole: "admin",
    actorPermissions: { manage_members: true },
    actorTeamId: "team-1",
    actorId: "owner-1",
    target: activeMember,
  }), true);
  assert.equal(canArchiveMember({
    actorRole: "admin",
    actorPermissions: { manage_members: true },
    actorTeamId: "team-2",
    actorId: "admin-1",
    target: activeMember,
  }), false);
  assert.equal(canArchiveMember({ actorRole: "admin", actorId: "admin-1", target: activeMember }), false);
  assert.equal(canArchiveMember({
    actorRole: "admin",
    actorPermissions: { manage_members: true },
    actorTeamId: null,
    groupMode: true,
    actorId: "group-owner-1",
    target: activeMember,
  }), true);
  assert.equal(
    canArchiveMember({
      actorRole: "admin",
      actorPermissions: { manage_members: true },
      actorTeamId: "team-1",
      actorId: "owner-1",
      target: { ...activeMember, id: "owner-1", role: "owner" },
    }),
    false,
  );
});

test("已归档成员的归档与恢复动作幂等", () => {
  const archived = {
    ...activeMember,
    membership_status: "archived" as const,
    team_id: null,
    archive_snapshot: { team_id: "team-1" },
  };

  assert.equal(canArchiveMember({ actorRole: "admin", actorPermissions: { manage_members: true }, actorTeamId: "team-1", actorId: "owner-1", target: archived }), true);
  assert.equal(canRestoreMember({ actorRole: "admin", actorPermissions: { manage_members: true }, actorTeamId: "team-1", actorId: "owner-1", target: archived }), true);
  assert.equal(canRestoreMember({ actorRole: "admin", actorPermissions: { manage_members: true }, actorTeamId: "team-2", actorId: "admin-1", target: archived }), false);
  assert.equal(normalizeMembershipStatus(undefined), "active");
  assert.equal(normalizeMembershipStatus("archived"), "archived");
});

test("归档快照保留旧归属与权限，但写入最低权限和空团队", () => {
  const patch = buildArchiveMemberProfilePatch({
    target: activeMember,
    archivedBy: "owner-1",
    reason: "长期离职",
    archivedAt: "2026-08-04T12:00:00.000Z",
    snapshot: {
      role: activeMember.role,
      permissions: activeMember.permissions ?? {},
      team_id: activeMember.team_id,
      team_name: "内容一部",
    },
  });

  assert.deepEqual(patch, {
    membership_status: "archived",
    archived_at: "2026-08-04T12:00:00.000Z",
    archived_by: "owner-1",
    archive_reason: "长期离职",
    archive_snapshot: {
      role: "admin",
      permissions: { manage_members: true, view_analytics: true },
    team_id: "team-1",
      team_name: "内容一部",
    },
    role: "member",
    company_role: "member",
    permissions: {},
    team_id: null,
  });
});

test("恢复始终回到未分配团队的普通成员和空权限", () => {
  assert.deepEqual(buildRestoreMemberProfilePatch(), {
    membership_status: "active",
    archived_at: null,
    archived_by: null,
    archive_reason: null,
    archive_snapshot: null,
    role: "member",
    company_role: "member",
    permissions: {},
    team_id: null,
  });
});

test("当前成员过滤排除 archived，但迁移前缺少字段的记录按 active 兼容", () => {
  const rows = [
    { id: "active-1", membership_status: "active" },
    { id: "archived-1", membership_status: "archived" },
    { id: "legacy-1" },
  ];

  assert.deepEqual(filterActiveMemberships(rows).map((row) => row.id), ["active-1", "legacy-1"]);
});

test("归档会话拦截状态在字段缺失时兼容 active，其他核验失败时拒绝放行", () => {
  assert.equal(resolveMembershipStatusFromQuery({ data: { membership_status: "archived" }, error: null }), "archived");
  assert.equal(resolveMembershipStatusFromQuery({ data: { membership_status: "active" }, error: null }), "active");
  assert.equal(
    resolveMembershipStatusFromQuery({ data: null, error: { message: "column membership_status does not exist" } }),
    "active",
  );
  assert.equal(resolveMembershipStatusFromQuery({ data: null, error: { message: "profiles unavailable" } }), "unavailable");
  assert.equal(resolveMembershipStatusFromQuery({ data: null, error: null }), "unavailable");
});
