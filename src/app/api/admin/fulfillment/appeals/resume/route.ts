import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST as submitVideo } from "@/app/api/video-submit/route";

/**
 * Resume the exact submission that was blocked by the late-submission gate.
 * This is called from the member's approval notification, so the member's
 * session is forwarded to the normal video-submit route and all existing
 * ownership/validation/persistence checks still apply.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { appealId?: unknown };
  try {
    body = (await request.json()) as { appealId?: unknown };
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const appealId = typeof body.appealId === "string" ? body.appealId.trim() : "";
  if (!appealId) return NextResponse.json({ error: "缺少补交申请编号" }, { status: 400 });

  const admin = createAdminClient();
  const { data: appeal, error: appealError } = await admin
    .from("fulfillment_appeals")
    .select("id, user_id, status, submission_payload")
    .eq("id", appealId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (appealError) return NextResponse.json({ error: "读取补交申请失败" }, { status: 500 });
  if (!appeal) return NextResponse.json({ error: "补交申请不存在" }, { status: 404 });
  if (appeal.status !== "approved") return NextResponse.json({ error: "补交申请尚未通过" }, { status: 409 });
  if (!appeal.submission_payload || typeof appeal.submission_payload !== "object") {
    return NextResponse.json({ error: "没有找到待续交的数据，请回到填报页重新提交" }, { status: 409 });
  }

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("content-type", "application/json");
  const submitRequest = new NextRequest(request.url, {
    method: "POST",
    headers: forwardedHeaders,
    body: JSON.stringify(appeal.submission_payload),
  });
  const response = await submitVideo(submitRequest);
  if (!response.ok) return response;

  const { error: clearError } = await admin
    .from("fulfillment_appeals")
    .update({ submission_payload: null })
    .eq("id", appealId)
    .eq("user_id", user.id)
    .eq("status", "approved");
  if (clearError) {
    return NextResponse.json({ error: "数据已提交，但补交申请收尾失败，请联系管理员" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, resumed: true });
}
