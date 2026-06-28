import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type SubmitFulfillmentAppealPayload = {
  recordDate: string;
  reason: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseSubmitFulfillmentAppealPayload(
  input: unknown,
): { data: SubmitFulfillmentAppealPayload } | { response: NextResponse } {
  if (!isRecord(input)) {
    return { response: NextResponse.json({ error: "请求体必须是对象" }, { status: 400 }) };
  }

  const recordDate = typeof input.recordDate === "string" ? input.recordDate.trim() : "";
  if (!isValidDate(recordDate)) {
    return { response: NextResponse.json({ error: "recordDate 必须是 YYYY-MM-DD" }, { status: 400 }) };
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) {
    return { response: NextResponse.json({ error: "reason 不能为空" }, { status: 400 }) };
  }

  if (reason.length > 2000) {
    return { response: NextResponse.json({ error: "reason 最多 2000 个字符" }, { status: 400 }) };
  }

  return { data: { recordDate, reason } };
}

type SubmitAppealDeps = {
  createClient: typeof createClient;
};

export async function buildSubmitFulfillmentAppealResponse(
  request: Request,
  deps: SubmitAppealDeps = { createClient },
) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const payload = parseSubmitFulfillmentAppealPayload(rawBody);
  if ("response" in payload) return payload.response;

  const supabase = await deps.createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const result = await supabase
    .from("fulfillment_appeals")
    .insert({
      user_id: user.id,
      record_date: payload.data.recordDate,
      reason: payload.data.reason,
      status: "pending",
    })
    .select("id, user_id, record_date, status, created_at")
    .single();

  if (result.error) {
    const message = result.error.message ?? "";
    if (message.includes("idx_fulfillment_appeals_pending_unique")) {
      return NextResponse.json({ error: "该日期已经有待处理申诉" }, { status: 409 });
    }

    return NextResponse.json({ error: message || "提交履约申诉失败" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    appeal: result.data,
  });
}

export async function POST(request: Request) {
  return buildSubmitFulfillmentAppealResponse(request);
}
