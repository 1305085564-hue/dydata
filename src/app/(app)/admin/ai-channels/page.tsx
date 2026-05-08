import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSecondaryNav, AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";
import AIChannelsClient from "./ai-channels-client";

export default async function AIChannelsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    redirect("/admin");
  }

  return (
    <AppShell width="wide" className="pb-8">
      <AppShellHero
        eyebrow="AI Feature Console"
        title="AI 功能区"
        description="统一管理 AI 渠道、功能开关、模型绑定和提示词配置。"
      >
        <AdminSecondaryNav pathname="/admin/ai-channels" canManageAdmin panelBasePath="/admin" userRole="owner" />
      </AppShellHero>
      <AppShellSection
        eyebrow="Channel Settings"
        title="渠道配置面板"
        description="建议先看健康状态，再做新增、编辑和恢复操作。"
      >
        <AIChannelsClient />
      </AppShellSection>
    </AppShell>
  );
}
