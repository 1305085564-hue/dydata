import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { getTeamOptions, type TeamOption } from "@/lib/teams";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { VideosDataContainer } from "./videos-data-container";
import type { AdminVideosView } from "@/lib/loaders/admin-videos-page";

export const metadata: Metadata = {
  title: "素材库 - DYData",
  description: "沉淀团队作品资产，研读数据表现与归档复盘。",
};

type VideoView = AdminVideosView;

interface Props {
  searchParams: Promise<{ view?: string; scope?: string; teamId?: string }>;
}

function normalizeView(value: string | undefined): VideoView {
  return value === "all" || value === "trash" ? value : "pending";
}

function nowMs() {
  return performance.now();
}

export default async function AdminVideosPage({ searchParams }: Props) {
  const totalStart = nowMs();
  const params = await searchParams;
  const requestedPerspective = params.scope === "team" ? "team" : "company";
  const authStart = nowMs();
  const permissionContext = await getCurrentPermissionContext(requestedPerspective, params.teamId ?? null);
  const authMs = nowMs() - authStart;

  if (!permissionContext) redirect("/login");
  const { permissionInfo: perm } = permissionContext;
  if (!canAccessAdminPath("/admin/videos", perm.role, perm.permissions)) redirect("/dashboard");

  const view = normalizeView(params.view);
  if (view === "trash" && perm.permissions.manage_videos !== true) redirect("/admin/videos");
  const canSwitchPerspective = perm.groupMode === true;
  const teams = canSwitchPerspective ? await getTeamOptions() : [];

  return (
    <AdminWorkspaceLayout
      indexItems={[]}
      width="extra-wide"
    >
      <Suspense
        key={`${view}-${requestedPerspective}-${params.teamId ?? ""}`}
        fallback={
          <div className="mt-4">
            <TableSkeleton columnCount={5} rowCount={6} showHeader={true} />
          </div>
        }
      >
        <VideosDataContainer
          view={view}
          requestedPerspective={requestedPerspective}
          requestedTeamId={params.teamId ?? null}
          canSwitchPerspective={canSwitchPerspective}
          teams={teams as TeamOption[]}
          permissionInfo={perm}
          initialAuthMs={authMs}
          totalStartMs={totalStart}
        />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}
