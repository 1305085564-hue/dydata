import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { getTeamOptions, type TeamOption } from "@/lib/teams";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ContentDataContainer } from "./content-data-container";

export const metadata: Metadata = {
  title: "视频复盘 - DYData",
  description: "查看异常视频证据，定位内容问题与可能原因。",
};

type ContentView = "pending" | "all";

interface Props {
  searchParams: Promise<{ view?: string; scope?: string; teamId?: string }>;
}

function normalizeView(value: string | undefined): ContentView {
  return value === "all" ? "all" : "pending";
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
        <ContentDataContainer
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
