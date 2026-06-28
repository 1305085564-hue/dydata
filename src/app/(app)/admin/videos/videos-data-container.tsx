import { createAdminClient } from "@/lib/supabase/admin";
import { loadAdminVideosInitialData as loadAdminVideosFirstScreenData } from "@/lib/loaders/admin-videos-page";
import { buildPermissionContextFromPermissionInfo } from "@/lib/current-permission-context";
import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";
import { queueFirstScreenObservation } from "@/lib/admin-first-screen-observability";
import type { TeamOption } from "@/lib/teams";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { VideoPageClient } from "./video-page-client";

type VideoView = "pending" | "all";

interface VideosDataContainerProps {
  view: VideoView;
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

async function loadAdminVideosInitialData(
  view: VideoView,
  scope: { perspective: AdminDataPerspective; teamId: string | null },
  permissionInfo?: any,
  permissionScope?: any,
) {
  const supabase = createAdminClient();
  return loadAdminVideosFirstScreenData({
    supabase,
    view,
    perspective: scope.perspective,
    teamId: scope.teamId,
    permissionInfo,
    scope: permissionScope,
  });
}

export async function VideosDataContainer({
  view,
  requestedPerspective,
  requestedTeamId,
  canSwitchPerspective,
  teams,
  permissionInfo,
  initialAuthMs,
  totalStartMs,
}: VideosDataContainerProps) {
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
    return null;
  }

  const dataStart = nowMs();
  const data = await loadAdminVideosInitialData(
    view,
    scope,
    scopedPermissionContext.permissionInfo,
    scopedPermissionContext.scope,
  );
  const dataMs = nowMs() - dataStart;
  const totalMs = nowMs() - totalStartMs;

  queueFirstScreenObservation({
    route: "/admin/videos",
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
    <VideoPageClient
      initialView={view}
      initialData={data}
      initialPerspective={scope.perspective}
      initialTeamId={scope.teamId}
      canSwitchPerspective={canSwitchPerspective}
      teams={teams}
    />
  );
}
