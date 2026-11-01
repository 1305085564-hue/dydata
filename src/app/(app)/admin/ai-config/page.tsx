import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { PageEpigraph } from "@/components/editorial/page-epigraph";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AIConfigShell } from "./ai-config-shell";

export const metadata: Metadata = {
  title: "AI 配置 - DYData",
  description: "挑选渠道与分工，让模型在需要时安静流转。",
};

export default async function AIConfigPage() {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  if (!canAccessAdminPath("/admin/ai-config", permission.role, permission.permissions)) redirect("/admin");

  return (
    <AdminWorkspaceLayout
      title="AI 配置"
      description={<PageEpigraph pageKey="ai-config" />}
      width="wide"
    >
      <Suspense fallback={null}>
        <AIConfigShell />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}
