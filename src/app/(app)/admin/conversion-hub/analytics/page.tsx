import { redirect } from "next/navigation";

import { getUserPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

import { ConversionAnalyticsView, type AnalyticsRow, type TrendDay } from "./view";

export const dynamic = "force-dynamic";

type SortBy = "rate" | "usage" | "views";
type FormatFilter = "all" | "oral" | "visual" | "mixed";

interface PageProps {
  searchParams: Promise<{
    sort?: string;
    format?: string;
  }>;
}

function normalizeSort(v: string | undefined): SortBy {
  if (v === "usage" || v === "views") return v;
  return "rate";
}

function normalizeFormat(v: string | undefined): FormatFilter {
  if (v === "oral" || v === "visual" || v === "mixed") return v;
  return "all";
}

function last7Days(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

async function loadAnalyticsData(sort: SortBy, format: FormatFilter): Promise<{
  rows: AnalyticsRow[];
  trend: TrendDay[];
}> {
  const supabase = createAdminClient();

  let query = supabase
    .from("violation_cases")
    .select(
      "id, script_text, script_format, total_views, total_follows, usage_count, weighted_conversion_rate",
    )
    .eq("is_deleted", false)
    .eq("purpose", "conversion")
    .gte("usage_count", 3)
    .gte("total_views", 1000);

  if (format !== "all") query = query.eq("script_format", format);

  if (sort === "usage") query = query.order("usage_count", { ascending: false });
  else if (sort === "views") query = query.order("total_views", { ascending: false });
  else
    query = query
      .order("weighted_conversion_rate", { ascending: false, nullsFirst: false })
      .order("total_views", { ascending: false });

  const rowsResult = await query.limit(20);

  const startIso = last7Days()[0];
  const eventsResult = await supabase
    .from("violation_events")
    .select("occurred_at")
    .gte("occurred_at", startIso);

  const countByDay = new Map<string, number>();
  for (const day of last7Days()) countByDay.set(day, 0);
  for (const ev of eventsResult.data ?? []) {
    const d = String(ev.occurred_at ?? "").slice(0, 10);
    if (countByDay.has(d)) countByDay.set(d, (countByDay.get(d) ?? 0) + 1);
  }

  const trend: TrendDay[] = Array.from(countByDay.entries()).map(([date, count]) => ({ date, count }));

  return {
    rows: (rowsResult.data ?? []) as AnalyticsRow[],
    trend,
  };
}

export default async function ConversionHubAnalyticsPage({ searchParams }: PageProps) {
  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (perm.role !== "owner" && perm.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const sort = normalizeSort(params.sort);
  const format = normalizeFormat(params.format);

  const { rows, trend } = await loadAnalyticsData(sort, format);

  return <ConversionAnalyticsView rows={rows} trend={trend} sort={sort} format={format} />;
}
