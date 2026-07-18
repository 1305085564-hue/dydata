import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AIConfigShell, type AIConfigTabKey } from "./ai-config-shell";

export const metadata: Metadata = {
  title: "AI 配置",
  description: "管理 AI 渠道、模型分组、功能绑定与文案改写路由。",
};

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

function normalizeTab(value: string | undefined): AIConfigTabKey {
  if (value === "bindings" || value === "rewrite") return value;
  return "providers";
}

export default async function AIConfigPage({ searchParams }: Props) {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  if (!canAccessAdminPath("/admin/ai-config", permission.businessRole, permission.permissions)) redirect("/admin");

  const params = await searchParams;
  const initialTab = normalizeTab(params.tab);

  return (
    <div className="max-w-5xl w-full mx-auto">
      <AdminWorkspaceLayout
        eyebrow="AI 配置"
        title="统一 AI 配置中心"
        description="管理渠道、分组、功能绑定及文案改写路由。"
        indexItems={[]}
      >
        <AIConfigShell initialTab={initialTab} />
      </AdminWorkspaceLayout>
    </div>
  );
}
