import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { getSafeAccountDisplayName } from "@/lib/loaders/shared";
import { loadDraftById } from "@/lib/publish-drafts/read-model";

import { SubmitForm } from "../components/submit-form";
import type { VideoReviewAccount } from "../components/types";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const userDisplayName =
    profile?.name?.trim() || user.email?.split("@")[0] || "我";

  const { data: rawAccounts } = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true });

  const accountList = (rawAccounts ?? []) as Array<{
    id: string;
    name: string | null;
    content_direction: string | null;
  }>;
  const accounts: VideoReviewAccount[] = accountList.map((acc, index, list) => ({
    id: acc.id,
    name: acc.name ?? "未命名账号",
    display_name: getSafeAccountDisplayName({
      rawName: acc.name,
      userDisplayName,
      contentDirection: acc.content_direction,
      index,
      total: list.length,
    }),
    content_direction: acc.content_direction,
  }));

  const resolved = await searchParams;
  const draftIdRaw = resolved.draft;
  const draftId = typeof draftIdRaw === "string" && draftIdRaw.length > 0 ? draftIdRaw : null;

  let amendInitial = null as null | {
    id: string;
    accountId: string | null;
    scriptText: string;
    screenshotPaths: string[];
    lastRejection: import("../components/types").FeedbackHistoryItem | null;
    history: import("../components/types").FeedbackHistoryItem[];
  };

  if (draftId) {
    const { data: draft } = await loadDraftById(supabase, draftId);
    if (!draft || draft.submitted_by !== user.id) {
      redirect("/video-review");
    }
    if (draft.status !== "rejected") {
      // 已通过或还在审核中的稿件不允许整改
      redirect("/video-review");
    }
    const lastReject = [...draft.feedback_history]
      .reverse()
      .find((h) => h.action === "reject") ?? null;
    amendInitial = {
      id: draft.id,
      accountId: draft.account_id,
      scriptText: draft.script_text,
      screenshotPaths: draft.screenshot_paths,
      lastRejection: lastReject,
      history: draft.feedback_history,
    };
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Breadcrumb
        items={[
          { label: "视频审核", href: "/video-review" },
          { label: amendInitial ? "整改重提" : "上传待审稿" },
        ]}
      />
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
          {amendInitial ? "Amend Draft" : "Submit Draft"}
        </p>
        <h1 className="mt-2 text-[24px] font-semibold leading-[1.33] tracking-tight text-zinc-800">
          {amendInitial ? "整改重提" : "上传待审稿"}
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-zinc-500">
          {amendInitial
            ? "按管理上一轮的反馈修改话术或截图，提交后回到待审队列。"
            : "提交话术原文 + 截图进入审核。审核通过即沉入数据页，全员可见。"}
        </p>
      </div>

      <SubmitForm
        accounts={accounts}
        draftId={amendInitial?.id}
        initialAccountId={amendInitial?.accountId}
        initialScriptText={amendInitial?.scriptText}
        initialScreenshots={amendInitial?.screenshotPaths}
        lastRejection={amendInitial?.lastRejection ?? null}
        feedbackHistory={amendInitial?.history ?? []}
      />
    </div>
  );
}
