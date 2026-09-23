import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDataAccessScope,
  canAccessOwner,
  filterRowsByDataScope,
  getActiveVisibleUserIds,
  inferDataScope,
  resolveCollaborationScope,
} from "@/lib/data-access-scope";
import type { DataAccessScope, ScopeProfileInput } from "@/lib/data-access-scope";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build a minimal ScopeProfileInput with sensible defaults. */
function makeProfile(overrides: Partial<ScopeProfileInput> = {}): ScopeProfileInput {
  return {
    id: "user-1",
    role: "member",
    permissions: {},
    data_scope: "self",
    team_id: null,
    membership_status: "active",
    ...overrides,
  };
}

/**
 * Build a fake Supabase client that returns the given rows for any
 * `from("profiles").select(...)` chain.  Supports `.eq("team_id", ...)`
 * by filtering rows whose `team_id` matches.
 */
function makeFakeSupabase(rows: Array<{
  id: string;
  team_id?: string | null;
  membership_status?: string | null;
  archive_snapshot?: { team_id?: string | null } | null;
  archived_by?: string | null;
}>) {
  function builder() {
    let filtered = [...rows];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: string) => {
        filtered = filtered.filter((r) => r[col as keyof typeof r] === val);
        return chain;
      },
      single: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
      then: (resolve: (v: { data: typeof filtered; error: null }) => void) =>
        resolve({ data: filtered, error: null }),
    };
    // Make it thenable so `await supabase.from(...).select(...)` resolves
    return chain as typeof chain & { then: typeof chain.then };
  }
  return { from: () => builder() };
}

// ---------------------------------------------------------------------------
// buildDataAccessScope — self scope
// ---------------------------------------------------------------------------

test("inferDataScope: 旧 owner 按公司所有者处理，只有集团模式是全局范围", () => {
  assert.equal(inferDataScope("owner", {}), "team");
  assert.equal(inferDataScope("admin", {}), "team");
  assert.equal(inferDataScope("member", {}), "self");
  assert.equal(inferDataScope("owner", {}, "company_owner", true), "all");
  assert.equal(inferDataScope("admin", {}, "company_owner", true), "self");
  assert.equal(inferDataScope("admin", {}, "company_owner"), "self");
});

test("buildDataAccessScope: self scope returns only the user's own id", async () => {
  const profile = makeProfile({ id: "u1", data_scope: "self" });
  const supabase = makeFakeSupabase([{ id: "u1" }, { id: "u2" }]);

  const scope = await buildDataAccessScope(supabase as never, "u1", { profile });
  assert.ok(scope, "scope should not be null");
  assert.equal(scope.kind, "self");
  assert.deepEqual(scope.visibleUserIds.sort(), ["u1"]);
});

// ---------------------------------------------------------------------------
// buildDataAccessScope — team scope
// ---------------------------------------------------------------------------

test("buildDataAccessScope: admin returns all members of the same company", async () => {
  const profile = makeProfile({ id: "u1", role: "admin", data_scope: "all", team_id: "team-A" });
  const supabase = makeFakeSupabase([
    { id: "u1", team_id: "team-A" },
    { id: "u2", team_id: "team-A" },
    { id: "u3", team_id: "team-B" },
  ]);

  const scope = await buildDataAccessScope(supabase as never, "u1", { profile });
  assert.ok(scope);
  assert.equal(scope.kind, "team");
  assert.deepEqual(scope.visibleUserIds.sort(), ["u1", "u2"]);
});

test("buildDataAccessScope: missing profile team never trusts a caller-supplied team id", async () => {
  const profile = makeProfile({
    id: "admin-without-team",
    role: "admin",
    company_role: "admin",
    data_scope: "team",
    team_id: null,
  });
  const supabase = makeFakeSupabase([
    { id: "admin-without-team", team_id: null, membership_status: "active" },
    { id: "attacker-target", team_id: "attacker-team", membership_status: "active" },
  ]);

  const scope = await buildDataAccessScope(supabase as never, "admin-without-team", {
    profile,
    teamId: "attacker-team",
  });

  assert.ok(scope);
  assert.equal(scope.teamId, null);
  assert.deepEqual(scope.visibleUserIds, ["admin-without-team"]);
  assert.deepEqual(scope.activeVisibleUserIds, ["admin-without-team"]);
});

test("buildDataAccessScope: conflicting role fields fail closed", async () => {
  const profile = makeProfile({
    id: "conflicting-user",
    role: "admin",
    company_role: "company_owner",
    team_id: "team-A",
  });
  const supabase = makeFakeSupabase([
    { id: "conflicting-user", team_id: "team-A", membership_status: "active" },
    { id: "other-user", team_id: "team-B", membership_status: "active" },
  ]);

  const scope = await buildDataAccessScope(supabase as never, "conflicting-user", { profile });
  assert.equal(scope, null);
});

