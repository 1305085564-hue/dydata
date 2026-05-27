import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ArrowRight } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { getApiErrorMessage } from "@/lib/violations/errors";
import { EmptyState } from "@/components/ui/empty-state";

import { RankBoard } from "./components/rank-board";
import { CaseList } from "./components/case-list";
import { FilterBar } from "./components/filter-bar";
import type {
  RankItem,
  SortKey,
  ViolationCase,
  ViolationListResponse,
} from "./components/types";

import { ConversionHubShell } from "@/app/(app)/admin/conversion-hub/hub-shell";
import {
  getWeekStartDate,
  loadInboxData,
  loadProcessedData,
  PROCESSED_RPC_READY,
} from "@/app/(app)/admin/conversion-hub/data";

type SearchParamsShape = Record<string, string | string[] | undefined>;

function readParam(params: SearchParamsShape, key: string): string {
  const raw = params[key];
  if (typeof raw === "string" && raw.length > 0) return raw;
  return "";
}

function readParamArray(params: SearchParamsShape, key: string): string[] {
  const raw = params[key];
  if (typeof raw === "string" && raw.length > 0) return raw.split(",").filter(Boolean);
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string" && s.length > 0);
  return [];
}

/* ------------------------------------------------------------------ */
/*  Data loaders                                                        */
/* ------------------------------------------------------------------ */

async function loadCases(params: {
  sort: SortKey;
  order: "asc" | "desc";
  guidanceMethods: string[];
  query: string;
  tab: string;
}): Promise<ViolationCase[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("sort", params.sort);
  searchParams.set("order", params.order);
  searchParams.set("view", "staff");
  searchParams.set("pageSize", "30");
  if (params.query) searchParams.set("q", params.query);
  if (params.guidanceMethods.length > 0) {
    searchParams.set("guidance_method", params.guidanceMethods[0]);
  }

  const headerStore = await headers();
  const host = headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";
  const cookie = headerStore.get("cookie") ?? "";

  const response = await fetch(
    `${protocol}://${host}/api/violations?${searchParams.toString()}`,
    {
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
    },
  );
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getApiErrorMessage(payload, "加载话术案例库失败"));

  const listPayload = payload as ViolationListResponse;
  return (listPayload.cases ?? listPayload.items ?? listPayload.data ?? []) as ViolationCase[];
}

type DangerousItem = {
  id: string;
  script_text: string;
  pass_count: number;
  fail_count: number;
  pass_rate: number | null;
};

type ConversionItem = {
  id: string;
  script_text: string;
  total_views: number | null;
  total_follows: number | null;
  usage_count: number | null;
  weighted_conversion_rate: number | null;
};

type DashboardData = {
  dangerousTop3?: DangerousItem[];
  safeTop3?: DangerousItem[];
  conversionTop3?: ConversionItem[];
  weeklyStats?: { newViolations: number; newCases: number };
} | null;

type DashboardPayload = {
  data?: DashboardData;
};

