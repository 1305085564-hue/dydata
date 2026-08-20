import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import test from "node:test";

import {
  buildDataAccessScope,
  canAccessOwner,
  filterRowsByDataScope,
} from "@/lib/data-access-scope";
import {
  requireVisibleProductionUser,
} from "@/app/api/production/_shared";
import { buildReviewExemptionResponse } from "@/app/api/exemptions/review/route";
import { buildSubmissionScreenshotFileResponse } from "@/app/api/submission-screenshots/file/route";
import { buildPermissionRequestApplyResponse } from "@/app/api/permission-requests/apply/route";

const TEAM_A = "11111111-1111-4111-8111-111111111111";
const TEAM_B = "22222222-2222-4222-8222-222222222222";

const MANAGER_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_A1_ID = "a1111111-1111-4111-8111-111111111111";
const MEMBER_A2_ARCHIVED_ID = "a2222222-2222-4222-8222-222222222222";

const MANAGER_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEMBER_B1_ID = "b1111111-1111-4111-8111-111111111111";
const MEMBER_B2_ID = "b2222222-2222-4222-8222-222222222222";

function createMockScopeSupabase(rows: Array<{
  id: string;
  role?: string;
  company_role?: string;
  team_id?: string | null;
  membership_status?: string;
  archive_snapshot?: { team_id?: string | null } | null;
}>) {
  return {
    from(table: string) {
      assert.equal(table, "profiles");
      let selectedCols = "";
      let filterTeamId: string | null = null;

      return {
        select(cols: string) {
          selectedCols = cols;
          return this;
        },
        eq(col: string, val: unknown) {
          if (col === "team_id") filterTeamId = val as string;
          return this;
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          let data = rows;
          if (filterTeamId) {
            data = data.filter((r) => r.team_id === filterTeamId);
          }
          return Promise.resolve(resolve({
            data: data.map((r) => {
              const res: Record<string, unknown> = { id: r.id };
              if (selectedCols.includes("membership_status")) res.membership_status = r.membership_status;
              if (selectedCols.includes("archive_snapshot")) res.archive_snapshot = r.archive_snapshot;
              return res;
            }),
            error: null,
          }));
        },
      };
    },
  };
}

// 1. Data Access Scope Cross-Team Isolation
test("buildDataAccessScope: 团队 A 主管的可见范围严密限定在团队 A，绝不包含团队 B 成员", async () => {
  const allProfiles = [
    { id: MANAGER_A_ID, team_id: TEAM_A, membership_status: "active" },
    { id: MEMBER_A1_ID, team_id: TEAM_A, membership_status: "active" },
    { id: MEMBER_A2_ARCHIVED_ID, team_id: null, membership_status: "archived", archive_snapshot: { team_id: TEAM_A } },
    { id: MANAGER_B_ID, team_id: TEAM_B, membership_status: "active" },
    { id: MEMBER_B1_ID, team_id: TEAM_B, membership_status: "active" },
    { id: MEMBER_B2_ID, team_id: TEAM_B, membership_status: "active" },
  ];

  const mockSupabase = createMockScopeSupabase(allProfiles);

  const scopeA = await buildDataAccessScope(mockSupabase as never, MANAGER_A_ID, {
    profile: {
      id: MANAGER_A_ID,
      role: "admin",
      company_role: "admin",
      permissions: { manage_fulfillment: true, view_analytics: true },
      data_scope: "team",
      team_id: TEAM_A,
      membership_status: "active",
      group_mode: false,
    },
  });

  assert.ok(scopeA);
  assert.equal(scopeA.kind, "team");
  assert.equal(scopeA.teamId, TEAM_A);

  // Active scope only contains active team A members
  assert.deepEqual(scopeA.activeVisibleUserIds?.sort(), [MANAGER_A_ID, MEMBER_A1_ID].sort());
  assert.ok(!scopeA.activeVisibleUserIds?.includes(MEMBER_A2_ARCHIVED_ID));
  assert.ok(!scopeA.activeVisibleUserIds?.includes(MEMBER_B1_ID));
  assert.ok(!scopeA.activeVisibleUserIds?.includes(MANAGER_B_ID));

  // Historical scope contains active + archived team A members, but NO team B members
  assert.deepEqual(scopeA.visibleUserIds.sort(), [MANAGER_A_ID, MEMBER_A1_ID, MEMBER_A2_ARCHIVED_ID].sort());
  assert.ok(!scopeA.visibleUserIds.includes(MEMBER_B1_ID));
  assert.ok(!scopeA.visibleUserIds.includes(MEMBER_B2_ID));
  assert.ok(!scopeA.visibleUserIds.includes(MANAGER_B_ID));
});

