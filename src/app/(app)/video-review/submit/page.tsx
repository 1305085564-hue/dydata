import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { SubmitContainer } from "./submit-container";

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

  const resolved = await searchParams;
  const draftIdRaw = resolved.draft;
  const draftId = typeof draftIdRaw === "string" && draftIdRaw.length > 0 ? draftIdRaw : null;
  const isAmend = Boolean(draftId);

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: "视频审核", href: "/video-review" },
          { label: isAmend ? "整改重提" : "上传待审稿" },
        ]}
      />
      <AdminWorkspaceLayout
        eyebrow={isAmend ? "Amend Draft" : "Submit Draft"}
        title={isAmend ? "整改重提" : "上传待审稿"}
        description={isAmend
          ? "按管理上一轮的反馈修改话术或截图，提交后回到待审队列。"
          : "提交话术原文 + 截图进入审核。审核通过即沉入数据页，全员可见。"
        }
        indexItems={[]}
        width="wide"
      >
        <Suspense fallback={<div className="h-48 rounded-xl bg-zinc-50/50 animate-pulse border border-zinc-200" />}>
          <SubmitContainer userId={user.id} userEmail={user.email} draftId={draftId} />
        </Suspense>
      </AdminWorkspaceLayout>
    </div>
  );
}
