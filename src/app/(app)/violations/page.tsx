import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { getApiErrorMessage } from "@/lib/violations/errors";
import { ConversionHubShell } from "@/app/(app)/admin/conversion-hub/hub-shell";
import {
  getWeekStartDate,
  loadConversionHubData,
  normalizeFormat,
  normalizeSort,
  normalizeStatus,
  normalizeTab,
} from "@/app/(app)/admin/conversion-hub/data";
import type { HubTabKey } from "@/app/(app)/admin/conversion-hub/hub-shell";
import { CaseCard } from "./components/case-card";
import { CaseFilters } from "./components/case-filters";
import { PerspectiveTabs } from "./components/perspective-tabs";
import type {
  ViolationCase,
  ViolationListResponse,
} from "./components/types";

type SearchParamsShape = Record<string, string | string[] | undefined>;

type LocalPerspectiveKey = "violation" | "conversion" | "review";

function readParam(
  params: SearchParamsShape,
  key: string,
  fallback: string,
): string {
  const raw = params[key];
  if (typeof raw === "string" && raw.length > 0) return raw;
  return fallback;
}

async function loadViolationCases(searchParams: SearchParamsShape): Promise<ViolationCase[]> {
  const params = new URLSearchParams();
  const status = readParam(searchParams, "status", "all");
  const category = readParam(searchParams, "category", "all");
  const query = readParam(searchParams, "q", "");
  if (status && status !== "all") params.set("status", status);
  if (category && category !== "all") params.set("category", category);
  if (query) params.set("q", query);

  const headerStore = await headers();
  const host = headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";
  const cookie = headerStore.get("cookie") ?? "";
  const response = await fetch(`${protocol}://${host}/api/violations?${params.toString()}`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getApiErrorMessage(payload, "加载违规库失败"));

  const listPayload = payload as ViolationListResponse;
  return (listPayload.cases ?? listPayload.items ?? listPayload.data ?? []) as ViolationCase[];
}

const VALID_HUB_TABS_FOR_CONVERSION: HubTabKey[] = ["scripts", "weekly", "analytics", "advice"];

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

  const resolved = await searchParams;
  const perspectiveRaw = readParam(resolved, "perspective", "violation");
  const validPerspectives: LocalPerspectiveKey[] = ["violation", "conversion", "review"];
  const perspective: LocalPerspectiveKey =
    validPerspectives.includes(perspectiveRaw as LocalPerspectiveKey)
      ? (perspectiveRaw as LocalPerspectiveKey)
      : "violation";

  const permInfo = await getUserPermissions();
  if (!permInfo) redirect("/login");
  const { businessRole, permissions, role } = permInfo;
  const isOwner = role === "owner";
  const canManageViolations = isOwner || hasPermission(businessRole, permissions, "manage_violations");

  if (perspective === "review" && !canManageViolations) {
    redirect("/violations");
  }

  const headingLabel =
    perspective === "conversion"
      ? "转化中心"
      : perspective === "review"
        ? "合规审核"
        : "话术案例库";
  const headingEyebrow = headingLabel;
  const headingDesc =
    perspective === "conversion"
      ? "原转化中心：话术 → 周报 → 分析 → 建议，沉淀高转化模板与每周决策。"
      : perspective === "review"
        ? "原审核工作台：审核成员提交的话术，确认或驳回风险案例。"
        : "查看公司已沉淀的话术案例，优先按管理员确认结果使用。";

  if (perspective === "conversion" || perspective === "review") {
    const tabRaw = readParam(resolved, "tab", perspective === "review" ? "violations" : "scripts");
    const activeTab: HubTabKey =
      perspective === "review"
        ? "violations"
        : VALID_HUB_TABS_FOR_CONVERSION.includes(normalizeTab(tabRaw))
          ? normalizeTab(tabRaw)
          : "scripts";

    const status = normalizeStatus(readParam(resolved, "status", "submitted"));
    const category = readParam(resolved, "category", "全部");
    const keyword = readParam(resolved, "q", "").trim();
    const sort = normalizeSort(readParam(resolved, "sort", "rate"));
    const format = normalizeFormat(readParam(resolved, "format", "all"));
    const weekStart = getWeekStartDate();

    const { violations, pendingViolationsCount, scripts, weekly, analytics } = await loadConversionHubData({
      activeTab,
      status,
      category,
      keyword,
      sort,
      format,
      weekStart,
      includeViolations: perspective === "review",
    });

    const extraQueryParams = { perspective };
    const reviewHref = canManageViolations
      ? `/violations?perspective=review&tab=violations&status=submitted`
      : undefined;

    return (
      <div className="mx-auto max-w-6xl space-y-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">
              {headingEyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-800 sm:text-3xl">
              {headingLabel}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">{headingDesc}</p>
          </div>
          <Link href="/violations/submit">
            <Button className="h-11 rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 shadow-none">
              <Plus className="size-4" />
              提交新案例
            </Button>
          </Link>
        </div>

        <PerspectiveTabs active={perspective} canManageViolations={canManageViolations} />

        <ConversionHubShell
          weekStart={weekStart}
          activeTab={activeTab}
          violations={violations}
          pendingViolationsCount={pendingViolationsCount}
          weeklyBuckets={weekly?.buckets ?? null}
          weeklyConfirmedAt={weekly?.confirmedAt ?? null}
          weeklyGeneratedBy={weekly?.generatedBy ?? null}
          analyticsRows={analytics?.rows ?? []}
          analyticsTrend={analytics?.trend ?? []}
          analyticsSort={sort}
          analyticsFormat={format}
          scripts={scripts}
          basePath="/violations"
          extraQueryParams={extraQueryParams}
          hideViolationsTab={perspective === "conversion"}
          pendingViolationsHref={reviewHref}
          layoutVariant="embedded"
        />
      </div>
    );
  }

  // perspective === "violation": 普通话术案例库
  const status = readParam(resolved, "status", "all");
  const category = readParam(resolved, "category", "all");
  const query = readParam(resolved, "q", "");

  let violationCases: ViolationCase[] = [];
  let error: string | null = null;
  try {
    violationCases = await loadViolationCases(resolved);
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "加载失败";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">
            {headingEyebrow}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-800 sm:text-3xl">
            {headingLabel}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">{headingDesc}</p>
        </div>
        <Link href="/violations/submit">
          <Button className="h-11 rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 shadow-none">
            <Plus className="size-4" />
            提交新案例
          </Button>
        </Link>
      </div>

      <PerspectiveTabs active={perspective} canManageViolations={canManageViolations} />

      <CaseFilters
        perspective={perspective}
        status={status}
        category={category}
        query={query}
      />

      {error ? (
        <div className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#D99E55] bg-zinc-50 p-5 text-sm leading-6 text-[#D99E55]">
          {error}
        </div>
      ) : violationCases.length ? (
        <div className="space-y-3">
          {violationCases.map((caseItem) => (
            <CaseCard key={caseItem.id} caseItem={caseItem} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="没有找到匹配的话术案例"
          hint="试试清除筛选，或去「提交新案例」补一条。"
        />
      )}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-6"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h2 className="mt-4 text-[18px] font-semibold text-zinc-800">{title}</h2>
      <p className="mt-2 text-sm text-zinc-500">{hint}</p>
    </div>
  );
}
