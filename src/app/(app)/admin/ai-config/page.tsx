import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { PageHeadline } from "@/components/editorial/page-headline";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AIConfigShell } from "./ai-config-shell";

export const metadata: Metadata = {
  title: "AI 配置 - DYData",
  description: "AI 功能用哪个模型、走哪些渠道，现在能不能用。",
};

export default async function AIConfigPage() {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  if (!canAccessAdminPath("/admin/ai-config", permission.role, permission.permissions)) redirect("/admin");

  return (
    <AdminWorkspaceLayout
      title={<PageHeadline pageKey="ai-config" placeholder="AI 配置" />}
      width="wide"
    >
      <Suspense fallback={null}>
        <AIConfigShell />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}
