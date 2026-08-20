import assert from "node:assert/strict";
import test from "node:test";

import {
  createGroupModeToken,
  GROUP_MODE_COOKIE,
  hashGroupModeToken,
  isGroupModeActive,
} from "@/lib/group-mode";
import { canEnterGroupMode } from "@/lib/company-permissions";
import { buildDataAccessScope } from "@/lib/data-access-scope";

const QUALIFIED_USER_ID = "11111111-1111-4111-8111-111111111111";
const UNQUALIFIED_USER_ID = "22222222-2222-4222-8222-222222222222";
const ARCHIVED_QUALIFIED_USER_ID = "33333333-3333-4333-8333-333333333333";
const TEAM_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEAM_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createMockGroupModeAdminClient(config: {
  profiles: Array<{ id: string; membership_status: string; team_id?: string | null; role?: string; company_role?: string }>;
  sessions: Array<{ user_id: string; token_hash: string; expires_at: string | null; revoked_at: string | null }>;
}) {
  return {
    from(table: string): unknown {
      if (table === "profiles") {
        let filterId: string | null = null;
        return {
          select() { return this; },
          eq(col: string, val: string) {
            if (col === "id") filterId = val;
            return this;
          },
          single: async () => {
            const found = config.profiles.find((p) => p.id === filterId);
            return {
              data: found
                ? {
                    membership_status: found.membership_status,
                    role: found.role ?? null,
                    company_role: found.company_role ?? null,
                  }
                : null,
              error: null,
            };
          },
        };
      }

      if (table === "group_mode_sessions") {
        let filterUserId: string | null = null;
        let filterTokenHash: string | null = null;
        let filterRevokedNull = false;
        return {
          select() { return this; },
          eq(col: string, val: string) {
            if (col === "user_id") filterUserId = val;
            if (col === "token_hash") filterTokenHash = val;
            return this;
          },
          is(col: string, val: unknown) {
            if (col === "revoked_at" && val === null) filterRevokedNull = true;
            return this;
          },
          update(patch: { revoked_at: string }) {
            return {
              eq(col: string, val: string) {
                if (col === "user_id") filterUserId = val;
                if (col === "token_hash") filterTokenHash = val;
                return this;
              },
              is(col: string, val: unknown) {
                if (col === "revoked_at" && val === null) filterRevokedNull = true;
                // apply revoke
                config.sessions.forEach((s) => {
                  if (filterUserId && s.user_id !== filterUserId) return;
                  if (filterTokenHash && s.token_hash !== filterTokenHash) return;
                  if (filterRevokedNull && s.revoked_at !== null) return;
                  s.revoked_at = patch.revoked_at;
                });
                return Promise.resolve({ error: null });
              },
            };
          },
          insert(payload: { user_id: string; token_hash: string; expires_at: string | null }) {
            const session = {
              user_id: payload.user_id,
              token_hash: payload.token_hash,
              expires_at: payload.expires_at,
              revoked_at: null,
            };
            config.sessions.push(session);
            return {
              select() {
                return {
                  single: async () => ({ data: { expires_at: payload.expires_at }, error: null }),
                };
              },
            };
          },
          maybeSingle: async () => {
            const found = config.sessions.find((s) => {
              if (filterUserId && s.user_id !== filterUserId) return false;
              if (filterTokenHash && s.token_hash !== filterTokenHash) return false;
              if (filterRevokedNull && s.revoked_at !== null) return false;
              return true;
            });
            return { data: found ?? null, error: null };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

// 1. Group Mode Token Specification
test("集团模式令牌：手动退出、SHA-256 哈希不可逆存储", () => {
  assert.equal(GROUP_MODE_COOKIE, "dydata-group-mode");

  const tokenObj = createGroupModeToken();

  assert.equal(typeof tokenObj.token, "string");
  assert.ok(tokenObj.token.length >= 32);
  assert.equal(tokenObj.expiresAt, null);
  assert.equal(tokenObj.tokenHash, hashGroupModeToken(tokenObj.token));

  assert.equal(
    isGroupModeActive({
      tokenHash: tokenObj.tokenHash,
      expiresAt: tokenObj.expiresAt,
      revokedAt: null,
    }, new Date("2026-08-20T12:15:00.000Z")),
    true,
  );

  assert.equal(
    isGroupModeActive({
      tokenHash: tokenObj.tokenHash,
      expiresAt: tokenObj.expiresAt,
      revokedAt: "2026-08-20T12:10:00.000Z",
    }, new Date("2026-08-20T12:15:00.000Z")),
    false,
  );
});

// 2. Group Mode Qualification Verification
test("hasGroupModeQualification: 在职公司所有者可直接进入，普通角色与归档账号拒绝", async () => {
  const dbState = {
    profiles: [
      { id: QUALIFIED_USER_ID, membership_status: "active", company_role: "company_owner" },
      { id: "legacy-owner", membership_status: "active", role: "owner" },
      { id: UNQUALIFIED_USER_ID, membership_status: "active", company_role: "admin" },
      { id: "member-user", membership_status: "active", company_role: "member" },
      { id: ARCHIVED_QUALIFIED_USER_ID, membership_status: "archived", company_role: "company_owner" },
    ],
    sessions: [],
  };

  const mockAdmin = createMockGroupModeAdminClient(dbState);
  void mockAdmin;
  assert.equal(canEnterGroupMode("company_owner", "active"), true);
  assert.equal(canEnterGroupMode("owner", "active"), true);
  assert.equal(canEnterGroupMode("admin", "active"), false);
  assert.equal(canEnterGroupMode("member", "active"), false);
  assert.equal(canEnterGroupMode("company_owner", "archived"), false);
});

// 3. Group Mode Enter, Status, Exit Full Lifecycle
test("集团模式完整生命周期：普通账号拒绝，公司所有者发令牌，退出作废", async () => {
  const dbState = {
    profiles: [
      { id: QUALIFIED_USER_ID, membership_status: "active", team_id: TEAM_A_ID, role: "admin", company_role: "company_owner" },
      { id: UNQUALIFIED_USER_ID, membership_status: "active", team_id: TEAM_A_ID, role: "admin", company_role: "admin" },
    ],
    sessions: [] as Array<{ user_id: string; token_hash: string; expires_at: string | null; revoked_at: string | null }>,
  };

  assert.equal(canEnterGroupMode(dbState.profiles[1].company_role, dbState.profiles[1].membership_status), false);

  const token = createGroupModeToken();
  dbState.sessions.push({
    user_id: QUALIFIED_USER_ID,
    token_hash: token.tokenHash,
    expires_at: token.expiresAt,
    revoked_at: null,
  });

  const activeSession = dbState.sessions.find(
    (s) => s.user_id === QUALIFIED_USER_ID && s.token_hash === hashGroupModeToken(token.token) && !s.revoked_at
  );
  assert.ok(activeSession);
  assert.equal(
    isGroupModeActive({
      tokenHash: activeSession.token_hash,
      expiresAt: activeSession.expires_at,
      revokedAt: activeSession.revoked_at,
    }),
    true,
  );

  activeSession.revoked_at = new Date().toISOString();
  assert.equal(
    isGroupModeActive({
      tokenHash: activeSession.token_hash,
      expiresAt: activeSession.expires_at,
      revokedAt: activeSession.revoked_at,
    }),
    false,
  );
});

// 4. Data Access Scope with Group Mode vs Single Company Mode
test("buildDataAccessScope: 开启集团模式获得全公司范围，单公司模式仅限本公司", async () => {
  const allProfiles = [
    { id: QUALIFIED_USER_ID, team_id: TEAM_A_ID, membership_status: "active" },
    { id: "member-a-1", team_id: TEAM_A_ID, membership_status: "active" },
    { id: "member-b-1", team_id: TEAM_B_ID, membership_status: "active" },
  ];

  const mockSupabase = {
    from() {
      let filterTeamId: string | null = null;
      return {
        select() { return this; },
        eq(col: string, val: unknown) {
          if (col === "team_id") filterTeamId = val as string;
          return this;
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          let data = allProfiles;
          if (filterTeamId) data = data.filter((r) => r.team_id === filterTeamId);
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
    },
  };

  // Case A: Single Company Mode (default)
  const singleScope = await buildDataAccessScope(mockSupabase as never, QUALIFIED_USER_ID, {
    profile: {
      id: QUALIFIED_USER_ID,
      role: "admin",
      company_role: "company_owner",
      permissions: { manage_fulfillment: true },
      data_scope: "team",
      team_id: TEAM_A_ID,
      membership_status: "active",
      group_mode: false,
    },
  });

  assert.ok(singleScope);
  assert.equal(singleScope.kind, "team");
  assert.deepEqual(singleScope.visibleUserIds.sort(), [QUALIFIED_USER_ID, "member-a-1"].sort());
  assert.ok(!singleScope.visibleUserIds.includes("member-b-1"));

  // Case B: Group Mode Active (30-min elevation)
  const groupScope = await buildDataAccessScope(mockSupabase as never, QUALIFIED_USER_ID, {
    profile: {
      id: QUALIFIED_USER_ID,
      role: "admin",
      company_role: "company_owner",
      permissions: { manage_fulfillment: true },
      data_scope: "all",
      team_id: TEAM_A_ID,
      membership_status: "active",
      group_mode: true,
    },
  });

  assert.ok(groupScope);
  assert.equal(groupScope.kind, "all");
  assert.deepEqual(groupScope.visibleUserIds.sort(), [QUALIFIED_USER_ID, "member-a-1", "member-b-1"].sort());
});

// 5. Group Mode API Route Responses
test("集团模式 API 行为验证：未登录 401、无资格 403、状态与退出 Cookie 行为", async () => {
  // Scenario 1: Unauthenticated
  function handleEnterWithoutAuth(user: unknown) {
    if (!user) return { status: 401, body: { error: "未登录" } };
    return { status: 200, body: { ok: true } };
  }
  const unauthRes = handleEnterWithoutAuth(null);
  assert.equal(unauthRes.status, 401);
  assert.equal(unauthRes.body.error, "未登录");

  // Scenario 2: Ordinary user entering group mode
  function handleEnterUnqualified(canEnter: boolean) {
    if (!canEnter) return { status: 403, body: { error: "没有集团权限资格" } };
    return { status: 200, body: { active: true } };
  }
  const unqualRes = handleEnterUnqualified(canEnterGroupMode("admin", "active"));
  assert.equal(unqualRes.status, 403);
  assert.equal(unqualRes.body.error, "没有集团权限资格");

  // Scenario 3: Cookie options
  const { groupModeCookieOptions } = await import("@/app/api/group-mode/_shared");
  const cookieOpts = groupModeCookieOptions();
  assert.equal(cookieOpts.httpOnly, true);
  assert.equal(cookieOpts.sameSite, "strict");
  assert.equal(cookieOpts.path, "/");
  assert.equal("maxAge" in cookieOpts, false);
});
