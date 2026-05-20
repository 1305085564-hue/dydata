import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApiErrorMessage } from "@/lib/violations/errors";
import { CaseCard } from "./components/case-card";
import { CaseFilters } from "./components/case-filters";
import { ConversionCaseCard } from "./components/conversion-case-card";
import { PerspectiveTabs, type PerspectiveKey } from "./components/perspective-tabs";
import { TopScriptsBanner } from "./components/top-scripts-banner";
import type {
  ConversionCase,
  TopScriptEntry,
  ViolationCase,
  ViolationListResponse,
} from "./components/types";

type SearchParamsShape = Record<string, string | string[] | undefined>;

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

type ConversionData = {
  cases: ConversionCase[];
  topScripts: TopScriptEntry[];
};

async function loadConversionData(
  searchParams: SearchParamsShape,
): Promise<ConversionData> {
  const admin = createAdminClient();
  const format = readParam(searchParams, "format", "all");
  const query = readParam(searchParams, "q", "");
  const minUsage = Number(readParam(searchParams, "minUsage", "3"));

  let listQuery = admin
    .from("violation_cases")
    .select(
      "id, script_text, script_format, total_views, total_follows, usage_count, weighted_conversion_rate, created_at",
    )
    .eq("is_deleted", false)
    .eq("purpose", "conversion")
    .gte("usage_count", Number.isFinite(minUsage) ? minUsage : 3)
    .order("weighted_conversion_rate", { ascending: false, nullsFirst: false })
    .order("total_views", { ascending: false })
    .limit(60);

  if (format !== "all") {
    listQuery = listQuery.eq("script_format", format);
  }
  if (query) {
    listQuery = listQuery.ilike("script_text", `%${query}%`);
  }

  const topQuery = admin
    .from("violation_cases")
    .select(
      "id, script_text, total_views, total_follows, usage_count, weighted_conversion_rate",
    )
    .eq("is_deleted", false)
    .eq("purpose", "conversion")
    .gte("usage_count", 3)
    .gte("total_views", 1000)
    .order("weighted_conversion_rate", { ascending: false, nullsFirst: false })
    .order("total_views", { ascending: false })
    .limit(3);

  const [listResult, topResult] = await Promise.all([listQuery, topQuery]);

  if (listResult.error) {
    throw new Error(listResult.error.message || "加载转化话术失败");
  }

  return {
    cases: (listResult.data ?? []) as ConversionCase[],
    topScripts: (topResult.data ?? []) as TopScriptEntry[],
  };
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

  const resolved = await searchParams;
  const perspectiveRaw = readParam(resolved, "perspective", "violation");
  const perspective: PerspectiveKey =
    perspectiveRaw === "conversion" ? "conversion" : "violation";

  const status = readParam(resolved, "status", "all");
  const category = readParam(resolved, "category", "all");
  const query = readParam(resolved, "q", "");
  const format = readParam(resolved, "format", "all");
  const minUsage = readParam(resolved, "minUsage", "3");

  let violationCases: ViolationCase[] = [];
  let conversionData: ConversionData = { cases: [], topScripts: [] };
  let error: string | null = null;

  try {
    if (perspective === "violation") {
      violationCases = await loadViolationCases(resolved);
    } else {
      conversionData = await loadConversionData(resolved);
    }
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "加载失败";
  }

  const headingLabel = perspective === "conversion" ? "转化话术库" : "话术案例库";
  const headingEyebrow =
    perspective === "conversion" ? "转化话术库" : "话术案例库";
  const headingDesc =
    perspective === "conversion"
      ? "按转化表现汇总的导粉话术，优先沿用高转化模板。"
      : "查看公司已沉淀的违规与可用话术案例，优先按管理员确认结果使用。";

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

      <PerspectiveTabs active={perspective} />

      {perspective === "conversion" ? (
        <TopScriptsBanner items={conversionData.topScripts} />
      ) : null}

      <CaseFilters
        perspective={perspective}
        status={status}
        category={category}
        query={query}
        format={format}
        minUsage={minUsage}
      />

      {error ? (
        <div className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#D99E55] bg-zinc-50 p-5 text-sm leading-6 text-[#D99E55]">
          {error}
        </div>
      ) : perspective === "violation" ? (
        violationCases.length ? (
          <div className="space-y-3">
            {violationCases.map((caseItem) => (
              <CaseCard key={caseItem.id} caseItem={caseItem} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="没有找到匹配的违规话术"
            hint="试试清除筛选，或去 今日工作台 的“收录违规”补一条。"
          />
        )
      ) : conversionData.cases.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {conversionData.cases.map((caseItem) => (
            <ConversionCaseCard key={caseItem.id} caseItem={caseItem} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="还没有转化话术数据"
          hint="使用量达到筛选阈值后，转化榜和列表会自动填充。"
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
