import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AdviceStatus } from "@/types";

type PatchRequestBody = {
  id?: string;
  status?: AdviceStatus;
  executed_video_id?: string | null;
};

const ALLOWED_STATUSES: AdviceStatus[] = ["已查看", "待执行", "已忽略", "已执行"];

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: PatchRequestBody;

  try {
    body = (await request.json()) as PatchRequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id 为必填项" }, { status: 400 });
  }

  if (!body.status || !ALLOWED_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "status 不合法" }, { status: 400 });
  }

  if (body.status === "已执行" && !body.executed_video_id) {
    return NextResponse.json({ error: "标记已执行时必须关联视频" }, { status: 400 });
  }

  const { data: currentAction, error: actionError } = await supabase
    .from("advice_actions")
    .select("id, target_user_id")
    .eq("id", body.id)
    .single();

  if (actionError) {
    return NextResponse.json({ error: actionError.message || "建议记录不存在" }, { status: 404 });
  }

  if (!currentAction || currentAction.target_user_id !== user.id) {
    return NextResponse.json({ error: "无权限修改这条建议" }, { status: 403 });
  }

  if (body.executed_video_id) {
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, user_id")
      .eq("id", body.executed_video_id)
      .single();

    if (videoError) {
      return NextResponse.json({ error: videoError.message || "关联视频不存在" }, { status: 400 });
    }

    if (!video || video.user_id !== user.id) {
      return NextResponse.json({ error: "只能关联自己的视频" }, { status: 403 });
    }
  }

  const payload = {
    status: body.status,
    executed_video_id: body.status === "已执行" ? body.executed_video_id ?? null : null,
  };

  const { data, error } = await supabase
    .from("advice_actions")
    .update(payload)
    .eq("id", body.id)
    .eq("target_user_id", user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message || "更新失败" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action: data });
}
