import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSecondaryNav, AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";
import AIFeaturesClient from "./ai-features-client";

export default async function AIFeaturesPage() {
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
        title="AI 功能管理"
        description="统一管理 AI 功能的开关、模型、渠道和提示词配置。"
      >
        <AdminSecondaryNav pathname="/admin/ai-features" canManageAdmin />
      </AppShellHero>
      <AppShellSection
        eyebrow="Feature Settings"
        title="功能配置面板"
        description="这里的改动会直接影响 AI 功能的可用性和输出方式。"
      >
        <AIFeaturesClient />
      </AppShellSection>
    </AppShell>
  );
}
