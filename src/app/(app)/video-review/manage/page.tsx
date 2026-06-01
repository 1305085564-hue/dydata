import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { loadReviewQueue } from "@/lib/publish-drafts/read-model";

import { ManageShell } from "../components/manage-shell";

export default async function VideoReviewManagePage() {
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

  if (!canReview) redirect("/video-review");

  const { data, errorMessage } = await loadReviewQueue(user.id);
  const queue = data?.queue ?? [];
  const pendingCount = data?.pending_count ?? 0;

  return (
    <div className="min-h-screen bg-[#F0F0F1]">
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 sm:px-6">
        <Breadcrumb
          items={[
            { label: "视频审核", href: "/video-review" },
            { label: "管理审核台" },
          ]}
        />
        <header>
          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            Review Workbench
          </p>
          <h1 className="mt-2 text-[24px] font-semibold leading-[1.33] tracking-tight text-zinc-800">
            管理审核台
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-zinc-500">
            等最久的顶最前。一键通过即沉入数据页；打回时填一句优化建议，处理完自动跳下一条。
          </p>
        </header>

        {errorMessage ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-[13px] leading-[1.7] text-[#D99E55]">
            {errorMessage}
          </div>
        ) : (
          <ManageShell initialQueue={queue} initialPendingCount={pendingCount} />
        )}
      </div>
    </div>
  );
}
