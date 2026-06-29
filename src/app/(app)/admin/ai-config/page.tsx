import { redirect } from "next/navigation";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AIConfigShell, type AIConfigTabKey } from "./ai-config-shell";

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
    <AdminWorkspaceLayout
      eyebrow="AI 配置"
      title="统一 AI 配置中心"
      description="管理供应商、渠道、功能绑定及文案改写路由。"
      indexItems={[]}
    >
      <AIConfigShell initialTab={initialTab} />
    </AdminWorkspaceLayout>
  );
}
