import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type VideoSubmitRequestBody = {
  account_id?: string;
  video_url?: string | null;
  video_title?: string | null;
  content?: string | null;
  published_at?: string | null;
  anomaly_status?: string | null;
  metrics?: {
    play_count?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    favorites?: number;
    follower_gain?: number;
    follower_loss?: number;
    follower_convert?: number;
  };
};

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getTodayDateString(now: Date = new Date()) {
  return now.toISOString().split("T")[0];
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: VideoSubmitRequestBody;

  try {
    body = (await request.json()) as VideoSubmitRequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const account_id = typeof body.account_id === "string" ? body.account_id : "";

  if (!account_id) {
    return NextResponse.json({ error: "account_id 为必填项" }, { status: 400 });
  }

  const metrics = body.metrics ?? {};

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const submitter = profile?.name ?? "未知";
  const anomaly_status = normalizeOptionalText(body.anomaly_status) ?? "正常";

  const videoPayload = {
    account_id,
    user_id: user.id,
    video_url: normalizeOptionalText(body.video_url),
    video_title: normalizeOptionalText(body.video_title),
    content: normalizeOptionalText(body.content),
    published_at: normalizeOptionalDate(body.published_at),
    anomaly_status,
  };

  const { data: newVideo, error: videoError } = await supabase
    .from("videos")
    .insert(videoPayload)
    .select("*")
    .single();

  if (videoError || !newVideo) {
    return NextResponse.json({ error: videoError?.message || "视频记录创建失败" }, { status: 500 });
  }

  const snapshotPayload = {
    video_id: newVideo.id,
    snapshot_type: "24h",
    play_count: normalizeNumber(metrics.play_count),
    likes: normalizeNumber(metrics.likes),
    comments: normalizeNumber(metrics.comments),
    shares: normalizeNumber(metrics.shares),
    favorites: normalizeNumber(metrics.favorites),
    follower_gain: normalizeNumber(metrics.follower_gain),
    follower_loss: normalizeNumber(metrics.follower_loss),
    follower_convert: normalizeNumber(metrics.follower_convert),
    homepage_visits: 0,
    fan_play_ratio: null,
    cover_click_rate: null,
    avg_play_duration: null,
    completion_rate: null,
    bounce_rate_2s: null,
    completion_rate_5s: null,
    avg_play_ratio: null,
    vs_previous: null,
    screenshot_urls: null,
    curve_screenshot_url: null,
    retention_screenshot_url: null,
  };

  const { error: snapshotError } = await supabase
    .from("video_metrics_snapshots")
    .insert(snapshotPayload);

  if (snapshotError) {
    return NextResponse.json({ error: snapshotError.message }, { status: 500 });
  }

  const dailyReportPayload = {
    user_id: user.id,
    report_date: getTodayDateString(),
    title: videoPayload.video_title || "视频提交",
    submitter,
    play_count: normalizeNumber(metrics.play_count),
    likes: normalizeNumber(metrics.likes),
    comments: normalizeNumber(metrics.comments),
    shares: normalizeNumber(metrics.shares),
    favorites: normalizeNumber(metrics.favorites),
    follower_gain: normalizeNumber(metrics.follower_gain),
    follower_convert: normalizeNumber(metrics.follower_convert),
    content: videoPayload.content,
    published_at: videoPayload.published_at,
    uploaded_at: new Date().toISOString(),
    account_id,
  };

  const { error: dailyReportError } = await supabase
    .from("daily_reports")
    .insert(dailyReportPayload);

  if (dailyReportError) {
    return NextResponse.json({ error: dailyReportError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, video: newVideo });
}