test("buildDataAccessScope: legacy company_role is used only when role is absent", async () => {
  const profile = makeProfile({
    id: "legacy-admin",
    role: null,
    company_role: "admin",
    team_id: "team-A",
  });
  const supabase = makeFakeSupabase([
    { id: "legacy-admin", team_id: "team-A", membership_status: "active" },
    { id: "team-member", team_id: "team-A", membership_status: "active" },
    { id: "other-user", team_id: "team-B", membership_status: "active" },
  ]);

  const scope = await buildDataAccessScope(supabase as never, "legacy-admin", { profile });
  assert.ok(scope);
  assert.equal(scope.companyRole, "admin");
  assert.equal(scope.kind, "team");
  assert.deepEqual(scope.visibleUserIds.sort(), ["legacy-admin", "team-member"]);
});

// ---------------------------------------------------------------------------
// buildDataAccessScope — all scope
// ---------------------------------------------------------------------------

test("buildDataAccessScope: active group mode returns every user", async () => {
  const profile = makeProfile({ id: "u1", role: "owner", data_scope: "self", group_mode: true });
  const supabase = makeFakeSupabase([
    { id: "u1" },
    { id: "u2" },
    { id: "u3" },
  ]);

  const scope = await buildDataAccessScope(supabase as never, "u1", { profile });
  assert.ok(scope);
  assert.equal(scope.kind, "all");
  assert.deepEqual(scope.visibleUserIds.sort(), ["u1", "u2", "u3"]);
});

// ---------------------------------------------------------------------------
// buildDataAccessScope — null profile returns null
// ---------------------------------------------------------------------------

test("buildDataAccessScope: returns null when profile is null", async () => {
  const supabase = makeFakeSupabase([]);
  const scope = await buildDataAccessScope(supabase as never, "missing-user", {
    profile: null,
  });
  assert.equal(scope, null);
});

// ---------------------------------------------------------------------------
// buildDataAccessScope — activeVisibleUserIds filters out non-active
// ---------------------------------------------------------------------------

test("buildDataAccessScope: activeVisibleUserIds excludes non-active members", async () => {
  const profile = makeProfile({ id: "u1", role: "owner", group_mode: true });
  const supabase = makeFakeSupabase([
    { id: "u1", membership_status: "active" },
    { id: "u2", membership_status: "archived" },
    { id: "u3", membership_status: "active" },
  ]);

  const scope = await buildDataAccessScope(supabase as never, "u1", { profile });
  assert.ok(scope);
  assert.deepEqual(scope.activeVisibleUserIds!.sort(), ["u1", "u3"]);
});

test("buildDataAccessScope: 历史范围保留归档前属于本公司的成员", async () => {
  const profile = makeProfile({ id: "owner-1", role: "owner", team_id: "company-1" });
  const supabase = makeFakeSupabase([
    { id: "owner-1", team_id: "company-1", membership_status: "active" },
    {
      id: "archived-1",
      team_id: null,
      membership_status: "archived",
      archive_snapshot: { team_id: "company-1" },
    },
    {
      id: "archived-other-company",
      team_id: null,
      membership_status: "archived",
      archive_snapshot: { team_id: "company-2" },
    },
  ]);

  const scope = await buildDataAccessScope(supabase as never, "owner-1", { profile });

  assert.ok(scope);
  assert.deepEqual(scope.visibleUserIds.sort(), ["archived-1", "owner-1"]);
  assert.deepEqual(scope.activeVisibleUserIds, ["owner-1"]);
});

test("buildDataAccessScope: 归档时无团队的成员按归档操作人所属公司归属", async () => {
  const profile = makeProfile({ id: "owner-1", role: "owner", team_id: "company-1" });
  const supabase = makeFakeSupabase([
    { id: "owner-1", team_id: "company-1", membership_status: "active" },
    {
      id: "archived-no-team",
      team_id: null,
      membership_status: "archived",
      archived_by: "owner-1",
      archive_snapshot: { team_id: null },
    },
    {
      id: "archived-orphan",
      team_id: null,
      membership_status: "archived",
      archived_by: "outsider",
      archive_snapshot: { team_id: null },
    },
  ]);

  const scope = await buildDataAccessScope(supabase as never, "owner-1", { profile });

  assert.ok(scope);
  // 快照无团队时靠归档人回指公司；归档人不属于本公司的不纳入
  assert.deepEqual(scope.visibleUserIds.sort(), ["archived-no-team", "owner-1"]);
  assert.deepEqual(scope.activeVisibleUserIds, ["owner-1"]);
});

