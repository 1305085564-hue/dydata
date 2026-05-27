import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireScopedAdminVideo, type ScopedAdminVideoAccess } from "@/lib/admin-scoped-video";
import {
  buildConfirmedFeedbackPayload,
  buildManualConfirmedPayload,
  buildContentFeedbackCardDetail,
  CONTENT_FEEDBACK_CARD_SELECT,
} from "@/lib/content-feedback-cards";
import type { ContentFeedbackCard } from "@/types";

type ConfirmBody = {
  action?: "confirm" | "send" | "create_and_confirm";
  manager_note?: string | null;
  summary?: {
    grade?: string;
    one_line?: string;
    problem_tags?: string[];
  };
  actions?: {
    diagnosis?: string;
    instructions?: string[];
    message_for_member?: string;
  };
};

function trimmed(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizedStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

async function loadFeedbackCard(supabase: Pick<SupabaseClient, "from">, videoId: string) {
  const { data } = await supabase
    .from("content_feedback_cards")
    .select(CONTENT_FEEDBACK_CARD_SELECT)
    .eq("video_id", videoId)
    .maybeSingle();

  return (data as ContentFeedbackCard | null) ?? null;
}

function buildVideoMeta(access: ScopedAdminVideoAccess) {
  return {
    id: access.video.id,
    account_id: access.video.account_id,
    user_id: access.video.user_id,
    video_title: access.video.video_title,
    video_url: access.video.video_url,
    published_at: access.video.published_at,
    account_name: access.video.accounts?.name ?? null,
    owner_name: access.video.profiles?.name ?? null,
  };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const feedbackCard = await loadFeedbackCard(access.supabase, videoId);

  return NextResponse.json({
    video: buildVideoMeta(access),
    feedback_card: buildContentFeedbackCardDetail(videoId, feedbackCard),
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: ConfirmBody;
  try {
    body = (await request.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "confirm" && action !== "send" && action !== "create_and_confirm") {
    return NextResponse.json({ error: "action 只能是 confirm / send / create_and_confirm" }, { status: 400 });
  }

  const currentCard = await loadFeedbackCard(access.supabase, videoId);

  if (action === "create_and_confirm") {
    const confirmedPayload = buildManualConfirmedPayload({
      summary: {
        one_line: trimmed(body.summary?.one_line) ?? "",
        problem_tags: normalizedStringArray(body.summary?.problem_tags) ?? [],
      },
      actions: {
        instructions: normalizedStringArray(body.actions?.instructions) ?? [],
        message_for_member: trimmed(body.actions?.message_for_member) ?? "",
      },
    });

    if (currentCard) {
      const { data, error } = await access.supabase
        .from("content_feedback_cards")
        .update({
          card_status: "confirmed",
          manager_note: typeof body.manager_note === "string" ? body.manager_note.trim() || null : currentCard.manager_note,
          confirmed_payload: confirmedPayload,
          confirmed_by: access.actor.userId,
          confirmed_at: new Date().toISOString(),
          sent_by: null,
          sent_at: null,
          viewed_at: null,
        })
        .eq("id", currentCard.id)
        .select(CONTENT_FEEDBACK_CARD_SELECT)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: error?.message || "保存反馈卡失败" }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        video: buildVideoMeta(access),
        feedback_card: buildContentFeedbackCardDetail(videoId, data as ContentFeedbackCard),
      });
    }

    const { data, error } = await access.supabase
      .from("content_feedback_cards")
      .insert({
        video_id: videoId,
        target_user_id: access.video.user_id,
        target_account_id: access.video.account_id,
        card_status: "confirmed",
        manager_note: typeof body.manager_note === "string" ? body.manager_note.trim() || null : null,
        confirmed_payload: confirmedPayload,
        confirmed_by: access.actor.userId,
        confirmed_at: new Date().toISOString(),
      })
      .select(CONTENT_FEEDBACK_CARD_SELECT)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "创建反馈卡失败" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      video: buildVideoMeta(access),
      feedback_card: buildContentFeedbackCardDetail(videoId, data as ContentFeedbackCard),
    });
  }

  if (!currentCard) {
    return NextResponse.json({ error: "请先生成 AI 初稿或手动创建反馈卡" }, { status: 404 });
  }

  if (action === "confirm") {
    if (!currentCard.draft_payload) {
      return NextResponse.json({ error: "缺少 AI 初稿，不能确认" }, { status: 409 });
    }

    const confirmedPayload = buildConfirmedFeedbackPayload(currentCard.draft_payload, {
      summary: {
        grade: trimmed(body.summary?.grade),
        one_line: trimmed(body.summary?.one_line),
        problem_tags: normalizedStringArray(body.summary?.problem_tags),
      },
      actions: {
        diagnosis: trimmed(body.actions?.diagnosis),
        instructions: normalizedStringArray(body.actions?.instructions),
        message_for_member: trimmed(body.actions?.message_for_member),
      },
    });

    const { data, error } = await access.supabase
      .from("content_feedback_cards")
      .update({
        card_status: "confirmed",
        manager_note: typeof body.manager_note === "string" ? body.manager_note.trim() || null : currentCard.manager_note,
        confirmed_payload: confirmedPayload,
        confirmed_by: access.actor.userId,
        confirmed_at: new Date().toISOString(),
        sent_by: null,
        sent_at: null,
        viewed_at: null,
      })
      .eq("id", currentCard.id)
      .select(CONTENT_FEEDBACK_CARD_SELECT)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "确认反馈卡失败" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      video: buildVideoMeta(access),
      feedback_card: buildContentFeedbackCardDetail(videoId, data as ContentFeedbackCard),
    });
  }

  if (currentCard.card_status !== "confirmed" || !currentCard.confirmed_payload) {
    return NextResponse.json({ error: "请先人工确认，再下发给员工" }, { status: 409 });
  }

  const { data, error } = await access.supabase
    .from("content_feedback_cards")
    .update({
      card_status: "sent",
      sent_by: access.actor.userId,
      sent_at: new Date().toISOString(),
    })
    .eq("id", currentCard.id)
    .select(CONTENT_FEEDBACK_CARD_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "下发反馈卡失败" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    video: buildVideoMeta(access),
    feedback_card: buildContentFeedbackCardDetail(videoId, data as ContentFeedbackCard),
  });
}
