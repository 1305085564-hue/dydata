import { queueFirstScreenObservation, recordFirstScreenObservation } from "@/lib/admin-first-screen-observability";
import { redirect } from "next/navigation";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { buildPermissionContextFromPermissionInfo, getCurrentPermissionContext } from "@/lib/current-permission-context";
import { loadAdminContentInitialData as loadAdminContentFirstScreenData } from "@/lib/loaders/admin-content-page";
import { getTeamOptions, type TeamOption } from "@/lib/teams";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { ContentPageClient } from "./content-page-client";

type ContentView = "pending" | "all";
type PermissionContext = NonNullable<Awaited<ReturnType<typeof getCurrentPermissionContext>>>;
type FirstScreenMetrics = {
  auth: number;
  context: number;
  data: number;
  total: number;
};

interface Props {
  searchParams: Promise<{ view?: string; scope?: string; teamId?: string }>;
}

function normalizeView(value: string | undefined): ContentView {
  return value === "all" ? "all" : "pending";
}

function nowMs() {
  return performance.now();
}

export async function recordAdminContentFirstScreenObservation(
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
    route: "/admin/content",
    statusCode: input.statusCode ?? 200,
    metrics: input.metrics,
    actorUserId: input.actorUserId,
    scopeKind: input.scopeKind,
    metadata: input.metadata,
  });
}

export async function loadAdminContentInitialData(
  view: ContentView,
  scope: { perspective: AdminDataPerspective; teamId: string | null },
  deps: {
    createAdminClient: typeof createAdminClient;
    loadAdminContentPageData: typeof loadAdminContentFirstScreenData;
  } = {
    createAdminClient,
    loadAdminContentPageData: loadAdminContentFirstScreenData,
  },
  permissionInfo?: PermissionContext["permissionInfo"],
  permissionScope?: PermissionContext["scope"],
) {
  const supabase = deps.createAdminClient();
  return deps.loadAdminContentPageData({
    supabase,
    view,
    perspective: scope.perspective,
    teamId: scope.teamId,
    permissionInfo,
    scope: permissionScope,
  });
}

export default async function AdminContentPage({ searchParams }: Props) {
  const totalStart = nowMs();
  const params = await searchParams;
  const requestedPerspective = params.scope === "team" ? "team" : "company";
  const authStart = nowMs();
  const permissionContext = await getCurrentPermissionContext(requestedPerspective, params.teamId ?? null);
  const authMs = nowMs() - authStart;
  if (!permissionContext) redirect("/login");
  const { permissionInfo: perm } = permissionContext;
  if (!canAccessAdminPath("/admin/content", perm.businessRole, perm.permissions)) redirect("/dashboard");

  const view = normalizeView(params.view);
  const canSwitchPerspective = perm.businessRole === "owner";
  const teams = canSwitchPerspective ? await getTeamOptions() : [];
  const scope = resolveAdminDataPerspective({
    requestedPerspective: params.scope,
    requestedTeamId: params.teamId ?? null,
    canUseCompanyPerspective: canSwitchPerspective,
    availableTeamIds: teams.map((team) => team.id),
    fallbackTeamId: perm.teamId,
  });
  const contextStart = nowMs();
  const scopedPermissionContext = await buildPermissionContextFromPermissionInfo(perm, {
    perspective: scope.perspective,
    teamId: scope.teamId,
  });
  const contextMs = nowMs() - contextStart;
  if (!scopedPermissionContext) redirect("/login");
  const dataStart = nowMs();
  const data = await loadAdminContentInitialData(
    view,
    scope,
    undefined,
    scopedPermissionContext.permissionInfo,
    scopedPermissionContext.scope,
  );
  const dataMs = nowMs() - dataStart;
  const totalMs = nowMs() - totalStart;

  queueFirstScreenObservation({
    route: "/admin/content",
    statusCode: 200,
    metrics: {
      auth: authMs,
      context: contextMs,
      data: dataMs,
      total: totalMs,
    },
    actorUserId: scopedPermissionContext.permissionInfo.userId,
    scopeKind: scopedPermissionContext.scope.kind,
    metadata: {
      view,
      perspective: scope.perspective,
      teamId: scope.teamId,
    },
  });

  return (
    <AdminWorkspaceLayout
      indexItems={[]}
    >
      <ContentPageClient
        initialView={view}
        initialData={data}
        initialPerspective={scope.perspective}
        initialTeamId={scope.teamId}
        canSwitchPerspective={canSwitchPerspective}
        teams={teams as TeamOption[]}
      />
    </AdminWorkspaceLayout>
  );
}