test("buildDataAccessScope: 迁移前的 owner 也只能落到本公司范围", async () => {
  const profile = makeProfile({
    id: "owner-1",
    role: "owner",
    data_scope: "team",
    team_id: "team-A",
  });
  const supabase = makeFakeSupabase([
    { id: "owner-1", team_id: "team-A", membership_status: "active" },
    { id: "member-other-team", team_id: "team-B", membership_status: "active" },
  ]);

  const scope = await buildDataAccessScope(supabase as never, "owner-1", { profile });

  assert.ok(scope);
  assert.equal(scope.kind, "team");
  assert.deepEqual(scope.activeVisibleUserIds, ["owner-1"]);
});

// ---------------------------------------------------------------------------
// canAccessOwner
// ---------------------------------------------------------------------------

test("canAccessOwner: all scope always returns true", () => {
  const scope: DataAccessScope = {
    userId: "u1",
    role: "member",
    permissions: {},
    teamId: null,
    kind: "all",
    visibleUserIds: ["u1"],
  };
  assert.equal(canAccessOwner(scope, "anyone"), true);
  assert.equal(canAccessOwner(scope, null), true);
  assert.equal(canAccessOwner(scope, undefined), true);
});

test("canAccessOwner: self scope only allows own id", () => {
  const scope: DataAccessScope = {
    userId: "u1",
    role: "member",
    permissions: {},
    teamId: null,
    kind: "self",
    visibleUserIds: ["u1"],
  };
  assert.equal(canAccessOwner(scope, "u1"), true);
  assert.equal(canAccessOwner(scope, "u2"), false);
  assert.equal(canAccessOwner(scope, null), false);
});

// ---------------------------------------------------------------------------
// filterRowsByDataScope
// ---------------------------------------------------------------------------

test("filterRowsByDataScope: all scope returns all rows", () => {
  const scope: DataAccessScope = {
    userId: "u1",
    role: "member",
    permissions: {},
    teamId: null,
    kind: "all",
    visibleUserIds: ["u1"],
  };
  const rows = [
    { id: "r1", owner: "u1" },
    { id: "r2", owner: "u2" },
  ];
  const result = filterRowsByDataScope(scope, rows, (r) => r.owner);
  assert.equal(result.length, 2);
});

test("filterRowsByDataScope: self scope filters to own rows only", () => {
  const scope: DataAccessScope = {
    userId: "u1",
    role: "member",
    permissions: {},
    teamId: null,
    kind: "self",
    visibleUserIds: ["u1"],
  };
  const rows = [
    { id: "r1", owner: "u1" },
    { id: "r2", owner: "u2" },
    { id: "r3", owner: "u1" },
  ];
  const result = filterRowsByDataScope(scope, rows, (r) => r.owner);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((r) => r.id).sort(),
    ["r1", "r3"],
  );
});

test("filterRowsByDataScope: team scope filters to visible users", () => {
  const scope: DataAccessScope = {
    userId: "u1",
    role: "admin",
    permissions: {},
    teamId: "team-A",
    kind: "team",
    visibleUserIds: ["u1", "u2"],
  };
  const rows = [
    { id: "r1", owner: "u1" },
    { id: "r2", owner: "u2" },
    { id: "r3", owner: "u3" },
  ];
  const result = filterRowsByDataScope(scope, rows, (r) => r.owner);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((r) => r.id).sort(),
    ["r1", "r2"],
  );
});

// ---------------------------------------------------------------------------
// getActiveVisibleUserIds
// ---------------------------------------------------------------------------

test("getActiveVisibleUserIds: returns activeVisibleUserIds when present", () => {
  const scope: DataAccessScope = {
    userId: "u1",
    role: "member",
    permissions: {},
    teamId: null,
    kind: "all",
    visibleUserIds: ["u1", "u2", "u3"],
    activeVisibleUserIds: ["u1", "u3"],
  };
  assert.deepEqual(getActiveVisibleUserIds(scope), ["u1", "u3"]);
});

test("getActiveVisibleUserIds: falls back to visibleUserIds when activeVisibleUserIds is absent", () => {
  const scope: DataAccessScope = {
    userId: "u1",
    role: "member",
    permissions: {},
    teamId: null,
    kind: "all",
    visibleUserIds: ["u1", "u2"],
  };
  assert.deepEqual(getActiveVisibleUserIds(scope), ["u1", "u2"]);
});

// ---------------------------------------------------------------------------
// resolveCollaborationScope — 数据管理模块范围
// ---------------------------------------------------------------------------

function makeMemberScope(overrides: Partial<DataAccessScope> = {}): DataAccessScope {
  return {
    userId: "member-1",
    role: "member",
    permissions: {},
    teamId: "company-1",
    kind: "self",
    visibleUserIds: ["member-1"],
    ...overrides,
  };
}

