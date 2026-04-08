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
        eyebrow="AI Channel Console"
        title="AI 渠道管理"
        description="维护渠道优先级、健康状态和熔断恢复，保证 AI 调用稳定。"
      >
        <AdminSecondaryNav pathname="/admin/ai-channels" canManageAdmin />
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
