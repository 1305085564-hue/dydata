import { createAdminClient } from "@/lib/supabase/admin";
import { loadAdminVideosInitialData as loadAdminVideosFirstScreenData } from "@/lib/loaders/admin-videos-page";
import { buildPermissionContextFromPermissionInfo } from "@/lib/current-permission-context";
import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";
import { queueFirstScreenObservation } from "@/lib/admin-first-screen-observability";
import type { FirstScreenObservation } from "@/lib/admin-first-screen-observability";
import type { UserPermissionInfo } from "@/lib/permissions";
import type { TeamOption } from "@/lib/teams";
import { VideoPageClient } from "./video-page-client";

type VideoView = "pending" | "all";

interface VideosDataContainerProps {
  view: VideoView;
  requestedPerspective: "company" | "team";
  requestedTeamId: string | null;
  canSwitchPerspective: boolean;
  teams: TeamOption[];
  permissionInfo: UserPermissionInfo;
  initialAuthMs: number;
  totalStartMs: number;
}

function nowMs() {
  return performance.now();
}

type VideosInitialDataArgs = Parameters<typeof loadAdminVideosFirstScreenData>[0];

interface VideosInitialDataDeps {
  createAdminClient: () => VideosInitialDataArgs["supabase"];
  loadAdminVideosPageData: typeof loadAdminVideosFirstScreenData;
}

export async function loadAdminVideosInitialData(
  args: Omit<VideosInitialDataArgs, "supabase">,
  deps: VideosInitialDataDeps = {
    createAdminClient,
    loadAdminVideosPageData: loadAdminVideosFirstScreenData,
  },
) {
  return deps.loadAdminVideosPageData({
    ...args,
    supabase: deps.createAdminClient(),
  });
}

export function buildAdminVideosFirstScreenObservation(
  input: Omit<FirstScreenObservation, "route" | "statusCode">,
): FirstScreenObservation {
  return {
    ...input,
    route: "/admin/videos",
    statusCode: 200,
  };
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
  const data = await loadAdminVideosInitialData({
    view,
    perspective: scope.perspective,
    teamId: scope.teamId,
    permissionInfo: scopedPermissionContext.permissionInfo,
    scope: scopedPermissionContext.scope,
  });
  const dataMs = nowMs() - dataStart;
  const totalMs = nowMs() - totalStartMs;

  queueFirstScreenObservation(buildAdminVideosFirstScreenObservation({
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
  }));

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
