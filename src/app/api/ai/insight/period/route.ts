import { NextRequest, NextResponse } from "next/server";

import { UUID_PATTERN } from "@/app/api/production/_shared";
import { runPeriodInsight } from "@/lib/ai/insight-period";
import { userOwnsAccount } from "@/lib/api-resource-access";
import { createClient } from "@/lib/supabase/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type PeriodInsightDeps = {
  createClient: typeof createClient;
  userOwnsAccount: typeof userOwnsAccount;
  runInsight: typeof runPeriodInsight;
};

const defaultDeps: PeriodInsightDeps = {
  createClient,
  userOwnsAccount,
  runInsight: runPeriodInsight,
};

export async function buildPeriodInsightResponse(
  request: NextRequest,
  deps: PeriodInsightDeps = defaultDeps,
) {
  const supabase = await deps.createClient();
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

  const scopeEntityId = isRecord(body) && typeof body.scope_entity_id === "string"
    ? body.scope_entity_id.trim()
    : "";
  if (!UUID_PATTERN.test(scopeEntityId)) {
    return NextResponse.json({ error: "scope_entity_id 必须是 uuid" }, { status: 400 });
  }

  const periodType = isRecord(body) && body.period_type === "month"
    ? "month"
    : isRecord(body) && body.period_type === "week"
      ? "week"
      : null;
  if (!periodType) {
    return NextResponse.json({ error: "period_type 仅支持 week 或 month" }, { status: 400 });
  }

  if (!await deps.userOwnsAccount(supabase, scopeEntityId, user.id)) {
    return NextResponse.json({ error: "账号不存在或无权限" }, { status: 403 });
  }

  try {
    const result = await deps.runInsight(supabase, { periodType, scopeEntityId });
    return NextResponse.json(result);
  } catch (error) {
    const noData = error instanceof Error && error.message.includes("无可分析数据");
    return NextResponse.json(
      { error: noData ? "该周期无可分析数据" : "周期洞察生成失败" },
      { status: noData ? 400 : 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return buildPeriodInsightResponse(request);
}
