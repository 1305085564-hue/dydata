import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { getTeamOptions, type TeamOption } from "@/lib/teams";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { VideosDataContainer } from "./videos-data-container";

export const metadata: Metadata = {
  title: "视频素材",
  description: "管理团队视频素材、审核状态与归档记录。",
};

type VideoView = "pending" | "all";

interface Props {
  searchParams: Promise<{ view?: string; scope?: string; teamId?: string }>;
}

function normalizeView(value: string | undefined): VideoView {
  return value === "all" ? "all" : "pending";
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
  if (!canAccessAdminPath("/admin/videos", perm.businessRole, perm.permissions)) redirect("/dashboard");

  const view = normalizeView(params.view);
  const canSwitchPerspective = perm.businessRole === "owner";
  const teams = canSwitchPerspective ? await getTeamOptions() : [];

  return (
    <AdminWorkspaceLayout
      indexItems={[]}
      width="full"
    >
      <Suspense
        key={`${view}-${requestedPerspective}-${params.teamId ?? ""}`}
        fallback={
          <div className="rounded-2xl border border-stone-200 bg-white p-6 mt-4">
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
