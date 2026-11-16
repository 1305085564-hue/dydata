import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function readQuery(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId")?.trim() ?? "";
  const recordDate = request.nextUrl.searchParams.get("recordDate")?.trim() ?? "";
  return { accountId, recordDate };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { accountId, recordDate } = readQuery(request);
  if (!accountId || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
    return NextResponse.json({ error: "账号和业务日期格式不正确" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: appeal, error } = await admin
    .from("fulfillment_appeals")
    .select("id, record_date, reason, status, decision_reason, submission_payload, created_at, handled_at")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .eq("record_date", recordDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "读取补交审批状态失败" }, { status: 500 });
  if (!appeal) return NextResponse.json({ appeal: null });

  let resumeError: string | null = null;
  if (appeal.status === "approved" && appeal.submission_payload) {
    const notification = await admin
      .from("notifications")
      .select("body")
      .eq("user_id", user.id)
      .eq("source_type", "fulfillment_appeal_result")
      .eq("source_id", appeal.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const body = notification.data?.body ?? "";
    const marker = "数据写入未成功：";
    const markerIndex = body.indexOf(marker);
    resumeError = markerIndex >= 0 ? body.slice(markerIndex + marker.length).split("。请")[0] : "自动提交未完成，请点击重试";
  }

  return NextResponse.json({
    appeal: {
      id: appeal.id,
      recordDate: appeal.record_date,
      reason: appeal.reason,
      status: appeal.status,
      decisionReason: appeal.decision_reason ?? null,
      resumePending: appeal.status === "approved" && Boolean(appeal.submission_payload),
      resumeError,
      createdAt: appeal.created_at,
      handledAt: appeal.handled_at,
    },
  });
}
