import { redirect } from "next/navigation";

import { AdminSecondaryNav, AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

import AIRewriteClient from "./ai-rewrite-client";

export default async function AIRewritePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (!profile || profile.role !== "owner") {
    redirect("/admin");
  }

  return (
    <AppShell width="wide" className="pb-8">
      <AppShellHero
        eyebrow="Rewrite Control Center"
        title="文案改写配置"
        description="把员工端两个固定能力套餐、普通自定义配置和背后的真实执行路线放在一页内直接维护。"
      >
        <AdminSecondaryNav pathname="/admin/ai-rewrite" canManageAdmin panelBasePath="/admin" userRole="owner" />
      </AppShellHero>

      <AppShellSection
        eyebrow="Rewrite Settings"
        title="最小可用配置台"
        description="先把固定套餐和真实业务路线配对，再逐步补齐普通模式与字数预设。这里所有改动都会直接影响员工端文案改写。"
      >
        <AIRewriteClient />
      </AppShellSection>
    </AppShell>
  );
}
