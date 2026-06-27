import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, FilePlus2, Settings2, TrendingUp } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";

import type { SortKey } from "./components/types";
import { BackButton } from "./components/back-button";
import { ViolationsHeaderStats } from "./violations-header-stats";
import { ViolationsStaffDataContainer } from "./violations-staff-data-container";
import { ViolationsManageDataContainer } from "./violations-manage-data-container";
import ViolationsLoading from "./loading";

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

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
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
            <div className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-zinc-500">
              {isManageView ? (
                "审核员工提交，把有价值的话术沉淀进知识库；高风险先处理，缺数据其次。"
              ) : (
                <Suspense fallback={<span>正在计算团队案例指标...</span>}>
                  <ViolationsHeaderStats />
                </Suspense>
              )}
            </div>
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
                  className="group inline-flex h-10 items-center gap-2 rounded-xl bg-[#D97757] px-4 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#C96442] hover:shadow-sm active:translate-y-0"
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

      <Suspense
        key={`${isManageView ? "manage" : "staff"}-${activeSort}-${activeOrder}-${query}-${guidanceMethods.join(",")}`}
        fallback={<ViolationsLoading />}
      >
        {isManageView ? (
          <ViolationsManageDataContainer userId={user.id} isOwner={isOwner} />
        ) : (
          <ViolationsStaffDataContainer
            activeSort={activeSort}
            activeOrder={activeOrder}
            guidanceMethods={guidanceMethods}
            query={query}
            isOwner={isOwner}
            canManageViolations={canManageViolations}
          />
        )}
      </Suspense>
    </div>
  );
}
