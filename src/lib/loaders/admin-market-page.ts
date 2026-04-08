import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketContextDaily } from "@/types";

type LoaderSupabase = SupabaseClient<any, "public", any>;

export interface AdminMarketPageData {
  rows: MarketContextDaily[];
  summary: {
    total: number;
    tradingDays: number;
    strongDays: number;
    weakDays: number;
  };
}

export async function loadAdminMarketPageData({ supabase }: { supabase: LoaderSupabase }): Promise<AdminMarketPageData> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

  const { data } = await supabase
    .from("market_context_daily")
    .select("id, context_date, is_trading_day, market_change, market_sentiment, hot_sectors, source, updated_by, created_at")
    .gte("context_date", thirtyDaysAgo.toISOString().split("T")[0])
    .order("context_date", { ascending: false });

  const rows = (data ?? []) as MarketContextDaily[];
  return {
    rows,
    summary: {
      total: rows.length,
      tradingDays: rows.filter((row) => row.is_trading_day).length,
      strongDays: rows.filter((row) => row.market_sentiment === "强").length,
      weakDays: rows.filter((row) => row.market_sentiment === "弱").length,
    },
  };
}