test("resolveCollaborationScope: 有公司归属的组员放宽为本公司可见成员（含本公司归档行，排除他公司归档行）", async () => {
  const supabase = makeFakeSupabase([
    { id: "member-1", team_id: "company-1", membership_status: "active" },
    { id: "member-2", team_id: "company-1", membership_status: "active" },
    { id: "outsider", team_id: "company-2", membership_status: "active" },
    { id: "archived-1", team_id: null, membership_status: "archived", archive_snapshot: { team_id: "company-1" } },
    { id: "archived-other", team_id: null, membership_status: "archived", archive_snapshot: { team_id: "company-2" } },
  ]);

  const resolution = await resolveCollaborationScope(supabase as never, makeMemberScope());

  assert.equal(resolution.restrictToSelf, false);
  assert.deepEqual(resolution.visibleUserIds.sort(), ["archived-1", "member-1", "member-2"]);
  assert.deepEqual(resolution.activeVisibleUserIds.sort(), ["member-1", "member-2"]);
});

test("resolveCollaborationScope: 组员放宽范围与同公司 admin 的全局范围结构同源", async () => {
  const supabase = makeFakeSupabase([
    { id: "admin-1", team_id: "company-1", membership_status: "active" },
    { id: "member-1", team_id: "company-1", membership_status: "active" },
    { id: "member-2", team_id: "company-1", membership_status: "active" },
    { id: "other-company-member", team_id: "company-2", membership_status: "active" },
    { id: "archived-1", team_id: null, membership_status: "archived", archive_snapshot: { team_id: "company-1" } },
    { id: "archived-other", team_id: null, membership_status: "archived", archive_snapshot: { team_id: "company-2" } },
  ]);

  const adminProfile = makeProfile({
    id: "admin-1",
    role: "admin",
    data_scope: "team",
    team_id: "company-1",
  });
  const adminScope = await buildDataAccessScope(supabase as never, "admin-1", { profile: adminProfile });
  assert.ok(adminScope);

  const resolution = await resolveCollaborationScope(supabase as never, makeMemberScope());

  assert.equal(resolution.restrictToSelf, false);
  assert.deepEqual(resolution.visibleUserIds.sort(), adminScope.visibleUserIds.slice().sort());
  assert.deepEqual(resolution.activeVisibleUserIds.sort(), adminScope.activeVisibleUserIds!.slice().sort());
});

test("resolveCollaborationScope: 无公司归属的组员安全降级为只看自己", async () => {
  const supabase = makeFakeSupabase([{ id: "u1" }, { id: "u2" }]);

  const resolution = await resolveCollaborationScope(supabase as never, makeMemberScope({
    userId: "u1",
    teamId: null,
    visibleUserIds: ["u1"],
  }));

  assert.equal(resolution.restrictToSelf, true);
  assert.deepEqual(resolution.visibleUserIds, ["u1"]);
  assert.deepEqual(resolution.activeVisibleUserIds, ["u1"]);
});

test("resolveCollaborationScope: team / all 范围原样透传，不做二次放宽", async () => {
  const supabase = makeFakeSupabase([]);

  const teamScope = makeMemberScope({
    userId: "admin-1",
    role: "admin",
    kind: "team",
    visibleUserIds: ["admin-1", "member-1"],
    activeVisibleUserIds: ["admin-1"],
  });
  const teamResolution = await resolveCollaborationScope(supabase as never, teamScope);
  assert.equal(teamResolution.restrictToSelf, false);
  assert.deepEqual(teamResolution.visibleUserIds, teamScope.visibleUserIds);
  assert.deepEqual(teamResolution.activeVisibleUserIds, ["admin-1"]);

  const allScope = makeMemberScope({
    userId: "owner-1",
    role: "owner",
    teamId: null,
    kind: "all",
    visibleUserIds: ["owner-1", "member-1"],
    activeVisibleUserIds: undefined,
  });
  const allResolution = await resolveCollaborationScope(supabase as never, allScope);
  assert.equal(allResolution.restrictToSelf, false);
  assert.deepEqual(allResolution.visibleUserIds, allScope.visibleUserIds);
  assert.deepEqual(allResolution.activeVisibleUserIds, allScope.visibleUserIds);
});

test("组员放宽只限数据管理模块：全局 self 范围不因 team_id 外溢", async () => {
  assert.equal(inferDataScope("member", {}), "self");

  const profile = makeProfile({ id: "member-1", role: "member", team_id: "company-1" });
  const supabase = makeFakeSupabase([
    { id: "member-1", team_id: "company-1" },
    { id: "member-2", team_id: "company-1" },
  ]);

  const scope = await buildDataAccessScope(supabase as never, "member-1", { profile });

  assert.ok(scope);
  assert.equal(scope.kind, "self");
  assert.deepEqual(scope.visibleUserIds, ["member-1"]);
});
