import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import {
  loadAdminContentListData as loadAdminContentFirstScreenData,
} from "@/lib/loaders/admin-content-page";
import { loadAdminContentVideoDetail } from "@/lib/loaders/content-detail";
import { buildPermissionContextFromPermissionInfo } from "@/lib/current-permission-context";
import { resolveVideoReviewReadOnlyScope } from "@/lib/data-access-scope";
import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";
import type { UserPermissionInfo } from "@/lib/permissions";
import type { TeamOption } from "@/lib/teams";
import { ContentPageClient } from "./content-page-client";
import type { ContentListQuery } from "@/lib/content/domain/content-list-query";

type ContentView = "all" | "trash";

interface ContentDataContainerProps {
  view: ContentView;
  requestedPerspective: "company" | "team";
  requestedTeamId: string | null;
  canSwitchPerspective: boolean;
  teams: TeamOption[];
  permissionInfo: UserPermissionInfo;
  directVideoId: string | null;
  query: Omit<ContentListQuery, "perspective" | "teamId">;
}

type ContentInitialDataArgs = Parameters<typeof loadAdminContentFirstScreenData>[0];

interface ContentInitialDataDeps {
  createAdminClient: () => ContentInitialDataArgs["supabase"];
  loadAdminContentPageData: typeof loadAdminContentFirstScreenData;
}

export async function loadAdminContentInitialData(
  args: Omit<ContentInitialDataArgs, "supabase">,
  deps: ContentInitialDataDeps = {
    createAdminClient,
    loadAdminContentPageData: loadAdminContentFirstScreenData,
  },
) {
  return deps.loadAdminContentPageData({
    ...args,
    supabase: deps.createAdminClient(),
  });
}

export async function ContentDataContainer({
  view,
  requestedPerspective,
  requestedTeamId,
  canSwitchPerspective,
  teams,
  permissionInfo,
  directVideoId,
  query,
}: ContentDataContainerProps) {
  const scope = resolveAdminDataPerspective({
    requestedPerspective,
    requestedTeamId,
    canUseCompanyPerspective: canSwitchPerspective,
    // The profile team is trusted even when this page intentionally receives no switchable team list.
    availableTeamIds: [
      ...teams.map((team) => team.id),
      ...(permissionInfo.teamId ? [permissionInfo.teamId] : []),
    ],
    fallbackTeamId: permissionInfo.teamId,
  });

  const scopedPermissionContext = await buildPermissionContextFromPermissionInfo(permissionInfo, {
    perspective: scope.perspective,
    teamId: scope.teamId,
  });

  if (!scopedPermissionContext) {
    return null; // Next.js redirects are handled in page.tsx
  }

  const readOnlyScope = await resolveVideoReviewReadOnlyScope(
    createAdminClient(),
    scopedPermissionContext.scope,
  );
  const [data, directVideoDetail] = await Promise.all([
    loadAdminContentInitialData({
      view,
      perspective: scope.perspective,
      teamId: scope.teamId,
      permissionInfo: scopedPermissionContext.permissionInfo,
      scope: readOnlyScope,
      query: { ...query, perspective: scope.perspective, teamId: scope.teamId },
    }),
    directVideoId
      ? loadAdminContentVideoDetail({
          supabase: createAdminClient(),
          scope: readOnlyScope,
          videoId: directVideoId,
          lifecycleState: view === "trash" ? "trashed" : "active",
        })
      : Promise.resolve(null),
  ]);
  if (directVideoId && !directVideoDetail) notFound();

  return (
    <ContentPageClient
      initialView={view}
      initialData={data}
      initialPerspective={scope.perspective}
      initialTeamId={scope.teamId}
      canSwitchPerspective={canSwitchPerspective}
      teams={teams}
      permissionInfo={scopedPermissionContext.permissionInfo}
      directVideoDetail={directVideoDetail}
    />
  );
}
