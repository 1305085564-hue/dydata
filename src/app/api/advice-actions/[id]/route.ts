import { NextRequest, NextResponse } from "next/server";

import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AdviceStatus, ReviewResult } from "@/types";

import { buildAdviceUpdatePayload } from "./更新建议";

function isReviewResult(value: unknown): value is ReviewResult {
  return value === "有效" || value === "无效" || value === "不确定";
}

function isAdviceStatus(value: unknown): value is AdviceStatus {
  return value === "待查看" || value === "已查看" || value === "待执行" || value === "已执行" || value === "已忽略" || value === "已复核";
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const permission = await getUserPermissions();

  if (!permission) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!isAdminLevel(permission.role)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "缺少建议ID" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("action" in body)) {
    return NextResponse.json({ error: "缺少 action" }, { status: 400 });
  }

  const requestBody = body as Record<string, unknown>;
  const action = requestBody.action;
  let payload: ReturnType<typeof buildAdviceUpdatePayload>;

  if (action === "assign") {
    payload = buildAdviceUpdatePayload({ action, actorUserId: permission.userId });
  } else if (action === "review") {
    if (!isReviewResult(requestBody.review_result)) {
      return NextResponse.json({ error: "缺少有效的 review_result" }, { status: 400 });
    }
    payload = buildAdviceUpdatePayload({
      action,
      actorUserId: permission.userId,
      reviewResult: requestBody.review_result,
    });
  } else if (action === "status") {
    if (!isAdviceStatus(requestBody.status)) {
      return NextResponse.json({ error: "缺少有效的 status" }, { status: 400 });
    }
    payload = buildAdviceUpdatePayload({
      action,
      actorUserId: permission.userId,
      status: requestBody.status,
    });
  } else {
    return NextResponse.json({ error: "不支持的 action" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("advice_actions")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message || "更新建议失败" }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}
