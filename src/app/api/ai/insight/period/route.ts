import { NextRequest, NextResponse } from "next/server";

import { runPeriodInsight } from "@/lib/ai/insight-period";
import { createClient } from "@/lib/supabase/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!isRecord(body) || !isNonEmptyString(body.scope_entity_id)) {
    return NextResponse.json({ error: "缺少 scope_entity_id" }, { status: 400 });
  }

  const periodType = body.period_type === "month" ? "month" : body.period_type === "week" ? "week" : null;
  if (!periodType) {
    return NextResponse.json({ error: "period_type 仅支持 week 或 month" }, { status: 400 });
  }

  try {
    const result = await runPeriodInsight(supabase, {
      periodType,
      scopeEntityId: body.scope_entity_id.trim(),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "周期洞察生成失败";
    const status = message.includes("无可分析数据") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
