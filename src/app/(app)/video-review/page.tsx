import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FilePlus2, Settings2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { EmptyState } from "@/components/ui/empty-state";
import { loadApprovedList } from "@/lib/publish-drafts/read-model";

import { ApprovedList } from "./components/approved-list";

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

  const { data, errorMessage } = await loadApprovedList({
    limit: 100,
    search: query || null,
  });
  const items = data ?? [];
  const totalCount = items.length;

  return (
    <div className="min-h-screen bg-[#F0F0F1]">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
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
                {totalCount > 0
                  ? `团队已发布 ${totalCount} 条待审稿件 · 全员可查阅，发布日期与账号均已沉淀`
                  : "上传待审稿，审核通过后会沉入此页，全员可见"}
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
                className="group inline-flex h-10 items-center gap-2 rounded-xl bg-[#D97757] px-4 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#C96442] hover:shadow-md active:translate-y-0"
              >
                <FilePlus2 className="size-4 stroke-[1.75]" />
                上传待审稿
                <ArrowRight className="size-3.5 stroke-[1.75] transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-[13px] leading-[1.7] text-[#D99E55]">
            {errorMessage}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-12">
            <EmptyState
              title={query ? "没找到匹配的已发稿件" : "还没有已通过的稿件"}
              description={
                query
                  ? "换个关键词试试，或上传一条新的待审稿。"
                  : "上传一条待审稿，审核通过后会展示在这里。"
              }
            />
            <div className="mt-4 flex justify-center">
              <Link
                href="/video-review/submit"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#D97757] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#C96442] active:translate-y-0"
              >
                <FilePlus2 className="size-4 stroke-[1.75]" />
                上传待审稿
              </Link>
            </div>
          </div>
        ) : (
          <ApprovedList items={items} query={query} />
        )}
      </div>
    </div>
  );
}
