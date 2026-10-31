import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AIConfigShell } from "./ai-config-shell";

export const metadata: Metadata = {
  title: "AI 配置 - DYData",
  description: "统一管理业务模型调度与算力池资产，支持智能容灾与高可用调度。",
};

export default async function AIConfigPage() {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  if (!canAccessAdminPath("/admin/ai-config", permission.role, permission.permissions)) redirect("/admin");

  return (
    <AdminWorkspaceLayout
      title="AI 配置"
      description="统一管理业务模型调度与算力池资产，支持智能容灾与高可用调度。"
      width="wide"
    >
      <Suspense fallback={null}>
        <AIConfigShell />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}
