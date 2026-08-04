import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { CollaborationDataContainer } from "./collaboration-data-container";
import CollaborationLoading from "./loading";

export const metadata: Metadata = {
  title: "协作管理",
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
  if (!canAccessAdminPath("/admin/collaboration", permissionInfo.businessRole, permissionInfo.permissions)) {
    redirect("/dashboard");
  }

  const { year, month } = resolveYearMonth(params.year, params.month);
  const tab = ["operators", "writers", "editors"].includes(params.tab ?? "")
    ? (params.tab as "operators" | "writers" | "editors")
    : "operators";

  return (
    <AdminWorkspaceLayout indexItems={[]} width="wide">
      <div className="space-y-4">
        <div>
          <p className="text-[12px] tracking-[0.12em] text-zinc-500">协作管理</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-zinc-900">协作管理</h1>
        </div>
        <Suspense
          key={`${year}-${month}-${tab}`}
          fallback={<CollaborationLoading />}
        >
          <CollaborationDataContainer
            year={year}
            month={month}
            tab={tab}
            isOwnerOrTeamAdmin={
              permissionInfo.businessRole === "owner" ||
              permissionInfo.businessRole === "team_admin"
            }
          />
        </Suspense>
      </div>
    </AdminWorkspaceLayout>
  );
}