test("canAccessOwner & filterRowsByDataScope: 团队 A 主管无法查看团队 B 成员的日报草稿与记录", () => {
  const scopeA = {
    userId: MANAGER_A_ID,
    role: "admin" as const,
    teamId: TEAM_A,
    kind: "team" as const,
    permissions: { manage_fulfillment: true },
    visibleUserIds: [MANAGER_A_ID, MEMBER_A1_ID, MEMBER_A2_ARCHIVED_ID],
    activeVisibleUserIds: [MANAGER_A_ID, MEMBER_A1_ID],
  };

  // canAccessOwner checks
  assert.equal(canAccessOwner(scopeA, MEMBER_A1_ID), true);
  assert.equal(canAccessOwner(scopeA, MEMBER_B1_ID), false);
  assert.equal(canAccessOwner(scopeA, MANAGER_B_ID), false);
  assert.equal(canAccessOwner(scopeA, null), false);
  assert.equal(canAccessOwner(scopeA, undefined), false);

  // filterRowsByDataScope checks
  const mixedRows = [
    { id: "report-a1", user_id: MEMBER_A1_ID, title: "团队A组员日报" },
    { id: "report-b1", user_id: MEMBER_B1_ID, title: "团队B组员日报" },
    { id: "report-b2", user_id: MEMBER_B2_ID, title: "团队B组员私密草稿" },
    { id: "report-mgr-a", user_id: MANAGER_A_ID, title: "团队A主管日报" },
  ];

  const filtered = filterRowsByDataScope(scopeA, mixedRows, (r) => r.user_id);
  assert.deepEqual(
    filtered.map((r) => r.id),
    ["report-a1", "report-mgr-a"],
  );
  assert.doesNotMatch(JSON.stringify(filtered), /团队B组员/);
});

// 2. Production User Visibility Guard
test("requireVisibleProductionUser: 跨团队操作目标成员直接返回 403", () => {
  const authA = {
    supabase: {} as never,
    actor: {
      userId: MANAGER_A_ID,
      role: "admin" as const,
      permissions: { manage_fulfillment: true },
      name: "主管A",
      dataScope: "team" as const,
      teamId: TEAM_A,
      companyRole: "admin" as const,
    },
    scope: {
      userId: MANAGER_A_ID,
      role: "admin" as const,
      teamId: TEAM_A,
      kind: "team" as const,
      permissions: { manage_fulfillment: true },
      visibleUserIds: [MANAGER_A_ID, MEMBER_A1_ID],
      activeVisibleUserIds: [MANAGER_A_ID, MEMBER_A1_ID],
    },
  };

  // Team A member -> allowed (returns null)
  const okResult = requireVisibleProductionUser(authA, MEMBER_A1_ID);
  assert.equal(okResult, null);

  // Team B member -> blocked with 403
  const blockedResult = requireVisibleProductionUser(authA, MEMBER_B1_ID);
  assert.ok(blockedResult);
  assert.equal(blockedResult.status, 403);
});

// 3. Exemption Review Cross-Team Anti-IDOR & Atomic Interception
test("buildReviewExemptionResponse: 团队 A 主管审批团队 B 组员申请被 RPC 拦截并返回 403", async () => {
  const fakeAuth = {
    supabase: {
      rpc: async () => {
        // DB RPC throws 42501 when target is outside active scope
        return {
          data: null,
          error: { code: "42501", message: "permission denied" },
        };
      },
    } as never,
    actor: {
      userId: MANAGER_A_ID,
      role: "admin" as const,
      permissions: { manage_fulfillment: true },
      name: "主管A",
      dataScope: "team" as const,
      teamId: TEAM_A,
      companyRole: "admin" as const,
    },
  };

  const response = await buildReviewExemptionResponse(
    {
      request_id: "00000000-0000-4000-8000-000000000001",
      action: "approved",
    },
    {
      requireExemptionManagerActor: async () => fakeAuth as never,
      reviewExemptionRequestAtomically: async (input) => {
        const { error } = await input.supabase.rpc("review_exemption_request_atomically", {});
        if (error?.code === "42501") {
          return { ok: false, status: 403, message: "不能操作当前管理范围外的成员" };
        }
        return { ok: true, data: {} };
      },
    },
  );

  assert.equal(response.status, 403);
  const json = await response.json();
  assert.equal(json.error, "不能操作当前管理范围外的成员");
});

