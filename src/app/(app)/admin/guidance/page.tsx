import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { AppShell, AppShellHero, AppShellMetricStrip, AppShellSection } from "@/components/app-shell";
import { loadGuidancePageData } from "@/lib/loaders/guidance-page";
import { CultivationList } from "./cultivation-list";

export default async function GuidancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (!hasPermission(perm.role, perm.permissions, "view_analytics")) redirect("/dashboard");

  const data = await loadGuidancePageData({ supabase });

  return (
    <AppShell width="wide" className="pb-8">
      <AppShellHero
        eyebrow="Guidance Console"
        title="定向培养"
        description="按账号和近 30 天表现查看培养优先级，聚焦需要重点干预的人和方向。"
      >
        <AppShellMetricStrip
          columns={4}
          items={[
            { label: "纳入账号", value: data.summary.accountCount, hint: "最近 30 天有数据的账号", tone: "primary" },
            { label: "涉及成员", value: data.summary.ownerCount, hint: "当前参与分析的人数", tone: "neutral" },
            { label: "样本总量", value: data.summary.reportCount, hint: "近 30 天日报样本", tone: "success" },
            { label: "分析窗口", value: "30 天", hint: `${data.summary.monthAgo} 起`, tone: "neutral" },
          ]}
        />
      </AppShellHero>

      <AppShellSection
        eyebrow="Guidance List"
        title="指导名单"
        description="按重点培养、下滑干预、方向错配三类视角查看。"
      >
        <CultivationList accounts={data.accounts} reports={data.reports} />
      </AppShellSection>
    </AppShell>
  );
}
