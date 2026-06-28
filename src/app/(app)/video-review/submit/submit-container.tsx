import { createClient } from "@/lib/supabase/server";
import { getSafeAccountDisplayName } from "@/lib/loaders/shared";
import { loadDraftById } from "@/lib/publish-drafts/read-model";
import { SubmitForm } from "../components/submit-form";
import type { VideoReviewAccount } from "../components/types";

interface SubmitContainerProps {
  userId: string;
  userEmail: string | undefined;
  draftId: string | null;
}

export async function SubmitContainer({ userId, userEmail, draftId }: SubmitContainerProps) {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .single();
  const userDisplayName =
    profile?.name?.trim() || userEmail?.split("@")[0] || "我";

  const { data: rawAccounts } = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("profile_id", userId)
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

  let amendInitial = null as null | {
    id: string;
    accountId: string | null;
    scriptText: string;
    screenshotPaths: string[];
    lastRejection: any;
    history: any[];
  };

  if (draftId) {
    const { data: draft } = await loadDraftById(supabase, draftId);
    if (draft && draft.submitted_by === userId && draft.status === "rejected") {
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
  }

  return (
    <SubmitForm
      accounts={accounts}
      draftId={amendInitial?.id}
      initialAccountId={amendInitial?.accountId}
      initialScriptText={amendInitial?.scriptText}
      initialScreenshots={amendInitial?.screenshotPaths}
      lastRejection={amendInitial?.lastRejection ?? null}
      feedbackHistory={amendInitial?.history ?? []}
    />
  );
}
