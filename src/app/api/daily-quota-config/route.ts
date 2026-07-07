import { NextRequest, NextResponse } from "next/server";

import {
  getShanghaiDate,
  isRecord,
  isValidDate,
  parseLimit,
  readJsonBody,
  requireOwnerOrAdminActor,
  requireSignedInUser,
  toTrimmedString,
} from "@/app/api/production/_shared";

type DailyQuotaPayload = {
  effectiveDate: string;
  dailyTarget: number;
  note: string | null;
};

function parseDailyQuotaPayload(input: unknown): { data: DailyQuotaPayload } | { response: NextResponse } {
  if (!isRecord(input)) {
    return { response: NextResponse.json({ error: "请求体必须是对象" }, { status: 400 }) };
  }

  const effectiveDate = typeof input.effective_date === "string" ? input.effective_date.trim() : "";
  if (!isValidDate(effectiveDate)) {
    return { response: NextResponse.json({ error: "effective_date 必须是 YYYY-MM-DD" }, { status: 400 }) };
  }

  const dailyTarget = Number(input.daily_target);
  if (!Number.isInteger(dailyTarget) || dailyTarget < 1 || dailyTarget > 50) {
    return { response: NextResponse.json({ error: "daily_target 必须是 1-50 的整数" }, { status: 400 }) };
  }

  const note = typeof input.note === "string" ? toTrimmedString(input.note, 1_000) : null;
  return { data: { effectiveDate, dailyTarget, note } };
}

export async function GET(request: NextRequest) {
  const auth = await requireSignedInUser();
  if ("response" in auth) return auth.response;

  const date = request.nextUrl.searchParams.get("date")?.trim() || getShanghaiDate();
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "date 必须是 YYYY-MM-DD" }, { status: 400 });
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), 20, 100);
  const quotaResult = await auth.supabase.rpc("get_daily_quota", { p_date: date });
  if (quotaResult.error) {
    return NextResponse.json({ error: quotaResult.error.message || "读取当前目标失败" }, { status: 500 });
  }

  const { data, error } = await auth.supabase
    .from("daily_quota_config")
    .select("id, effective_date, daily_target, created_by, note, created_at")
    .order("effective_date", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message || "读取目标配置失败" }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      date,
      current_daily_target: quotaResult.data ?? 4,
      rules: data ?? [],
    },
  });
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;

  const payload = parseDailyQuotaPayload(body.data);
  if ("response" in payload) return payload.response;

  const auth = await requireOwnerOrAdminActor();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.supabase
    .from("daily_quota_config")
    .insert({
      effective_date: payload.data.effectiveDate,
      daily_target: payload.data.dailyTarget,
      created_by: auth.actor.userId,
      note: payload.data.note,
    })
    .select("id, effective_date, daily_target, created_by, note, created_at")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message = error.code === "23505" ? "该生效日期已存在目标规则" : error.message || "新增目标配置失败";
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ data }, { status: 201 });
}
