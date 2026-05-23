import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildContentFeedbackCardView, CONTENT_FEEDBACK_CARD_SELECT } from "@/lib/content-feedback-cards";
import type { ContentFeedbackCard, Video } from "@/types";

export async function GET() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: cards, error } = await supabase
    .from("content_feedback_cards")
    .select(CONTENT_FEEDBACK_CARD_SELECT)
    .eq("target_user_id", user.id)
    .in("card_status", ["sent", "viewed"])
    .order("sent_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message || "加载反馈卡失败" }, { status: 500 });
  }

  const cardRows = (cards ?? []) as ContentFeedbackCard[];
  const videoIds = cardRows.map((card) => card.video_id);
  const accountIds = cardRows.map((card) => card.target_account_id).filter((id): id is string => Boolean(id));

  const [{ data: videos }, { data: accounts }] = await Promise.all([
    videoIds.length > 0
      ? supabase
          .from("videos")
          .select("id, video_title, video_url, published_at, anomaly_status")
          .in("id", videoIds)
      : Promise.resolve({ data: [] as Pick<Video, "id" | "video_title" | "video_url" | "published_at" | "anomaly_status">[] }),
    accountIds.length > 0
      ? supabase.from("accounts").select("id, name").in("id", accountIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
  ]);

  const videoMap = new Map((videos ?? []).map((video) => [video.id, video]));
  const accountMap = new Map((accounts ?? []).map((account) => [account.id, account]));

  return NextResponse.json({
    items: cardRows.map((card) => ({
      video: videoMap.get(card.video_id) ?? null,
      account: card.target_account_id ? accountMap.get(card.target_account_id) ?? null : null,
      feedback_card: {
        ...buildContentFeedbackCardView(card.video_id, card),
        confirmed: card.confirmed_payload,
      },
    })),
    summary: {
      total: cardRows.length,
      unread: cardRows.filter((card) => card.card_status === "sent").length,
      viewed: cardRows.filter((card) => card.card_status === "viewed").length,
    },
  });
}
