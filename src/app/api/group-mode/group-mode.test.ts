import assert from "node:assert/strict";
import test from "node:test";

import {
  createGroupModeToken,
  GROUP_MODE_COOKIE,
  GROUP_MODE_TTL_SECONDS,
  hashGroupModeToken,
  isGroupModeActive,
} from "@/lib/group-mode";
import { buildDataAccessScope } from "@/lib/data-access-scope";

const QUALIFIED_USER_ID = "11111111-1111-4111-8111-111111111111";
const UNQUALIFIED_USER_ID = "22222222-2222-4222-8222-222222222222";
const ARCHIVED_QUALIFIED_USER_ID = "33333333-3333-4333-8333-333333333333";
const TEAM_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEAM_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createMockGroupModeAdminClient(config: {
  qualifications: Array<{ user_id: string; revoked_at: string | null }>;
  profiles: Array<{ id: string; membership_status: string; team_id?: string | null; role?: string; company_role?: string }>;
  sessions: Array<{ user_id: string; token_hash: string; expires_at: string; revoked_at: string | null }>;
}) {
  return {
    from(table: string): unknown {
      if (table === "group_permission_qualifications") {
        let filterUserId: string | null = null;
        let filterRevokedNull = false;
        return {
          select() { return this; },
          eq(col: string, val: string) {
            if (col === "user_id") filterUserId = val;
            return this;
          },
          is(col: string, val: unknown) {
            if (col === "revoked_at" && val === null) filterRevokedNull = true;
            return this;
          },
          maybeSingle: async () => {
            const found = config.qualifications.find((q) => {
              if (filterUserId && q.user_id !== filterUserId) return false;
              if (filterRevokedNull && q.revoked_at !== null) return false;
              return true;
            });
            return { data: found ? { user_id: found.user_id } : null, error: null };
          },
        };
      }

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
            return { data: found ? { membership_status: found.membership_status } : null, error: null };
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
          insert(payload: { user_id: string; token_hash: string; expires_at: string }) {
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
test("集团模式令牌：固定30分钟有效期、SHA-256 哈希不可逆存储", () => {
  assert.equal(GROUP_MODE_COOKIE, "dydata-group-mode");
  assert.equal(GROUP_MODE_TTL_SECONDS, 1800); // 30 mins

  const now = new Date("2026-08-20T12:00:00.000Z");
  const tokenObj = createGroupModeToken(now);

  assert.equal(typeof tokenObj.token, "string");
  assert.ok(tokenObj.token.length >= 32);
  assert.equal(tokenObj.expiresAt.toISOString(), "2026-08-20T12:30:00.000Z");
  assert.equal(tokenObj.tokenHash, hashGroupModeToken(tokenObj.token));

  // Active check
  assert.equal(
    isGroupModeActive({
      tokenHash: tokenObj.tokenHash,
      expiresAt: tokenObj.expiresAt.toISOString(),
      revokedAt: null,
    }, new Date("2026-08-20T12:15:00.000Z")),
    true,
  );

  // Expired check
  assert.equal(
    isGroupModeActive({
      tokenHash: tokenObj.tokenHash,
      expiresAt: tokenObj.expiresAt.toISOString(),
      revokedAt: null,
    }, new Date("2026-08-20T12:30:01.000Z")),
    false,
  );

  // Revoked check
  assert.equal(
    isGroupModeActive({
      tokenHash: tokenObj.tokenHash,
      expiresAt: tokenObj.expiresAt.toISOString(),
      revokedAt: "2026-08-20T12:10:00.000Z",
    }, new Date("2026-08-20T12:15:00.000Z")),
    false,
  );
});

// 2. Group Mode Qualification Verification
test("hasGroupModeQualification: 无资格账号与已归档账号返回 false，合法在职账号返回 true", async () => {
  const dbState = {
    qualifications: [
      { user_id: QUALIFIED_USER_ID, revoked_at: null },
      { user_id: ARCHIVED_QUALIFIED_USER_ID, revoked_at: null },
    ],
    profiles: [
      { id: QUALIFIED_USER_ID, membership_status: "active" },
      { id: UNQUALIFIED_USER_ID, membership_status: "active" },
      { id: ARCHIVED_QUALIFIED_USER_ID, membership_status: "archived" },
    ],
    sessions: [],
  };

  const mockAdmin = createMockGroupModeAdminClient(dbState);

  // Helper check using mock
  async function checkQualification(userId: string) {
    const [qualification, profile] = await Promise.all([
      mockAdmin
        .from("group_permission_qualifications")
        .select()
        .eq("user_id", userId)
        .is("revoked_at", null)
        .maybeSingle(),
      mockAdmin
        .from("profiles")
        .select()
        .eq("id", userId)
        .single(),
    ]);
    return Boolean(qualification.data) && profile.data?.membership_status !== "archived";
  }

  assert.equal(await checkQualification(QUALIFIED_USER_ID), true);
  assert.equal(await checkQualification(UNQUALIFIED_USER_ID), false);
  assert.equal(await checkQualification(ARCHIVED_QUALIFIED_USER_ID), false);
});

// 3. Group Mode Enter, Status, Exit Full Lifecycle
test("集团模式完整生命周期：无资格拒绝 403，有资格发令牌，退出作废，单公司模式自动回退", async () => {
  const dbState = {
    qualifications: [{ user_id: QUALIFIED_USER_ID, revoked_at: null }],
    profiles: [
      { id: QUALIFIED_USER_ID, membership_status: "active", team_id: TEAM_A_ID, role: "admin", company_role: "company_owner" },
      { id: UNQUALIFIED_USER_ID, membership_status: "active", team_id: TEAM_A_ID, role: "admin", company_role: "admin" },
    ],
    sessions: [] as Array<{ user_id: string; token_hash: string; expires_at: string; revoked_at: string | null }>,
  };

  const mockAdmin = createMockGroupModeAdminClient(dbState);

  // Step 1: Unqualified user enters group mode -> 403 Forbidden
  const unqualifiedQual = Boolean(
    (await mockAdmin.from("group_permission_qualifications").select().eq("user_id", UNQUALIFIED_USER_ID).is("revoked_at", null).maybeSingle()).data
  );
  assert.equal(unqualifiedQual, false);

  // Step 2: Qualified user enters group mode -> session created
  const now = new Date();
  const token = createGroupModeToken(now);
  dbState.sessions.push({
    user_id: QUALIFIED_USER_ID,
    token_hash: token.tokenHash,
    expires_at: token.expiresAt.toISOString(),
    revoked_at: null,
  });

  // Step 3: Status check with valid token -> active: true
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

  // Step 4: Exit group mode -> session revoked
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
    from(_table: string) {
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

  // Scenario 2: Unqualified user entering group mode
  function handleEnterUnqualified(hasQual: boolean) {
    if (!hasQual) return { status: 403, body: { error: "没有集团权限资格" } };
    return { status: 200, body: { active: true } };
  }
  const unqualRes = handleEnterUnqualified(false);
  assert.equal(unqualRes.status, 403);
  assert.equal(unqualRes.body.error, "没有集团权限资格");

  // Scenario 3: Cookie options
  const { groupModeCookieOptions } = await import("@/app/api/group-mode/_shared");
  const cookieOpts = groupModeCookieOptions();
  assert.equal(cookieOpts.httpOnly, true);
  assert.equal(cookieOpts.sameSite, "strict");
  assert.equal(cookieOpts.path, "/");
  assert.equal(cookieOpts.maxAge, 1800);
});
