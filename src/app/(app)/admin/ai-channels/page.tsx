import { redirect } from "next/navigation";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AIConfigShell, type AIConfigTabKey } from "./ai-config-shell";

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

function normalizeTab(value: string | undefined): AIConfigTabKey {
  return value === "rewrite" ? "rewrite" : "channels";
}

export default async function AIChannelsPage({ searchParams }: Props) {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  if (!canAccessAdminPath("/admin/ai-channels", permission.businessRole, permission.permissions)) redirect("/admin");

  const params = await searchParams;
  const initialTab = normalizeTab(params.tab);

  return (
    <AdminWorkspaceLayout
      eyebrow="AI 配置"
      title="AI 配置中心"
      description="渠道、功能绑定、文案改写集中维护。"
      indexItems={[]}
    >
      <AIConfigShell initialTab={initialTab} />
    </AdminWorkspaceLayout>
  );
}
