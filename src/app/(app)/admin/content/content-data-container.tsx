import { createAdminClient } from "@/lib/supabase/admin";
import { loadAdminContentInitialData as loadAdminContentFirstScreenData } from "@/lib/loaders/admin-content-page";
import { buildPermissionContextFromPermissionInfo } from "@/lib/current-permission-context";
import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";
import { queueFirstScreenObservation } from "@/lib/admin-first-screen-observability";
import type { TeamOption } from "@/lib/teams";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { ContentPageClient } from "./content-page-client";

type ContentView = "pending" | "all";

interface ContentDataContainerProps {
  view: ContentView;
  requestedPerspective: "company" | "team";
  requestedTeamId: string | null;
  canSwitchPerspective: boolean;
  teams: TeamOption[];
  permissionInfo: any;
  initialAuthMs: number;
  totalStartMs: number;
}

function nowMs() {
  return performance.now();
}

async function loadAdminContentInitialData(
  view: ContentView,
  scope: { perspective: AdminDataPerspective; teamId: string | null },
  permissionInfo?: any,
  permissionScope?: any,
) {
  const supabase = createAdminClient();
  return loadAdminContentFirstScreenData({
    supabase,
    view,
    perspective: scope.perspective,
    teamId: scope.teamId,
    permissionInfo,
    scope: permissionScope,
  });
}

export async function ContentDataContainer({
  view,
  requestedPerspective,
  requestedTeamId,
  canSwitchPerspective,
  teams,
  permissionInfo,
  initialAuthMs,
  totalStartMs,
}: ContentDataContainerProps) {
  const scope = resolveAdminDataPerspective({
    requestedPerspective,
    requestedTeamId,
    canUseCompanyPerspective: canSwitchPerspective,
    availableTeamIds: teams.map((team) => team.id),
    fallbackTeamId: permissionInfo.teamId,
  });

  const contextStart = nowMs();
  const scopedPermissionContext = await buildPermissionContextFromPermissionInfo(permissionInfo, {
    perspective: scope.perspective,
    teamId: scope.teamId,
  });
  const contextMs = nowMs() - contextStart;

  if (!scopedPermissionContext) {
    return null; // Next.js redirects are handled in page.tsx
  }

  const dataStart = nowMs();
  const data = await loadAdminContentInitialData(
    view,
    scope,
    scopedPermissionContext.permissionInfo,
    scopedPermissionContext.scope,
  );
  const dataMs = nowMs() - dataStart;
  const totalMs = nowMs() - totalStartMs;

  queueFirstScreenObservation({
    route: "/admin/content",
    statusCode: 200,
    metrics: {
      auth: initialAuthMs,
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
    <ContentPageClient
      initialView={view}
      initialData={data}
      initialPerspective={scope.perspective}
      initialTeamId={scope.teamId}
      canSwitchPerspective={canSwitchPerspective}
      teams={teams}
    />
  );
}
