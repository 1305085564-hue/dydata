import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArchiveMemberProfilePatch,
  buildRestoreMemberProfilePatch,
  canArchiveMember,
  canRestoreMember,
  filterActiveMemberships,
  normalizeMembershipStatus,
  type MemberLifecycleProfile,
} from "./member-lifecycle";

const activeMember: MemberLifecycleProfile = {
  id: "member-1",
  role: "admin",
  permissions: { manage_members: true, view_analytics: true },
  team_id: "team-1",
  group_id: "group-1",
  membership_status: "active",
};

test("归档只允许 owner 操作，不能归档自己或 owner", () => {
  assert.equal(canArchiveMember({ actorRole: "owner", actorId: "owner-1", target: activeMember }), true);
  assert.equal(canArchiveMember({ actorRole: "admin", actorId: "admin-1", target: activeMember }), false);
  assert.equal(
    canArchiveMember({
      actorRole: "owner",
      actorId: "owner-1",
      target: { ...activeMember, id: "owner-1", role: "owner" },
    }),
    false,
  );
});

test("已归档成员的归档与恢复动作幂等", () => {
  const archived = { ...activeMember, membership_status: "archived" as const, team_id: null, group_id: null };

  assert.equal(canArchiveMember({ actorRole: "owner", actorId: "owner-1", target: archived }), true);
  assert.equal(canRestoreMember({ actorRole: "owner", actorId: "owner-1", target: archived }), true);
  assert.equal(canRestoreMember({ actorRole: "admin", actorId: "admin-1", target: archived }), false);
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
      permissions: activeMember.permissions,
      team_id: activeMember.team_id,
      group_id: activeMember.group_id,
      team_name: "内容一部",
      group_name: "短视频组",
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
      group_id: "group-1",
      team_name: "内容一部",
      group_name: "短视频组",
    },
    role: "member",
    permissions: {},
    team_id: null,
    group_id: null,
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
    permissions: {},
    team_id: null,
    group_id: null,
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
