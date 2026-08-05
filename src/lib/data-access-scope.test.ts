import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDataAccessScope,
  canAccessOwner,
  filterRowsByDataScope,
  getActiveVisibleUserIds,
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
function makeFakeSupabase(rows: Array<{ id: string; team_id?: string | null; membership_status?: string | null }>) {
  function builder() {
    let filtered = [...rows];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (_col: string, val: string) => {
        filtered = filtered.filter((r) => r.team_id === val);
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

test("buildDataAccessScope: team scope returns all members of the same team", async () => {
  const profile = makeProfile({ id: "u1", data_scope: "team", team_id: "team-A" });
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

// ---------------------------------------------------------------------------
// buildDataAccessScope — all scope
// ---------------------------------------------------------------------------

test("buildDataAccessScope: all scope returns every user", async () => {
  const profile = makeProfile({ id: "u1", data_scope: "all" });
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
  const profile = makeProfile({ id: "u1", data_scope: "all" });
  const supabase = makeFakeSupabase([
    { id: "u1", membership_status: "active" },
    { id: "u2", membership_status: "removed" },
    { id: "u3", membership_status: "active" },
  ]);

  const scope = await buildDataAccessScope(supabase as never, "u1", { profile });
  assert.ok(scope);
  assert.deepEqual(scope.activeVisibleUserIds!.sort(), ["u1", "u3"]);
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
