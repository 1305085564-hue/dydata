import { redirect } from "next/navigation";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { loadAdminVideosPageData } from "@/lib/loaders/admin-videos-page";
import { getTeamOptions, type TeamOption } from "@/lib/teams";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { VideoPageClient } from "./video-page-client";

type VideoView = "pending" | "all";
type UserPermissionInfo = NonNullable<Awaited<ReturnType<typeof getUserPermissions>>>;

interface Props {
  searchParams: Promise<{ view?: string; scope?: string; teamId?: string }>;
}

function normalizeView(value: string | undefined): VideoView {
  return value === "all" ? "all" : "pending";
}

export async function loadAdminVideosInitialData(
  view: VideoView,
  scope: { perspective: AdminDataPerspective; teamId: string | null },
  deps: {
    createAdminClient: typeof createAdminClient;
    loadAdminVideosPageData: typeof loadAdminVideosPageData;
  } = {
    createAdminClient,
    loadAdminVideosPageData,
  },
  permissionInfo?: UserPermissionInfo,
) {
  const supabase = deps.createAdminClient();
  return deps.loadAdminVideosPageData({
    supabase,
    view,
    perspective: scope.perspective,
    teamId: scope.teamId,
    mode: "initial",
    permissionInfo,
  });
}

export default async function AdminVideosPage({ searchParams }: Props) {
  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (!canAccessAdminPath("/admin/videos", perm.businessRole, perm.permissions)) redirect("/dashboard");

  const params = await searchParams;
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
  const data = await loadAdminVideosInitialData(view, scope, undefined, perm);

  return (
    <AdminWorkspaceLayout
      indexItems={[]}
    >
      <VideoPageClient
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
