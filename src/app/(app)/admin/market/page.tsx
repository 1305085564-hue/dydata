import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AppShell, AppShellHero, AppShellMetricStrip, AppShellSection } from "@/components/app-shell";
import { loadAdminMarketPageData } from "@/lib/loaders/admin-market-page";
import { MarketForm } from "./market-form";
import { MarketList } from "./market-list";

export default async function MarketPage() {
  const permission = await getUserPermissions();

  if (!permission) {
    redirect("/login");
  }

  if (!canAccessAdminPath("/admin/market", permission.businessRole, permission.permissions)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const data = await loadAdminMarketPageData({ supabase });

  return (
    <AppShell width="wide" className="pb-8">
      <AppShellHero
        eyebrow="市场控制台"
        title="市场环境管理"
        description="维护近 30 天市场环境，用于个人成长和策略判断。"
      >
        <AppShellMetricStrip
          columns={4}
          items={[
            { label: "记录总数", value: data.summary.total, hint: "近 30 天已录入", tone: "primary" },
            { label: "交易日", value: data.summary.tradingDays, hint: "可用于策略判断", tone: "success" },
            { label: "强情绪", value: data.summary.strongDays, hint: "市场偏强的天数", tone: "neutral" },
            { label: "弱情绪", value: data.summary.weakDays, hint: "市场偏弱的天数", tone: data.summary.weakDays > 0 ? "warning" : "neutral" },
          ]}
        />
      </AppShellHero>

      <AppShellSection eyebrow="市场编辑" title="新增或更新市场环境" description="先维护当日市场环境，再查看最近 30 天记录。">
        <MarketForm />
      </AppShellSection>

      <AppShellSection eyebrow="历史记录" title="最近 30 天记录" description="支持直接回看和编辑已有市场环境。">
        <MarketList initialData={data.rows} />
      </AppShellSection>
    </AppShell>
  );
}
