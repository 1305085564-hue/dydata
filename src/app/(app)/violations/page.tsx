import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  ArrowRight,
  Search as SearchIcon,
  Sparkles,
  TestTube2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { getApiErrorMessage } from "@/lib/violations/errors";

import { CaseCard } from "./components/case-card";
import { StaffSearchHero } from "./components/staff-search-hero";
import type { ViolationCase, ViolationListResponse } from "./components/types";

import { ConversionHubShell } from "@/app/(app)/admin/conversion-hub/hub-shell";
import { getWeekStartDate, loadInboxData, loadScriptsTab } from "@/app/(app)/admin/conversion-hub/data";

type SearchParamsShape = Record<string, string | string[] | undefined>;

function readParam(params: SearchParamsShape, key: string): string {
  const raw = params[key];
  if (typeof raw === "string" && raw.length > 0) return raw;
  return "";
}

async function loadStaffCases(query: string): Promise<ViolationCase[]> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("view", "staff");
  params.set("pageSize", "30");

  const headerStore = await headers();
  const host = headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";
  const cookie = headerStore.get("cookie") ?? "";
  const response = await fetch(`${protocol}://${host}/api/violations?${params.toString()}`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getApiErrorMessage(payload, "加载话术案例库失败"));

  const listPayload = payload as ViolationListResponse;
  return (listPayload.cases ?? listPayload.items ?? listPayload.data ?? []) as ViolationCase[];
}

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
  const canManageViolations = isOwner || hasPermission(businessRole, permissions, "manage_violations");

  const resolved = await searchParams;
  const query = readParam(resolved, "q");
  const view = readParam(resolved, "view") || "staff";
  const isManageView = canManageViolations && view === "manage";

  let cases: ViolationCase[] = [];
  let error: string | null = null;
  try {
    cases = await loadStaffCases(query);
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "加载失败";
  }

  const recommendedCases = cases.filter((item) => {
    const promotion = (item as { promotion_level?: string }).promotion_level;
    return promotion === "promoted";
  });
  const testingCases = cases.filter((item) => {
    const usageState = (item as { usage_state?: string }).usage_state;
    return usageState === "testing";
  });

  let manageData: {
    inbox: Awaited<ReturnType<typeof loadInboxData>>["data"];
    inboxCounts: Awaited<ReturnType<typeof loadInboxData>>["counts"];
    scripts: Awaited<ReturnType<typeof loadScriptsTab>> | null;
  } | null = null;

  if (isManageView) {
    const weekStart = getWeekStartDate();
    const [{ data: inbox, counts: inboxCounts }, scripts] = await Promise.all([
      loadInboxData(user.id),
      loadScriptsTab(weekStart),
    ]);
    manageData = { inbox, inboxCounts, scripts };
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">话术案例库</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-800 sm:text-3xl">
            {isManageView ? "管理工作台" : "先找现成的话术"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            {isManageView
              ? "审核员工提交，把有价值的话术沉淀进知识库；高风险先处理，再补缺数据，最后看推广候选。"
              : "团队沉淀的可用话术与避坑案例。搜不到再交一条，让团队一起验证。"}
          </p>
        </div>
        {canManageViolations ? (
          <div className="inline-flex rounded-xl bg-zinc-100 p-1">
            <Link
              href="/violations"
              className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors ${
                !isManageView
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              找话术
            </Link>
            <Link
              href="/violations?view=manage"
              className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors ${
                isManageView
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              管理闭环
            </Link>
          </div>
        ) : null}
      </header>

      {isManageView && manageData ? (
        <ConversionHubShell
          weekStart={getWeekStartDate()}
          inbox={manageData.inbox}
          inboxCounts={manageData.inboxCounts}
          scripts={manageData.scripts}
          layoutVariant="embedded"
        />
      ) : (
        <>
          <StaffSearchHero defaultQuery={query} totalCases={cases.length} />

          {recommendedCases.length > 0 || testingCases.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {recommendedCases.length > 0 ? (
                <HighlightStrip
                  tone="positive"
                  icon={Sparkles}
                  title="管理员推荐"
                  count={recommendedCases.length}
                  hint="经实测有效，优先复用"
                />
              ) : null}
              {testingCases.length > 0 ? (
                <HighlightStrip
                  tone="warm"
                  icon={TestTube2}
                  title="待测试"
                  count={testingCases.length}
                  hint="样本不足，谨慎试用并补记效果"
                />
              ) : null}
            </div>
          ) : null}

          <section id="cases" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold tracking-tight text-zinc-700">
                {query ? `「${query}」的搜索结果` : "团队可用话术"}
                <span className="ml-2 font-mono text-[12px] text-zinc-400">{cases.length}</span>
              </h2>
            </div>

            {error ? (
              <div className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#D99E55] bg-zinc-50 p-5 text-sm leading-6 text-[#D99E55]">
                {error}
              </div>
            ) : cases.length ? (
              <div className="space-y-3">
                {cases.map((caseItem) => (
                  <CaseCard key={caseItem.id} caseItem={caseItem} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={SearchIcon}
                title={query ? "没找到匹配的话术" : "话术库还没有内容"}
                hint={
                  query
                    ? "换个关键词试试，或先去交一条新案例。"
                    : "去交一条新案例，让团队一起沉淀经验。"
                }
                action={
                  <Link
                    href="/violations/submit"
                    className="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                  >
                    提交新案例
                    <ArrowRight className="size-4 stroke-[1.5]" />
                  </Link>
                }
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function HighlightStrip({
  tone,
  icon: Icon,
  title,
  count,
  hint,
}: {
  tone: "positive" | "warm";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  hint: string;
}) {
  const accent =
    tone === "positive"
      ? { border: "border-l-[#6FAA7D]", bg: "bg-[#6FAA7D]/5", text: "text-[#3F6F4F]", chip: "bg-[#6FAA7D]/10 text-[#6FAA7D]" }
      : { border: "border-l-[#D97757]", bg: "bg-[#D97757]/5", text: "text-[#A85638]", chip: "bg-[#D97757]/10 text-[#D97757]" };
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 border-l-[2px] ${accent.border} ${accent.bg} px-4 py-3`}>
      <div className="flex items-center gap-3">
        <span className={`flex size-9 items-center justify-center rounded-xl ${accent.chip}`}>
          <Icon className="size-4 stroke-[1.5]" />
        </span>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-zinc-800">{title}</p>
          <p className="text-[11px] text-zinc-500">{hint}</p>
        </div>
      </div>
      <span className={`text-base font-semibold tabular-nums ${accent.text}`}>{count}</span>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
        <Icon className="size-6 stroke-[1.5]" />
      </div>
      <h3 className="mt-4 text-[18px] font-semibold text-zinc-800">{title}</h3>
      <p className="mt-2 text-sm text-zinc-500">{hint}</p>
      {action ? <div className="mt-4 inline-flex">{action}</div> : null}
    </div>
  );
}
