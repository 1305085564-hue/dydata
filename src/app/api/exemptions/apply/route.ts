import { NextResponse } from "next/server";

import {
  isRecord,
  isValidDate,
  readJsonBody,
  requireSignedInUser,
  toTrimmedString,
} from "@/app/api/production/_shared";

const EXEMPTION_TYPES = new Set(["single", "3days", "4days", "5days", "yesterday", "range", "permanent"]);

type ApplyExemptionPayload = {
  exemptionType: string;
  startDate: string;
  endDate: string | null;
  reason: string;
};

function parseApplyExemptionPayload(input: unknown): { data: ApplyExemptionPayload } | { response: NextResponse } {
  if (!isRecord(input)) {
    return { response: NextResponse.json({ error: "请求体必须是对象" }, { status: 400 }) };
  }

  const exemptionType = typeof input.exemption_type === "string" ? input.exemption_type.trim() : "";
  if (!EXEMPTION_TYPES.has(exemptionType)) {
    return { response: NextResponse.json({ error: "exemption_type 不正确" }, { status: 400 }) };
  }

  const startDate = typeof input.start_date === "string" ? input.start_date.trim() : "";
  if (!isValidDate(startDate)) {
    return { response: NextResponse.json({ error: "start_date 必须是 YYYY-MM-DD" }, { status: 400 }) };
  }

  const endDate = input.end_date == null || input.end_date === "" ? null : String(input.end_date).trim();
  if (endDate && !isValidDate(endDate)) {
    return { response: NextResponse.json({ error: "end_date 必须是 YYYY-MM-DD" }, { status: 400 }) };
  }

  if (endDate && endDate < startDate) {
    return { response: NextResponse.json({ error: "end_date 不能早于 start_date" }, { status: 400 }) };
  }

  const reason = toTrimmedString(input.reason, 2_000);
  if (!reason) {
    return { response: NextResponse.json({ error: "reason 不能为空" }, { status: 400 }) };
  }

  return { data: { exemptionType, startDate, endDate, reason } };
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;

  const payload = parseApplyExemptionPayload(body.data);
  if ("response" in payload) return payload.response;

  const auth = await requireSignedInUser();
  if ("response" in auth) return auth.response;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id, team_id")
    .eq("id", auth.user.id)
    .single();

  if (profileError || !profile) {
    if (profileError) console.error("[exemptions] failed to load applicant profile", profileError);
    return NextResponse.json({ error: "用户信息不存在" }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("exemption_request")
    .insert({
      applicant_user_id: auth.user.id,
      team_id: profile.team_id,
      exemption_type: payload.data.exemptionType,
      start_date: payload.data.startDate,
      end_date: payload.data.endDate,
      reason: payload.data.reason,
      request_status: "pending",
      exemption_category: "waive",
    })
    .select("id, applicant_user_id, team_id, exemption_type, start_date, end_date, reason, request_status, created_at")
    .single();

  if (error) {
    console.error("[exemptions] failed to create request", error);
    return NextResponse.json({ error: "提交豁免申请失败" }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
