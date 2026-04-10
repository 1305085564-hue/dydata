import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";
import AIAssistantClient from "./ai-assistant-client";

export default async function AIAssistantPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "owner")) {
    redirect("/dashboard");
  }

  return (
    <AppShell width="wide" className="pb-8">
      <AppShellHero
        eyebrow="AI Assistant"
        title="后台 AI 助手"
        description="集中处理问答、操作确认和历史记录，减少后台来回跳转。"
      />
      <AppShellSection
        eyebrow="Assistant Workspace"
        title="对话工作区"
        description="左侧对话，右侧历史；移动端可随时拉起历史。"
      >
        <AIAssistantClient actorRole={profile.role} />
      </AppShellSection>
    </AppShell>
  );
}