test("buildReviewExemptionResponse: 恶意篡改请求体 (非 UUID / 非法 action) 被前置严格拦截", async () => {
  const fakeDeps = {
    requireExemptionManagerActor: async () => ({
      supabase: {} as never,
      adminSupabase: {} as never,
      actor: { userId: MANAGER_A_ID } as never,
      scope: {} as never,
    }),
    reviewExemptionRequestAtomically: async () => ({ ok: true as const, data: {} }),
  };

  // Malformed UUID
  const res1 = await buildReviewExemptionResponse({ request_id: "not-a-uuid", action: "approved" }, fakeDeps as never);
  assert.equal(res1.status, 400);
  assert.equal((await res1.json()).error, "request_id 必须是 uuid");

  // Invalid Action
  const res2 = await buildReviewExemptionResponse({
    request_id: "00000000-0000-4000-8000-000000000001",
    action: "bypass_and_grant",
  }, fakeDeps as never);
  assert.equal(res2.status, 400);
  assert.equal((await res2.json()).error, "action 必须是 approved 或 rejected");
});

// 4. Submission Screenshot Isolation
test("buildSubmissionScreenshotFileResponse: 团队 A 主管试图读取团队 B 成员截图返回 403", async () => {
  const request = new Request("http://localhost/api/submission-screenshots/file?path=" + MEMBER_B1_ID + "/2026-08-20/shot.png");
  const response = await buildSubmissionScreenshotFileResponse(request, {
    getUser: async () => ({ id: MANAGER_A_ID }),
    getVisibleUserIds: async () => [MANAGER_A_ID, MEMBER_A1_ID],
    createSignedUrl: async () => ({ signedUrl: "https://example.com/signed", error: null }),
  });

  assert.equal(response.status, 403);
  const json = await response.json();
  assert.equal(json.error, "无权读取该截图");
});

test("buildSubmissionScreenshotFileResponse: 团队 A 主管读取本团队组员截图允许访问", async () => {
  const request = new Request("http://localhost/api/submission-screenshots/file?path=" + MEMBER_A1_ID + "/2026-08-20/shot.png");
  const response = await buildSubmissionScreenshotFileResponse(request, {
    getUser: async () => ({ id: MANAGER_A_ID }),
    getVisibleUserIds: async () => [MANAGER_A_ID, MEMBER_A1_ID],
    createSignedUrl: async () => ({ signedUrl: "https://example.com/signed.png", error: null }),
  });

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("Location"), "https://example.com/signed.png");
});

// 5. Permission Request Notifications Isolation
test("buildPermissionRequestApplyResponse: 团队 A 组员申请权限时只通知团队 A 管理员，绝不跨团队触达团队 B", async () => {
  const emittedRecipients: string[][] = [];

  const mockAdminSupabase = {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: (_cols: string) => ({
            eq: (col: string, val: unknown) => ({
              single: async () => {
                assert.equal(val, MEMBER_A1_ID);
                return {
                  data: { id: MEMBER_A1_ID, name: "组员A1", team_id: TEAM_A },
                  error: null,
                };
              },
            }),
            in: async (_col: string, _vals: unknown[]) => {
              return {
                data: [
                  { id: MANAGER_A_ID, role: "admin", company_role: "admin", permissions: { manage_members: true }, team_id: TEAM_A, membership_status: "active" },
                  { id: MANAGER_B_ID, role: "admin", company_role: "admin", permissions: { manage_members: true }, team_id: TEAM_B, membership_status: "active" },
                ],
                error: null,
              };
            },
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const req = new NextRequest("http://localhost/api/permission-requests/apply", {
    method: "POST",
    body: JSON.stringify({ moduleTitle: "数据分析", currentPath: "/admin/analytics" }),
  });

  const response = await buildPermissionRequestApplyResponse(req, {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: MEMBER_A1_ID } }, error: null }) },
    } as never),
    createAdminClient: () => mockAdminSupabase as never,
    emit: async (input) => {
      emittedRecipients.push(input.recipients);
      return { ok: true, inserted: input.recipients.length };
    },
  });

  assert.equal(response.status, 200);
  assert.equal(emittedRecipients.length, 1);
  assert.deepEqual(emittedRecipients[0], [MANAGER_A_ID]);
  assert.ok(!emittedRecipients[0].includes(MANAGER_B_ID));
});
