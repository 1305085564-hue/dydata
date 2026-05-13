import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessOwner,
  getScopeKind,
  inferAccessLevel,
  inferBusinessAccessLevel,
  type DataAccessScope,
} from "./data-access-scope";

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
  assert.equal(inferBusinessAccessLevel("group_leader"), 2);
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
