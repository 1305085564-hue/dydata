import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Breadcrumb } from "@/components/ui/breadcrumb";

import { ApprovedListDataContainer } from "../approved-list-data-container";
import { VideoReviewTabs } from "../components/video-review-tabs";

export default async function VideoReviewArchivePage({
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
  const { businessRole, role } = permInfo;
  const isOwner = role === "owner";
  const isAdmin = ["owner", "team_admin", "group_leader"].includes(businessRole);

  const resolved = await searchParams;
  const queryRaw = resolved.q;
  const query = typeof queryRaw === "string" ? queryRaw.trim() : "";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Breadcrumb
        items={[
          { label: "视频审核", href: "/video-review" },
          { label: "已发案例" },
        ]}
      />

      <header className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 sm:px-8 sm:py-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400 font-mono">
              Video Review
            </p>
            <h1 className="mt-2 text-[24px] font-semibold leading-[1.33] tracking-tight text-zinc-800">
              视频审核 · 已发案例
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-zinc-500">
              上传待审稿，审核通过后会沉入此页，全员可见
            </p>
          </div>
        </div>

        <VideoReviewTabs isAdmin={isAdmin} />
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
