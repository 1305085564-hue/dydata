import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FilePlus2, Settings2, TrendingUp } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { EmptyState } from "@/components/ui/empty-state";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadViolationDashboardSummary,
  loadViolationsList,
  type SortDirection,
} from "@/lib/violations/read-model";

import { CaseList } from "./components/case-list";
import type {
  RankItem,
  SortKey,
  ViolationCase,
} from "./components/types";

import { ConversionHubShell } from "@/app/(app)/violations/admin-components/hub-shell";
import {
  getWeekStartDate,
  loadInboxData,
  loadProcessedData,
  PROCESSED_RPC_READY,
} from "@/app/(app)/violations/admin-components/data";
import { BackButton } from "./components/back-button";

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
  supabase: Awaited<ReturnType<typeof createClient>>;
  sort: SortKey;
  order: SortDirection;
  guidanceMethods: string[];
  query: string;
}): Promise<ViolationCase[]> {
  const { payload, errorMessage } = await loadViolationsList({
    supabase: params.supabase as never,
    view: "staff",
    page: 1,
    pageSize: 30,
    from: 0,
    to: 29,
    search: params.query,
    sort: params.sort,
    order: params.order,
    guidanceMethod: params.guidanceMethods[0] ?? null,
  });

  if (errorMessage || !payload) throw new Error(errorMessage ?? "加载导粉中心失败");
  return payload.data as ViolationCase[];
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

async function loadDashboard(): Promise<DashboardData> {
  const { data } = await loadViolationDashboardSummary({
    supabase: createAdminClient() as never,
  });
  return data ?? null;
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
  const isManageView = canManageViolations && view === "manage";

  const sortParam = readParam(resolved, "sort") as SortKey | "";
  const orderParam = readParam(resolved, "order") as "asc" | "desc" | "";
  const guidanceMethods = readParamArray(resolved, "guidance_method");

  const activeSort: SortKey = sortParam || "pass_rate";
  const activeOrder: "asc" | "desc" = orderParam || "desc";

  /* Fetch data in parallel */
  let cases: ViolationCase[] = [];
  let dashboard: DashboardData = null;
  let error: string | null = null;

  try {
    [cases, dashboard] = await Promise.all([
      isManageView
        ? Promise.resolve([])
        : loadCases({ supabase, sort: activeSort, order: activeOrder, guidanceMethods, query }),
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
                导粉中心
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

            {/* Right CTAs */}
            <div className="flex shrink-0 items-center gap-2">
              {isManageView ? (
                <>
                  <BackButton />
                  <Link
                    href="/violations"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
                  >
                    <TrendingUp className="size-3.5 stroke-[1.5]" />
                    员工视角
                  </Link>
                  <Link
                    href="/violations/submit"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#D97757] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#C96442] active:translate-y-0"
                  >
                    <FilePlus2 className="size-3.5 stroke-[1.5]" />
                    替员工提交
                  </Link>
                </>
              ) : (
                <>
                  {canManageViolations ? (
                    <Link
                      href="/violations?view=manage"
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-[13px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
                    >
                      <Settings2 className="size-3.5 stroke-[1.5]" />
                      管理工作台
                    </Link>
                  ) : null}
                  <Link
                    href="/violations/submit"
                    className="group inline-flex h-10 items-center gap-2 rounded-xl bg-[#D97757] px-4 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#C96442] hover:shadow-md active:translate-y-0"
                  >
                    <FilePlus2 className="size-4 stroke-[1.75]" />
                    上传话术
                    <ArrowRight className="size-3.5 stroke-[1.75] transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </>
              )}
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
            isOwner={isOwner}
          />
        ) : (
          <>
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
