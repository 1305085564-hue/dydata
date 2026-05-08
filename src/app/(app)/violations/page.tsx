import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getApiErrorMessage } from "@/lib/violations/errors";
import { CaseCard } from "./components/case-card";
import { CaseFilters } from "./components/case-filters";
import type { ViolationCase, ViolationListResponse } from "./components/types";

async function loadCases(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  const status = typeof searchParams.status === "string" ? searchParams.status : "all";
  const category = typeof searchParams.category === "string" ? searchParams.category : "all";
  const query = typeof searchParams.q === "string" ? searchParams.q : "";
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

export default async function ViolationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const resolvedSearchParams = await searchParams;
  const status = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : "all";
  const category = typeof resolvedSearchParams.category === "string" ? resolvedSearchParams.category : "all";
  const query = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : "";

  let cases: ViolationCase[] = [];
  let error: string | null = null;
  try {
    cases = await loadCases(resolvedSearchParams);
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "加载违规库失败";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-400">Violation Library</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">违规库</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            查看公司已沉淀的违规与可用话术案例，优先按管理员确认结果使用。
          </p>
        </div>
        <Link href="/violations/submit">
          <Button className="h-11 rounded-2xl bg-zinc-950 text-white hover:bg-zinc-800">
            <Plus className="size-4" />
            提交新案例
          </Button>
        </Link>
      </div>

      <CaseFilters status={status} category={category} query={query} />

      {error ? (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          {error}
        </div>
      ) : cases.length ? (
        <div className="space-y-3">
          {cases.map((caseItem) => (
            <CaseCard key={caseItem.id} caseItem={caseItem} />
          ))}
        </div>
      ) : (
        <div className="rounded-[1.5rem] border border-dashed border-zinc-300 bg-white p-10 text-center">
          <h2 className="text-base font-semibold text-zinc-950">暂无案例</h2>
          <p className="mt-2 text-sm text-zinc-500">可以先从 dashboard 的“收录违规”进入提交。</p>
        </div>
      )}
    </div>
  );
}
