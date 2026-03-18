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
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">市场环境管理</h1>
        <p className="text-sm text-muted-foreground">维护近 30 天市场环境，用于成长分析和策略判断。</p>
      </div>

      <MarketForm />
      <MarketList initialData={rows} />
    </div>
  );
}
