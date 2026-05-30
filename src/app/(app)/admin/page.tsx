import { queueFirstScreenObservation, recordFirstScreenObservation } from "@/lib/admin-first-screen-observability";
import { redirect } from "next/navigation";

import { getUserPermissions } from "@/lib/permissions";
import { canAccessAdminPath } from "@/lib/analytics-access";

import {
  AdminQueueSection,
} from "./components/admin-cockpit";
import { AiAlertPanel } from "./components/ai-alert-panel";
import { loadAdminFirstScreenData } from "./components/admin-first-screen-loader";

interface AdminPageProps {
  searchParams: Promise<{ date?: string }>;
}

type FirstScreenMetrics = {
  auth: number;
  context: number;
  data: number;
  total: number;
};

function nowMs() {
  return performance.now();
}

export async function recordAdminCockpitFirstScreenObservation(
  input: {
    actorUserId: string;
    scopeKind: string;
    metrics: FirstScreenMetrics;
    statusCode?: number;
    metadata?: Record<string, unknown>;
  },
  deps: {
    recordObservation: typeof recordFirstScreenObservation;
  } = {
    recordObservation: recordFirstScreenObservation,
  },
) {
  return deps.recordObservation({
    route: "/admin",
    statusCode: input.statusCode ?? 200,
    metrics: input.metrics,
    actorUserId: input.actorUserId,
    scopeKind: input.scopeKind,
    metadata: input.metadata,
  });
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const totalStart = nowMs();
  const authStart = nowMs();
  const permissionInfo = await getUserPermissions();
  const authMs = nowMs() - authStart;
  if (!permissionInfo) redirect("/login");
  if (!canAccessAdminPath("/admin", permissionInfo.businessRole, permissionInfo.permissions))
    redirect("/dashboard");

  const params = await searchParams;
  const queryDate = params.date || new Date().toISOString().split("T")[0];
  const dataStart = nowMs();
  const initialData = await loadAdminFirstScreenData(queryDate);
  const dataMs = nowMs() - dataStart;
  const totalMs = nowMs() - totalStart;

  queueFirstScreenObservation({
    route: "/admin",
    statusCode: 200,
    metrics: {
      auth: authMs,
      context: 0,
      data: dataMs,
      total: totalMs,
    },
    actorUserId: permissionInfo.userId,
    scopeKind: permissionInfo.teamId ? "team" : "all",
    metadata: {
      date: queryDate,
      alertsDeferred: true,
    },
  });

  return (
    <div className="space-y-7">
      <AdminQueueSection
        date={queryDate}
        initialSummary={initialData.summary}
        initialData={{
          pendingVideos: initialData.pendingVideos,
          pendingViolations: initialData.pendingViolations,
          pendingSubmissions: initialData.pendingSubmissions,
          pendingExemptions: initialData.pendingExemptions,
          pendingJoinRequests: initialData.pendingJoinRequests,
        }}
      />
      <AiAlertPanel />
    </div>
  );
}