async function loadDashboard(): Promise<DashboardData> {
  const headerStore = await headers();
  const host = headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";
  const cookie = headerStore.get("cookie") ?? "";

  const response = await fetch(`${protocol}://${host}/api/violations/dashboard-summary`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return (payload as DashboardPayload).data ?? null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatConversionRate(rate: number | null): string {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(2)}%`;
}

function mapConversionToRankItems(items: ConversionItem[]): RankItem[] {
  return items.map((item) => ({
    id: item.id,
    script_text: item.script_text,
    metricValue: formatConversionRate(item.weighted_conversion_rate),
    metricRaw: item.weighted_conversion_rate,
    usage_count: item.usage_count,
  }));
}

function mapDangerousToRankItems(items: DangerousItem[]): RankItem[] {
  return items.map((item) => {
    const failRate =
      item.pass_rate === null ? 0 : Math.max(0, 100 - item.pass_rate);
    return {
      id: item.id,
      script_text: item.script_text,
      metricValue: `${failRate}%`,
      metricRaw: failRate,
      pass_count: item.pass_count,
      fail_count: item.fail_count,
    };
  });
}

function getDefaultSort(tab: string): SortKey {
  if (tab === "safe") return "usage_count";
  return "pass_rate";
}

function getTabPurpose(tab: string): "violation" | "conversion" {
  if (tab === "safe") return "conversion";
  return "violation";
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default async function ViolationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsShape>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const permInfo = await getUserPermissions();
  if (!permInfo) redirect("/login");
  const { businessRole, permissions, role } = permInfo;
  const isOwner = role === "owner";
  const canManageViolations =
    isOwner || hasPermission(businessRole, permissions, "manage_violations");

  const resolved = await searchParams;
  const query = readParam(resolved, "q");
  const view = readParam(resolved, "view") || "";
  const tab = readParam(resolved, "tab") || "risk";
  const isManageView = canManageViolations && view === "manage";

  const sortParam = readParam(resolved, "sort") as SortKey | "";
  const orderParam = readParam(resolved, "order") as "asc" | "desc" | "";
  const guidanceMethods = readParamArray(resolved, "guidance_method");

  const activeSort: SortKey = sortParam || getDefaultSort(tab);
  const activeOrder: "asc" | "desc" = orderParam || "desc";

  /* Fetch data in parallel */
  let cases: ViolationCase[] = [];
  let dashboard: DashboardPayload["data"] = null;
  let error: string | null = null;

  try {
    [cases, dashboard] = await Promise.all([
      isManageView
        ? Promise.resolve([])
        : loadCases({ sort: activeSort, order: activeOrder, guidanceMethods, query, tab }),
      isManageView ? Promise.resolve(null) : loadDashboard(),
    ]);
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "加载失败";
  }

  const conversionRankItems = mapConversionToRankItems(dashboard?.conversionTop3 ?? []);
  const violationRankItems = mapDangerousToRankItems(dashboard?.dangerousTop3 ?? []);

  const totalCases = cases.length;
  const weeklyNewViolations = dashboard?.weeklyStats?.newViolations ?? 0;
  const weeklyNewCases = dashboard?.weeklyStats?.newCases ?? 0;

  /* Manage view data */
  let manageData: {
    inbox: Awaited<ReturnType<typeof loadInboxData>>["data"];
    inboxCounts: Awaited<ReturnType<typeof loadInboxData>>["counts"];
    processed: Awaited<ReturnType<typeof loadProcessedData>>["processed"];
  } | null = null;

  if (isManageView) {
    const [{ data: inbox, counts: inboxCounts }, { processed }] = await Promise.all([
      loadInboxData(user.id),
      loadProcessedData(user.id),
    ]);
    manageData = { inbox, inboxCounts, processed };
  }

  return (
    <div className="bg-[#F0F0F1] min-h-screen">
      <div className="mx-auto max-w-6xl space-y-6 py-8 px-4 sm:px-6">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
              话术案例库
            </p>
            <h1 className="mt-2 text-[24px] font-semibold leading-[1.33] tracking-tight text-zinc-800">
              {isManageView ? "管理工作台" : "找话术 · 避坑"}
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-zinc-500">
              {isManageView
                ? "审核员工提交，把有价值的话术沉淀进知识库；高风险先处理，再补缺数据，最后看推广候选。"
                : `团队已沉淀 ${weeklyNewCases} 条新案例 · ${weeklyNewViolations} 条违规待规避`}
            </p>
          </div>

          {/* Tabs */}
          {canManageViolations ? (
            <div className="inline-flex rounded-xl bg-zinc-100 p-1">
              <Link
                href="/violations?tab=safe"
                className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors active:translate-y-0 ${
                  !isManageView && tab === "safe"
                    ? "bg-white text-zinc-800 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                找可用话术
              </Link>
              <Link
                href="/violations?tab=risk"
                className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors active:translate-y-0 ${
                  !isManageView && tab === "risk"
                    ? "bg-white text-zinc-800 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                避坑指南
              </Link>
              <Link
                href="/violations?view=manage"
                className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors active:translate-y-0 ${
                  isManageView
                    ? "bg-white text-zinc-800 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                管理闭环
              </Link>
            </div>
          ) : (
            <div className="inline-flex rounded-xl bg-zinc-100 p-1">
              <Link
                href="/violations?tab=safe"
                className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors active:translate-y-0 ${
                  tab === "safe"
                    ? "bg-white text-zinc-800 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                找可用话术
              </Link>
              <Link
                href="/violations?tab=risk"
                className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors active:translate-y-0 ${
                  tab === "risk"
                    ? "bg-white text-zinc-800 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                避坑指南
              </Link>
            </div>
          )}
        </header>

        {isManageView && manageData ? (
          <ConversionHubShell
            weekStart={getWeekStartDate()}
            inbox={manageData.inbox}
            inboxCounts={manageData.inboxCounts}
            processed={manageData.processed}
            processedPending={!PROCESSED_RPC_READY}
            layoutVariant="embedded"
          />
        ) : (
          <>
            {/* Filter Bar */}
            <section>
              <FilterBar purpose={getTabPurpose(tab)} />
            </section>

            {/* Header row above list */}
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-medium text-zinc-700">
                {query ? `「${query}」的搜索结果` : "话术列表"}
                <span className="ml-2 font-mono text-[12px] text-zinc-400 tabular-nums">
                  {totalCases}
                </span>
              </h2>
            </div>

            {error ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-[13px] leading-[1.7] text-[#D99E55]">
                {error}
              </div>
            ) : cases.length ? (
              <CaseList
                cases={cases}
                conversionRankItems={conversionRankItems}
                violationRankItems={violationRankItems}
                canManageViolations={canManageViolations}
                isOwner={isOwner}
              />
            ) : (
              <>
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <RankBoard
                    title="转化率排行榜"
                    subtitle="样本≥3 条"
                    items={conversionRankItems}
                    metricLabel="转化率"
                    metricKey="conversion_rate"
                    accentColor="#6FAA7D"
                    emptyHint="样本不足，暂无排名"
                    viewAllHref="/violations?tab=safe&sort=conversion_rate&order=desc"
                  />
                  <RankBoard
                    title="违规率排行榜"
                    subtitle="样本≥3 条"
                    items={violationRankItems}
                    metricLabel="违规率"
                    metricKey="pass_rate"
                    accentColor="#C9604D"
                    emptyHint="样本不足，暂无排名"
                    viewAllHref="/violations?tab=risk&sort=pass_rate&order=asc"
                  />
                </section>

                <div className="rounded-xl border border-dashed border-zinc-300 bg-white py-10">
                  <EmptyState
                    title={query ? "没找到匹配的话术" : "话术库还没有内容"}
                    description={
                      query
                        ? "换个关键词试试，或先去交一条新案例。"
                        : "去交一条新案例，让团队一起沉淀经验。"
                    }
                  />
                  <div className="mt-4 flex justify-center">
                    <Link
                      href="/violations/submit"
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#D97757] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#C96442] active:translate-y-0"
                    >
                      提交新案例
                      <ArrowRight className="size-4 stroke-[1.5]" />
                    </Link>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
