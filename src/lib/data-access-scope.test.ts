import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDataAccessScope,
  canAccessOwner,
  filterRowsByDataScope,
  getScopeKind,
  inferAccessLevel,
  inferBusinessAccessLevel,
  type DataAccessScope,
} from "./data-access-scope";

const baseProfile = {
  id: "user-1",
  role: "admin" as const,
  permissions: {},
  team_id: "team-1",
  group_id: "group-1",
};

test("buildDataAccessScope 查询领导小组失败时抛错，不把组长降为成员", async () => {
  const failedGroupsQuery = {
    select() { return failedGroupsQuery; },
    eq() {
      return Promise.resolve({ data: null, error: { message: "groups unavailable" } });
    },
  };

  await assert.rejects(
    buildDataAccessScope(
      { from: () => failedGroupsQuery } as never,
      "user-1",
      { profile: baseProfile },
    ),
    /groups unavailable/,
  );
});

test("buildDataAccessScope 查询可见成员失败时抛错，不退化成只有本人", async () => {
  const failedProfilesQuery = {
    select() { return failedProfilesQuery; },
    then(resolve: (value: unknown) => void) {
      return Promise.resolve({ data: null, error: { message: "profiles unavailable" } }).then(resolve);
    },
  };

  await assert.rejects(
    buildDataAccessScope(
      { from: () => failedProfilesQuery } as never,
      "user-1",
      {
        profile: {
          ...baseProfile,
          role: "owner",
          led_group_ids: [],
          business_role: "owner",
        },
      },
    ),
    /profiles unavailable/,
  );
});

test("inferAccessLevel prefers explicit level and falls back to legacy role permissions", () => {
  assert.equal(inferAccessLevel("member", {}, 2), 2);
  assert.equal(inferAccessLevel("owner", {}), 4);
  assert.equal(inferAccessLevel("admin", { view_all_data: true }), 4);
  assert.equal(inferAccessLevel("admin", {}), 3);
  assert.equal(inferAccessLevel("member", {}), 1);
});

test("getScopeKind maps company levels to data ranges", () => {
  assert.equal(getScopeKind(1), "self");
  assert.equal(getScopeKind(2), "group");
  assert.equal(getScopeKind(3), "team");
  assert.equal(getScopeKind(4), "all");
});

test("business roles map to scoped data ranges", () => {
  assert.equal(inferBusinessAccessLevel("owner"), 4);
  assert.equal(inferBusinessAccessLevel("team_admin"), 3);
  assert.equal(inferBusinessAccessLevel("group_leader"), 3);
  assert.equal(inferBusinessAccessLevel("member"), 1);
});

test("canAccessOwner only allows visible owners unless scope is all", () => {
  const scope: DataAccessScope = {
    userId: "u1",
    role: "member",
    businessRole: "member",
    permissions: {},
    accessLevel: 2,
    teamId: "t1",
    groupId: "g1",
    kind: "group",
    visibleUserIds: ["u1", "u2"],
  };

  assert.equal(canAccessOwner(scope, "u2"), true);
  assert.equal(canAccessOwner(scope, "u3"), false);
  assert.equal(canAccessOwner({ ...scope, kind: "all", accessLevel: 4 }, "u3"), true);
});

test("filterRowsByDataScope keeps only visible owners for scoped roles", () => {
  const scope: DataAccessScope = {
    userId: "leader-1",
    role: "admin",
    businessRole: "group_leader",
    permissions: {},
    accessLevel: 3,
    teamId: "team-1",
    groupId: "group-1",
    kind: "team",
    visibleUserIds: ["leader-1", "member-1", "member-2"],
  };
  const rows = [
    { id: "a", user_id: "leader-1" },
    { id: "b", user_id: "member-1" },
    { id: "c", user_id: "member-2" },
  ];

  assert.deepEqual(
    filterRowsByDataScope(scope, rows, (row) => row.user_id).map((row) => row.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    filterRowsByDataScope({ ...scope, kind: "all", accessLevel: 4 }, rows, (row) => row.user_id).map((row) => row.id),
    ["a", "b", "c"],
  );
});
