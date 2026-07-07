import assert from "node:assert/strict";
import test from "node:test";

import { __internal, buildQueueOverviewResponse } from "./handler";

test("queue-overview 返回完整抽屉数据和底部指标", async () => {
  __internal.resetQueueOverviewCache();
  const response = await buildQueueOverviewResponse(
    { nextUrl: new URL("https://dydata.cc/api/admin/cockpit/queue-overview?date=2026-06-02") } as never,
    {
      parseDateParam: () => "2026-06-02",
      requireAdminServiceClient: async () => ({
        supabase: {} as never,
        actor: {} as never,
        permissionInfo: {} as never,
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
      loadAdminFirstScreenData: async () => ({
        summary: {
          pending_videos: 2,
          pending_submissions: 5,
          pending_exemptions: 3,
        },
        pendingVideos: [
          {
            id: "video-1",
            account_name: "账号A",
            video_title: null,
            published_at: null,
            play_change_signal: "surge",
            play_count_change_pct: 120,
            current_play_count: 12000,
            previous_play_count: 6000,
            submitted_by: "user-1",
            submitted_by_name: "张三",
          },
        ],
        pendingSubmissions: [
          {
            profile_id: "user-2",
            name: "李四",
            team_id: "team-1",
            team_name: "一组",
            last_report_date: "2026-06-01",
          },
        ],
        pendingExemptions: [
          {
            id: "ex-1",
            applicant_user_id: "user-3",
            applicant_name: "王五",
            exemption_type: "yesterday",
            exemption_category: null,
            reason: "请假",
            created_at: "2026-06-02T10:00:00.000Z",
          },
        ],
        pendingJoinRequests: [
          {
            id: "join-1",
            applicantUserId: "user-4",
            applicantName: "赵六",
            applicantEmail: null,
            targetTeamId: "team-2",
            targetTeamName: "二组",
            createdAt: "2026-06-02T09:00:00.000Z",
          },
        ],
      }),
      loadPendingExemptionRows: async () => [],
      listPendingRequestsForAdmin: async () => ({ ok: true, data: [] }),
      loadQueueMetricSummary: async () => ({
        newVideosToday: 1,
        weeklySubmissionRate: 40,
        weeklyReviewedCount: 1,
        caseLibraryPendingCount: 1,
      }),
    },
  );

  assert.ok(response);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.summary.pending_submissions, 5);
  assert.equal(payload.pendingSubmissions.length, 1);
  assert.equal(payload.pendingExemptions.length, 1);
  assert.equal(payload.pendingJoinRequests.length, 1);
  assert.equal(payload.metrics.newVideosToday, 1);
  assert.equal(payload.metrics.weeklySubmissionRate, 40);
  assert.equal(payload.metrics.weeklyReviewedCount, 1);
  assert.equal(payload.metrics.caseLibraryPendingCount, 1);
});

test("queue-overview 同日期同 scope 60 秒内复用服务端缓存", async () => {
  __internal.resetQueueOverviewCache();
  let firstScreenCalls = 0;
  let metricsCalls = 0;

  const deps = {
    parseDateParam: () => "2026-06-02",
    requireAdminServiceClient: async () => ({
      supabase: {} as never,
      actor: {} as never,
      permissionInfo: {} as never,
      scope: {
        userId: "owner-1",
        role: "owner",
        businessRole: "owner",
        permissions: {},
        accessLevel: 4,
        teamId: null,
        groupId: null,
        kind: "all" as const,
        visibleUserIds: ["user-1"],
      },
    }),
    loadAdminFirstScreenData: async () => {
      firstScreenCalls += 1;
      return {
        summary: {
          pending_videos: 1,
          pending_submissions: 2,
          pending_exemptions: 3,
        },
        pendingVideos: [],
        pendingSubmissions: [],
        pendingExemptions: [],
        pendingJoinRequests: [],
      };
    },
    loadPendingExemptionRows: async () => [],
    listPendingRequestsForAdmin: async () => ({ ok: true, data: [] }),
    loadQueueMetricSummary: async () => {
      metricsCalls += 1;
      return {
        newVideosToday: 1,
        weeklySubmissionRate: 50,
        weeklyReviewedCount: 2,
        caseLibraryPendingCount: 3,
      };
    },
  } as const;

  const first = await buildQueueOverviewResponse(
    { nextUrl: new URL("https://dydata.cc/api/admin/cockpit/queue-overview?date=2026-06-02") } as never,
    deps,
  );
  const second = await buildQueueOverviewResponse(
    { nextUrl: new URL("https://dydata.cc/api/admin/cockpit/queue-overview?date=2026-06-02") } as never,
    deps,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstScreenCalls, 1);
  assert.equal(metricsCalls, 1);
  assert.equal(first.headers.get("cache-control"), "private, max-age=60");
  assert.equal(second.headers.get("cache-control"), "private, max-age=60");
});
