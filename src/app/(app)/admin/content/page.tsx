import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import type { TeamOption } from "@/lib/teams";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { ContentDataContainer } from "./content-data-container";
import { ContentPageSkeleton } from "./content-page-skeleton";
import { parseContentListQuery } from "@/lib/content/domain/content-list-query";

export const metadata: Metadata = {
  title: "数据复盘 - DYData",
  description: "按天查看每条作品的播放、互动与留存表现，挑出值得复盘的作品。",
};

type ContentView = "all" | "trash";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

function normalizeView(value: string | undefined): ContentView {
  return value === "trash" ? value : "all";
}

export default async function AdminContentPage({ searchParams }: Props) {
  const params = await searchParams;
  const requestedPerspective = params.scope === "team" ? "team" : "company";
  const permissionContext = await getCurrentPermissionContext(requestedPerspective, params.teamId ?? null);

  if (!permissionContext) redirect("/login");
  const { permissionInfo: perm } = permissionContext;
  if (!canAccessAdminPath("/admin/content", perm.role, perm.permissions)) redirect("/dashboard");

  const view = normalizeView(params.view);
  if (view === "trash" && perm.permissions.manage_videos !== true) redirect("/admin/content?view=all");
  const directVideoId = params.videoId?.trim() || null;
  const canSwitchPerspective = false;
  const teams: TeamOption[] = [];
  const parsedQuery = parseContentListQuery(new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) => value === undefined ? [] : [[key, value]]),
  ));

  return (
    // 页头标题由列表按当前日期与筛选写成答案（ContentList 内的 h1），这里不再放固定标题
    <AdminWorkspaceLayout width="wide">
      <Suspense
        key={`${view}-${requestedPerspective}-${params.teamId ?? ""}-${directVideoId ?? ""}`}
        fallback={<ContentPageSkeleton />}
      >
        <ContentDataContainer
          view={view}
          requestedPerspective={requestedPerspective}
          requestedTeamId={params.teamId ?? null}
          canSwitchPerspective={canSwitchPerspective}
          teams={teams}
          permissionInfo={perm}
          directVideoId={directVideoId}
          query={parsedQuery}
        />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}
