import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import { MarketForm } from "./market-form";
import { MarketList } from "./market-list";
import type { MarketContextDaily } from "@/types";

export default async function MarketPage() {
  const permission = await getUserPermissions();

  if (!permission) {
    redirect("/login");
  }

  if (!isAdminLevel(permission.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

  const { data } = await supabase
    .from("market_context_daily")
    .select("id, context_date, is_trading_day, market_change, market_sentiment, hot_sectors, source, updated_by, created_at")
    .gte("context_date", thirtyDaysAgo.toISOString().split("T")[0])
    .order("context_date", { ascending: false });

  const rows = (data ?? []) as MarketContextDaily[];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-4 sm:px-6">
      <section className="rounded-[30px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(244,248,255,0.86))] p-5 shadow-[var(--shadow-card)] backdrop-blur-[20px] sm:p-6">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Market Console</p>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-[30px]">市场环境管理</h1>
          <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">维护近 30 天市场环境，用于成长分析和策略判断。</p>
        </div>
      </section>

      <MarketForm />
      <MarketList initialData={rows} />
    </div>
  );
}
