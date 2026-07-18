import Link from "next/link";
import { FilePlus2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  loadViolationDashboardSummary,
  loadViolationsList,
  type QueryClientLike,
  type SortDirection,
} from "@/lib/violations/read-model";

import { CaseList } from "./components/case-list";
import type {
  SortKey,
  ViolationCase,
  RankItem,
} from "./components/types";

interface ViolationsStaffDataContainerProps {
  activeSort: SortKey;
  activeOrder: "asc" | "desc";
  guidanceMethods: string[];
  query: string;
  isOwner: boolean;
  canManageViolations: boolean;
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

async function loadCases(params: {
  supabase: QueryClientLike;
  sort: SortKey;
  order: SortDirection;
  guidanceMethods: string[];
  query: string;
}): Promise<ViolationCase[]> {
  const { payload, errorMessage } = await loadViolationsList({
    supabase: params.supabase,
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

  if (errorMessage || !payload) throw new Error(errorMessage ?? "加载避坑案例失败");
  return payload.data as ViolationCase[];
}

async function loadDashboard(): Promise<DashboardData> {
  const { data } = await loadViolationDashboardSummary({
    supabase: createAdminClient() as never,
  });
  return data ?? null;
}

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

export async function ViolationsStaffDataContainer({
  activeSort,
  activeOrder,
  guidanceMethods,
  query,
  isOwner,
  canManageViolations,
}: ViolationsStaffDataContainerProps) {
  const supabase = await createClient();

  let cases: ViolationCase[] = [];
  let dashboard: DashboardData = null;
  let error: string | null = null;

  try {
    [cases, dashboard] = await Promise.all([
      loadCases({ supabase, sort: activeSort, order: activeOrder, guidanceMethods, query }),
      loadDashboard(),
    ]);
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "加载失败";
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <ErrorState title="案例加载失败" description={error} />
      </div>
    );
  }

  const conversionRankItems = mapConversionToRankItems(dashboard?.conversionTop3 ?? []);
  const violationRankItems = mapDangerousToRankItems(dashboard?.dangerousTop3 ?? []);
  const totalCases = cases.length;

  if (cases.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-12">
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
    );
  }

  return (
    <CaseList
      cases={cases}
      conversionRankItems={conversionRankItems}
      violationRankItems={violationRankItems}
      canManageViolations={canManageViolations}
      isOwner={isOwner}
      totalCases={totalCases}
      query={query}
    />
  );
}
