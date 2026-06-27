import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, FilePlus2, Settings2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { TableSkeleton } from "@/components/ui/table-skeleton";

import { ApprovedListDataContainer } from "./approved-list-data-container";

export default async function VideoReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const canReview =
    isOwner || hasPermission(businessRole, permissions, "manage_violations");

  const resolved = await searchParams;
  const queryRaw = resolved.q;
  const query = typeof queryRaw === "string" ? queryRaw.trim() : "";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 sm:px-8 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
              Video Review
            </p>
            <h1 className="mt-2 text-[24px] font-semibold leading-[1.33] tracking-tight text-zinc-800">
              视频审核 · 已发案例
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-zinc-500">
              上传待审稿，审核通过后会沉入此页，全员可见
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canReview ? (
              <Link
                href="/video-review/manage"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-[13px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
              >
                <Settings2 className="size-3.5 stroke-[1.5]" />
                管理审核台
              </Link>
            ) : null}
            <Link
              href="/video-review/submit"
              className="group inline-flex h-10 items-center gap-2 rounded-xl bg-[#D97757] px-4 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#C96442] hover:shadow-sm active:translate-y-0"
            >
              <FilePlus2 className="size-4 stroke-[1.75]" />
              上传待审稿
              <ArrowRight className="size-3.5 stroke-[1.75] transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      <Suspense
        key={query}
        fallback={
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <TableSkeleton columnCount={5} rowCount={6} showHeader={true} />
          </div>
        }
      >
        <ApprovedListDataContainer query={query} userId={user.id} />
      </Suspense>
    </div>
  );
}
