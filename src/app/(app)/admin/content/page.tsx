import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import type { TeamOption } from "@/lib/teams";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ContentDataContainer } from "./content-data-container";
import { parseContentListQuery } from "@/lib/content/domain/content-list-query";

export const metadata: Metadata = {
  title: "视频复盘 - DYData",
  description: "查看异常视频证据，定位内容问题与可能原因。",
};

type ContentView = "all" | "trash";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

function normalizeView(value: string | undefined): ContentView {
  return value === "trash" ? value : "all";
}

function nowMs() {
  return performance.now();
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
    <AdminWorkspaceLayout
      title="视频复盘"
      description="查看异常视频证据，定位内容问题与可能原因。"
      width="wide"
      hideHeaderOnMobile={true}
    >
      <Suspense
        key={`${view}-${requestedPerspective}-${params.teamId ?? ""}-${directVideoId ?? ""}`}
        fallback={
          <div>
            <TableSkeleton columnCount={10} rowCount={8} showHeader={true} />
          </div>
        }
      >
        <ContentDataContainer
          view={view}
          requestedPerspective={requestedPerspective}
          requestedTeamId={params.teamId ?? null}
          canSwitchPerspective={canSwitchPerspective}
          teams={teams}
          permissionInfo={perm}
          directVideoId={directVideoId}
          initialAuthMs={authMs}
          totalStartMs={totalStart}
          query={parsedQuery}
        />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}
