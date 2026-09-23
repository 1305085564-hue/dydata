import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { getShanghaiYearMonth } from "@/lib/loaders/shared";
import { resolveCollaborationView } from "@/lib/collaboration/work-group-navigation";
import { CollaborationDataContainer } from "./collaboration-data-container";
import CollaborationLoading from "./loading";

export const metadata: Metadata = {
  title: "数据管理 - DYData",
  description: "按月查看岗位与小组的作品产量和数据表现。",
};

interface CollaborationPageProps {
  searchParams: Promise<{
    year?: string;
    month?: string;
    tab?: string;
    view?: string;
    groupId?: string;
  }>;
}

function resolveYearMonth(year: string | undefined, month: string | undefined) {
  const now = getShanghaiYearMonth();
  const y = Number(year);
  const m = Number(month);
  return {
    year: Number.isFinite(y) && y >= 2026 ? y : now.year,
    month: Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.month,
  };
}

export default async function CollaborationPage({ searchParams }: CollaborationPageProps) {
  const params = await searchParams;
  const context = await getCurrentPermissionContext("company", null);
  if (!context) redirect("/login");

  const { permissionInfo } = context;
  if (!canAccessAdminPath("/admin/collaboration", permissionInfo.role, permissionInfo.permissions)) {
    redirect("/dashboard");
  }

  const { year, month } = resolveYearMonth(params.year, params.month);
  const tab = ["talents", "operators", "writers", "editors"].includes(params.tab ?? "")
    ? (params.tab as "talents" | "operators" | "writers" | "editors")
    : "talents";
  const view = resolveCollaborationView(params.view);
  const groupId = typeof params.groupId === "string" && params.groupId.trim() ? params.groupId.trim() : undefined;

  return (
    <AdminWorkspaceLayout
      eyebrow="数据管理"
      title="数据管理"
      description="按月查看岗位与小组的作品产量、负责账号与数据表现"
      indexItems={[]}
      width="wide"
    >
      {/* Suspense key 只随年月变化：首屏已备齐全部页签/视图/小队数据，
          切「岗位↔小组 / 四页签 / 进组」都是客户端就地命中，不再重挂整块露出加载骨架。
          翻月才改变服务器取数，仍走一次重取。 */}
      <Suspense
        key={`${year}-${month}`}
        fallback={<CollaborationLoading />}
      >
        <CollaborationDataContainer
          year={year}
          month={month}
          tab={tab}
          view={view}
          groupId={groupId}
          isOwnerOrTeamAdmin={permissionInfo.companyRole === "company_owner" || permissionInfo.companyRole === "admin"}
          canManageVideos={permissionInfo.permissions.manage_videos === true}
        />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}
