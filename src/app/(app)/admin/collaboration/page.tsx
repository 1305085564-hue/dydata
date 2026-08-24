import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { CollaborationDataContainer } from "./collaboration-data-container";
import CollaborationLoading from "./loading";

export const metadata: Metadata = {
  title: "协作管理 - DYData",
  description: "按岗位查看团队成员产量与运营带人情况。",
};

interface CollaborationPageProps {
  searchParams: Promise<{ year?: string; month?: string; tab?: string }>;
}

function resolveYearMonth(year: string | undefined, month: string | undefined) {
  const now = new Date();
  const y = Number(year);
  const m = Number(month);
  return {
    year: Number.isFinite(y) && y >= 2026 ? y : now.getFullYear(),
    month: Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1,
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

  return (
    <AdminWorkspaceLayout
      eyebrow="协作管理"
      title="协作管理"
      description="跨角色协同效率与创作者协作复盘"
      indexItems={[]}
      width="wide"
    >
      <Suspense
        key={`${year}-${month}-${tab}`}
        fallback={<CollaborationLoading />}
      >
        <CollaborationDataContainer
          year={year}
          month={month}
          tab={tab}
          isOwnerOrTeamAdmin={permissionInfo.permissions.view_analytics === true}
        />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}
