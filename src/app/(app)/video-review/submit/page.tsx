import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { Breadcrumb } from "@/components/ui/breadcrumb";

import { SubmitContainer } from "./submit-container";
import { VideoReviewTabs } from "../components/video-review-tabs";

export default async function SubmitVideoReviewPage({
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
  const { businessRole } = permInfo;
  const isAdmin = ["owner", "team_admin", "group_leader"].includes(businessRole);

  const resolved = await searchParams;
  const draftIdRaw = resolved.edit || resolved.draft;
  const draftId = typeof draftIdRaw === "string" && draftIdRaw.length > 0 ? draftIdRaw : null;
  const isAmend = Boolean(draftId);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Breadcrumb
        items={[
          { label: "视频审核", href: "/video-review" },
          { label: isAmend ? "整改重提" : "上传待审稿" },
        ]}
      />

      <header className="rounded-2xl border border-stone-200 bg-white px-6 py-5 sm:px-8 sm:py-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-stone-500">
              视频审核
            </p>
            <h1 className="mt-2 text-[24px] font-bold leading-[1.33] tracking-tight text-stone-950">
              {isAmend ? "整改重提" : "上传待审稿"}
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-stone-500">
              {isAmend
                ? "按管理上一轮的反馈修改话术或截图，提交后回到待审队列。"
                : "提交话术原文 + 截图进入审核。审核通过即沉入数据页，全员可见。"}
            </p>
          </div>
        </div>

        <VideoReviewTabs isAdmin={isAdmin} />
      </header>

      <Suspense fallback={<div className="h-48 rounded-xl bg-stone-50/50 animate-pulse border border-stone-200" />}>
        <SubmitContainer userId={user.id} userEmail={user.email ?? undefined} draftId={draftId} />
      </Suspense>
    </div>
  );
}
