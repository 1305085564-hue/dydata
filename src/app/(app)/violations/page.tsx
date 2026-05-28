import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ArrowRight, FilePlus2, Sparkles } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { getApiErrorMessage } from "@/lib/violations/errors";
import { EmptyState } from "@/components/ui/empty-state";

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
  usage_count: number | null;
  conversion_rate: string | null;
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

function mapConversionToRankItems(items: ConversionItem[]): RankItem[] {
  return items.map((item) => ({
    id: item.id,
    script_text: item.script_text,
    metricValue: item.conversion_rate ?? "—",
    metricRaw: null,
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
  if (tab === "safe") return "conversion_rate";
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
  const tab = readParam(resolved, "tab") || "safe";
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
    <div className="min-h-screen bg-[#F0F0F1]">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {/* Hero / Header */}
        <header className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                话术案例库
              </p>
              <h1 className="mt-2 text-[24px] font-semibold leading-[1.33] tracking-tight text-zinc-800">
                {isManageView ? "管理工作台" : "找话术 · 避坑"}
              </h1>
              <p className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-zinc-500">
                {isManageView
                  ? "审核员工提交，把有价值的话术沉淀进知识库；高风险先处理，缺数据其次。"
                  : `团队已沉淀 ${weeklyNewCases} 条新案例 · ${weeklyNewViolations} 条违规待规避`}
              </p>
            </div>

            {/* Primary CTA */}
            {!isManageView ? (
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href="/violations/submit"
                  className="group inline-flex h-10 items-center gap-2 rounded-xl bg-[#D97757] px-4 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#C96442] hover:shadow-md active:translate-y-0"
                >
                  <FilePlus2 className="size-4 stroke-[1.75]" />
                  上传话术
                  <ArrowRight className="size-3.5 stroke-[1.75] transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href="/violations"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
                >
                  员工视角
                </Link>
                <Link
                  href="/violations/submit"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#D97757] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#C96442] active:translate-y-0"
                >
                  <FilePlus2 className="size-3.5 stroke-[1.5]" />
                  替员工提交
                </Link>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
            <div className="inline-flex rounded-xl bg-zinc-100 p-1">
              <Link
                href="/violations?tab=safe"
                className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors active:translate-y-0 ${
                  !isManageView && tab === "safe"
                    ? "bg-white text-zinc-800 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="size-3 stroke-[1.5]" />
                  找可用话术
                </span>
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
              {canManageViolations ? (
                <Link
                  href="/violations?view=manage"
                  className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors active:translate-y-0 ${
                    isManageView
                      ? "bg-white text-zinc-800 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  审批闭环
                </Link>
              ) : null}
            </div>
          </div>
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
            {/* Filter Bar — 滚动浏览长列表时常驻吸顶 */}
            <section className="sticky top-0 z-20 -mx-4 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 [background:linear-gradient(to_bottom,rgba(240,240,241,0.92),rgba(240,240,241,0.78))]">
              <FilterBar purpose={getTabPurpose(tab)} />
            </section>

            {error ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-[13px] leading-[1.7] text-[#D99E55]">
                {error}
              </div>
            ) : (
              <CaseList
                cases={cases}
                conversionRankItems={conversionRankItems}
                violationRankItems={violationRankItems}
                canManageViolations={canManageViolations}
                isOwner={isOwner}
                totalCases={totalCases}
                query={query}
                emptyState={
                  !cases.length ? (
                    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-12">
                      <EmptyState
                        title={query ? "没找到匹配的话术" : "话术库还没有内容"}
                        description={
                          query
                            ? "换个关键词试试，或先去交一条新案例。"
                            : "去上传一条你常用的话术，让团队一起沉淀经验。"
                        }
                      />
                      <div className="mt-4 flex justify-center">
                        <Link
                          href="/violations/submit"
                          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#D97757] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#C96442] active:translate-y-0"
                        >
                          <FilePlus2 className="size-4 stroke-[1.75]" />
                          上传新话术
                        </Link>
                      </div>
                    </div>
                  ) : null
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
