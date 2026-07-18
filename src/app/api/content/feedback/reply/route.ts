import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildContentFeedbackCardDetail } from "@/lib/content-feedback-cards";
import { submitFeedbackReply } from "@/lib/content-feedback-replies";
import type { ContentFeedbackCard, ContentFeedbackReplyStatus } from "@/types";

type ReplyBody = {
  cardId?: unknown;
  feedback_card_id?: unknown;
  replyStatus?: unknown;
  reply_status?: unknown;
  replyText?: unknown;
  employee_reply_text?: unknown;
};

type FeedbackReplyDeps = {
  requireAuthenticatedFeedbackUser: () => Promise<
    | { error: "未登录"; status: 401 }
    | { userId: string }
  >;
  submitFeedbackReply: (params: {
    cardId: string;
    actorUserId: string;
    replyStatus: ContentFeedbackReplyStatus;
    replyText: string;
  }) => Promise<ContentFeedbackCard>;
};

function readTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isReplyStatus(value: string | null): value is Exclude<ContentFeedbackReplyStatus, "pending"> {
  return value === "acknowledged" || value === "disputed";
}

const defaultDeps: FeedbackReplyDeps = {
  async requireAuthenticatedFeedbackUser() {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return { error: "未登录" as const, status: 401 as const };
    }

    return { userId: user.id };
  },
  async submitFeedbackReply({ cardId, actorUserId, replyStatus, replyText }) {
    return submitFeedbackReply({
      supabase: createAdminClient(),
      cardId,
      actorUserId,
      replyStatus,
      replyText,
    });
  },
};

export async function buildContentFeedbackReplyResponse(
  body: ReplyBody,
  deps: FeedbackReplyDeps = defaultDeps,
) {
  const cardId = readTrimmedString(body.cardId ?? body.feedback_card_id);
  if (!cardId) {
    return NextResponse.json({ error: "缺少 cardId" }, { status: 400 });
  }

  const replyStatus = readTrimmedString(body.replyStatus ?? body.reply_status);
  if (!isReplyStatus(replyStatus)) {
    return NextResponse.json({ error: "replyStatus 只能是 acknowledged 或 disputed" }, { status: 400 });
  }

  const replyText = readTrimmedString(body.replyText ?? body.employee_reply_text);
  if (!replyText) {
    return NextResponse.json({ error: "缺少 replyText" }, { status: 400 });
  }

  const auth = await deps.requireAuthenticatedFeedbackUser();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const card = await deps.submitFeedbackReply({
      cardId,
      actorUserId: auth.userId,
      replyStatus,
      replyText,
    });

    return NextResponse.json({
      ok: true,
      feedback_card: {
        ...buildContentFeedbackCardDetail(card.video_id, card),
        confirmed: card.confirmed_payload,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "提交员工复盘失败";
    const status = /未登录/.test(message) ? 401
      : /无权限/.test(message) ? 403
        : /不存在/.test(message) ? 404
          : /未下发/.test(message) ? 409
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  let body: ReplyBody;
  try {
    body = (await request.json()) as ReplyBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  return buildContentFeedbackReplyResponse(body);
}
