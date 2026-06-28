import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { loadAdminFirstScreenData, loadPendingExemptionRows } from "@/app/(app)/admin/components/admin-first-screen-loader";
import { listPendingRequestsForAdmin } from "@/lib/team-join/service";
import { jsonBadRequest, parseDateParam, requireAdminServiceClient } from "../_shared";

export type QueueMetricSummary = {
  newVideosToday: number;
  weeklySubmissionRate: number;
  weeklyReviewedCount: number;
  caseLibraryPendingCount: number;
};

export type QueueOverviewPayload = {
  summary: Awaited<ReturnType<typeof loadAdminFirstScreenData>>["summary"];
  pendingVideos: Awaited<ReturnType<typeof loadAdminFirstScreenData>>["pendingVideos"];
  pendingSubmissions: Awaited<ReturnType<typeof loadAdminFirstScreenData>>["pendingSubmissions"];
  pendingExemptions: Awaited<ReturnType<typeof loadAdminFirstScreenData>>["pendingExemptions"];
  pendingJoinRequests: Awaited<ReturnType<typeof loadAdminFirstScreenData>>["pendingJoinRequests"];
  metrics: QueueMetricSummary;
};

export type QueueOverviewDeps = {
  parseDateParam: typeof parseDateParam;
  requireAdminServiceClient: typeof requireAdminServiceClient;
  loadAdminFirstScreenData: typeof loadAdminFirstScreenData;
  loadPendingExemptionRows: typeof loadPendingExemptionRows;
  listPendingRequestsForAdmin: typeof listPendingRequestsForAdmin;
  loadQueueMetricSummary: (date: string, visibleUserIds: string[] | null) => Promise<QueueMetricSummary>;
};

export async function buildQueueOverviewResponse(
  request: NextRequest,
  deps: QueueOverviewDeps,
) {
  const date = deps.parseDateParam(request);
  if (!date) return jsonBadRequest("date 必须是 YYYY-MM-DD");

  const auth = await deps.requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const initial = await deps.loadAdminFirstScreenData(date, {
    requireAdminServiceClient: async () => auth,
    listPendingRequestsForAdmin: deps.listPendingRequestsForAdmin,
    loadPendingExemptionRows: deps.loadPendingExemptionRows,
  });

  const metrics = await deps.loadQueueMetricSummary(
    date,
    auth.scope.kind === "all" ? null : auth.scope.visibleUserIds,
  );

  const payload: QueueOverviewPayload = {
    summary: initial.summary,
    pendingVideos: initial.pendingVideos,
    pendingSubmissions: initial.pendingSubmissions,
    pendingExemptions: initial.pendingExemptions,
    pendingJoinRequests: initial.pendingJoinRequests,
    metrics,
  };

  return NextResponse.json(payload);
}
