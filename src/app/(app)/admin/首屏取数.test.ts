import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_FIRST_SCREEN_BUDGETS } from "@/lib/admin-first-screen-contract";
import type { AdminRequestRow } from "@/lib/team-join/service";
import type { ExemptionRequestRow } from "./豁免申请列表";

test("批改台首屏取数固定走管理员客户端", async () => {
  const mod = await import(new URL("./content/page.tsx", import.meta.url).href);

  const adminClient = { kind: "admin-content-client" };
  let adminCallCount = 0;
  let receivedArgs: unknown = null;
  const permissionScope = {
    userId: "user-1",
    role: "owner",
    businessRole: "owner",
    permissions: {},
    accessLevel: 4,
    teamId: "team-1",
    groupId: null,
    kind: "team",
    visibleUserIds: ["user-1"],
  };

  const result = await mod.loadAdminContentInitialData("pending", { perspective: "team", teamId: "team-1" }, {
    createAdminClient: () => {
      adminCallCount += 1;
      return adminClient;
    },
    loadAdminContentPageData: async (args: unknown) => {
      receivedArgs = args;
      return { ok: true, source: "content" };
    },
  }, undefined, permissionScope as never);

  assert.equal(adminCallCount, 1);
  assert.deepEqual(receivedArgs, {
    supabase: adminClient,
    view: "pending",
    perspective: "team",
    teamId: "team-1",
    permissionInfo: undefined,
    scope: permissionScope,
  });
  assert.deepEqual(result, { ok: true, source: "content" });
});

test("批改台页面首屏观测会落到 /admin/content 路由名下", async () => {
  const mod = await import(new URL("./content/page.tsx", import.meta.url).href);
  const observations: Array<Record<string, unknown>> = [];

  await mod.recordAdminContentFirstScreenObservation({
    actorUserId: "user-1",
    scopeKind: "team",
    metrics: { auth: 12, context: 18, data: 132, total: 162 },
  }, {
    recordObservation: async (observation: Record<string, unknown>) => {
      observations.push(observation);
    },
  });

  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.route, "/admin/content");
  assert.equal(observations[0]?.statusCode, 200);
  assert.equal(observations[0]?.actorUserId, "user-1");
  assert.equal(observations[0]?.scopeKind, "team");
});

test("素材库首屏取数固定走管理员客户端", async () => {
  const mod = await import(new URL("./videos/page.tsx", import.meta.url).href);

  const adminClient = { kind: "admin-video-client" };
  let adminCallCount = 0;
  let receivedArgs: unknown = null;
  const permissionScope = {
    userId: "user-1",
    role: "owner",
    businessRole: "owner",
    permissions: {},
    accessLevel: 4,
    teamId: null,
    groupId: null,
    kind: "all",
    visibleUserIds: ["user-1"],
  };

  const result = await mod.loadAdminVideosInitialData("all", { perspective: "company", teamId: null }, {
    createAdminClient: () => {
      adminCallCount += 1;
      return adminClient;
    },
    loadAdminVideosPageData: async (args: unknown) => {
      receivedArgs = args;
      return { ok: true, source: "videos" };
    },
  }, undefined, permissionScope as never);

  assert.equal(adminCallCount, 1);
  assert.deepEqual(receivedArgs, {
    supabase: adminClient,
    view: "all",
    perspective: "company",
    teamId: null,
    permissionInfo: undefined,
    scope: permissionScope,
  });
  assert.deepEqual(result, { ok: true, source: "videos" });
});

test("素材库页面首屏观测会落到 /admin/videos 路由名下", async () => {
  const mod = await import(new URL("./videos/page.tsx", import.meta.url).href);
  const observations: Array<Record<string, unknown>> = [];

  await mod.recordAdminVideosFirstScreenObservation({
    actorUserId: "owner-1",
    scopeKind: "all",
    metrics: { auth: 9, context: 11, data: 88, total: 108 },
  }, {
    recordObservation: async (observation: Record<string, unknown>) => {
      observations.push(observation);
    },
  });

  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.route, "/admin/videos");
  assert.equal(observations[0]?.statusCode, 200);
  assert.equal(observations[0]?.actorUserId, "owner-1");
  assert.equal(observations[0]?.scopeKind, "all");
});

