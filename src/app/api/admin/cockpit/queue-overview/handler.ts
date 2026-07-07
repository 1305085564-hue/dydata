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

const QUEUE_OVERVIEW_CACHE_TTL_MS = 60_000;
const queueOverviewCache = new Map<string, { expiresAt: number; payload: QueueOverviewPayload }>();

function buildQueueOverviewCacheKey(input: {
  date: string;
  userId: string;
  scopeKind: string;
  visibleUserIds: string[];
}) {
  return [
    input.date,
    input.userId,
    input.scopeKind,
    [...input.visibleUserIds].sort().join(","),
  ].join("|");
}

export async function buildQueueOverviewResponse(
  request: NextRequest,
  deps: QueueOverviewDeps,
) {
  const date = deps.parseDateParam(request);
  if (!date) return jsonBadRequest("date 必须是 YYYY-MM-DD");

  const auth = await deps.requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const cacheKey = buildQueueOverviewCacheKey({
    date,
    userId: auth.scope.userId,
    scopeKind: auth.scope.kind,
    visibleUserIds: auth.scope.visibleUserIds,
  });
  const cached = queueOverviewCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const initialPromise = deps.loadAdminFirstScreenData(date, {
    requireAdminServiceClient: async () => auth,
    listPendingRequestsForAdmin: deps.listPendingRequestsForAdmin,
    loadPendingExemptionRows: deps.loadPendingExemptionRows,
  });
  const metricsPromise = deps.loadQueueMetricSummary(
    date,
    auth.scope.kind === "all" ? null : auth.scope.visibleUserIds,
  );
  const [initial, metrics] = await Promise.all([initialPromise, metricsPromise]);

  const payload: QueueOverviewPayload = {
    summary: initial.summary,
    pendingVideos: initial.pendingVideos,
    pendingSubmissions: initial.pendingSubmissions,
    pendingExemptions: initial.pendingExemptions,
    pendingJoinRequests: initial.pendingJoinRequests,
    metrics,
  };

  queueOverviewCache.set(cacheKey, {
    expiresAt: Date.now() + QUEUE_OVERVIEW_CACHE_TTL_MS,
    payload,
  });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=60",
    },
  });
}

export const __internal = {
  resetQueueOverviewCache() {
    queueOverviewCache.clear();
  },
};
