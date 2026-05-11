import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { AppShell, AppShellHero, AppShellMetricStrip, AppShellSection } from "@/components/app-shell";
import { loadAdminAdvicePageData } from "@/lib/loaders/admin-advice-page";
export type { AdviceRow } from "@/lib/loaders/admin-advice-page";
import { AdviceList } from "./advice-list";

export default async function AdminAdvicePage() {
  const permission = await getUserPermissions();

  if (!permission) {
    redirect("/login");
  }

  if (!isAdminLevel(permission.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const data = await loadAdminAdvicePageData({ supabase });

  return (
    <AdminWorkspaceLayout
      eyebrow="Conversion Center"
      title="转化中心"
      description="把转化建议、违规风险、复核结论和动作跟进收成一条闭环。"
      indexItems={[
        { id: "conversion-overview", label: "闭环总览", hint: "建议、待办、AI 来源" },
        { id: "conversion-queue", label: "建议队列", hint: "筛选、复核、动作" },
      ]}
      className="pb-8"
    >
    <AppShell width="full">
      <AppShellHero
        eyebrow="Advice Queue"
        title="转化建议"
        description="按员工、账号、状态和来源查看建议闭环，并支持批量生成与复核。"
        className="scroll-mt-8"
      >
        <div id="conversion-overview" className="sr-only" />
        <AppShellMetricStrip
          columns={4}
          items={[
            { label: "建议总数", value: data.summary.total, hint: "当前全部建议", tone: "primary" },
            { label: "待处理", value: data.summary.pending, hint: "待执行或待查看", tone: data.summary.pending > 0 ? "warning" : "neutral" },
            { label: "已完成", value: data.summary.done, hint: "已执行或已复核", tone: "success" },
            { label: "AI 建议", value: data.summary.aiSource, hint: "来源为 AI 的建议", tone: "neutral" },
          ]}
        />
      </AppShellHero>

      <AppShellSection
        className="scroll-mt-8"
        eyebrow="Advice Queue"
        title="转化建议列表"
        description="筛选、复核和批量动作都集中在这里。"
      >
        <div id="conversion-queue" className="sr-only" />
        <AdviceList
          advice={data.advice}
          profiles={data.profiles}
          accounts={data.accounts}
          currentUserId={permission.userId}
        />
      </AppShellSection>
    </AppShell>
    </AdminWorkspaceLayout>
  );
}