test("/admin 页面当前固定重定向到 /admin/content", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const source = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/page.tsx"), "utf8");

  assert.match(source, /redirect\(\"\/admin\/content\"\)/);
});

test("后台首屏合同预算固定，避免候选池和阈值被随意放大", () => {
  assert.equal(ADMIN_FIRST_SCREEN_BUDGETS.cockpit.warnTotalMs, 2500);
  assert.equal(ADMIN_FIRST_SCREEN_BUDGETS.content.candidateLimit, 60);
  assert.equal(ADMIN_FIRST_SCREEN_BUDGETS.content.payloadLimit, 20);
  assert.equal(ADMIN_FIRST_SCREEN_BUDGETS.videos.candidateLimit, 60);
  assert.equal(ADMIN_FIRST_SCREEN_BUDGETS.videos.payloadLimit, 30);
});

test("/admin 首屏取数不再等待 alerts 聚合，只保留 summary 与队列最小工作集", async () => {
  const mod = await import(new URL("./components/admin-first-screen-loader.ts", import.meta.url).href);

  const summaryRow = {
    pending_videos: 8,
    pending_submissions: 3,
    pending_exemptions: 2,
  };
  const pendingVideos = [
    {
      id: "video-1",
      account_name: "账号A",
      video_title: "暴涨视频",
      published_at: "2026-05-31T08:00:00.000Z",
      play_change_signal: "surge",
      play_count_change_pct: 220,
      current_play_count: 32000,
      previous_play_count: 1000,
      submitted_by: "user-1",
      submitted_by_name: "张三",
    },
  ];
  const pendingSubmissions = [
    {
      profile_id: "user-2",
      name: "李四",
      team_id: "team-1",
      team_name: "运营一组",
      last_report_date: "2026-05-30",
    },
  ];
  const pendingExemptions: ExemptionRequestRow[] = [
    {
      id: "exemption-1",
      applicant_user_id: "user-3",
      applicant_name: "王五",
      exemption_type: "yesterday",
      exemption_category: null,
      reason: "请假",
      created_at: "2026-05-31T07:00:00.000Z",
    },
  ];
  const pendingJoinRequests: AdminRequestRow[] = [
    {
      id: "join-1",
      applicantUserId: "user-4",
      applicantName: "赵六",
      applicantEmail: null,
      targetTeamId: "team-2",
      targetTeamName: "增长组",
      createdAt: "2026-05-31T06:00:00.000Z",
    },
  ];

  const rpcCalls: string[] = [];
  const result = await mod.loadAdminFirstScreenData("2026-05-31", {
    requireAdminServiceClient: async () => ({
      supabase: {
        rpc(name: string) {
          rpcCalls.push(name);
          if (name === "admin_cockpit_summary") {
            return Promise.resolve({ data: summaryRow, error: null });
          }
          if (name === "admin_anomaly_videos_today") {
            return Promise.resolve({ data: pendingVideos, error: null });
          }
          if (name === "admin_pending_submissions_today") {
            return Promise.resolve({ data: pendingSubmissions, error: null });
          }
          throw new Error(`unexpected rpc: ${name}`);
        },
      },
      scope: {
        userId: "owner-1",
        role: "owner",
        businessRole: "owner",
        permissions: {},
        accessLevel: 4,
        teamId: null,
        groupId: null,
        kind: "all",
        visibleUserIds: ["user-1", "user-2", "user-3", "user-4"],
      },
    }),
    listPendingRequestsForAdmin: async () => ({ ok: true, data: pendingJoinRequests }),
    loadPendingExemptionRows: async () => pendingExemptions,
  });

  assert.deepEqual(rpcCalls, [
    "admin_cockpit_summary",
    "admin_anomaly_videos_today",
    "admin_pending_submissions_today",
  ]);
  assert.deepEqual(result, {
    summary: {
      pending_videos: 1,
      pending_submissions: 1,
      pending_exemptions: 1,
    },
    pendingVideos,
    pendingSubmissions,
    pendingExemptions,
    pendingJoinRequests,
  });
  assert.equal("alerts" in result, false);
  assert.equal("alertsUpdatedAt" in result, false);
});
