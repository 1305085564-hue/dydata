import { NextResponse } from "next/server";

import {
  UUID_PATTERN,
  isRecord,
  readJsonBody,
  requireOwnerOrAdminActor,
  requireVisibleProductionUser,
} from "@/app/api/production/_shared";

type ReviewExemptionPayload = {
  requestId: string;
  action: "approved" | "rejected";
};

function parseReviewExemptionPayload(input: unknown): { data: ReviewExemptionPayload } | { response: NextResponse } {
  if (!isRecord(input)) {
    return { response: NextResponse.json({ error: "请求体必须是对象" }, { status: 400 }) };
  }

  const requestId = typeof input.request_id === "string" ? input.request_id.trim() : "";
  if (!UUID_PATTERN.test(requestId)) {
    return { response: NextResponse.json({ error: "request_id 必须是 uuid" }, { status: 400 }) };
  }

  const action = typeof input.action === "string" ? input.action.trim() : "";
  if (action !== "approved" && action !== "rejected") {
    return { response: NextResponse.json({ error: "action 必须是 approved 或 rejected" }, { status: 400 }) };
  }

  return { data: { requestId, action } };
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;

  const payload = parseReviewExemptionPayload(body.data);
  if ("response" in payload) return payload.response;

  const auth = await requireOwnerOrAdminActor();
  if ("response" in auth) return auth.response;

  const { data: requestRow, error: loadError } = await auth.supabase
    .from("exemption_request")
    .select("id, applicant_user_id, team_id, exemption_type, start_date, end_date, request_status, exemption_category")
    .eq("id", payload.data.requestId)
    .single();

  if (loadError || !requestRow) {
    return NextResponse.json({ error: "豁免申请不存在" }, { status: 404 });
  }

  const forbidden = requireVisibleProductionUser(auth, requestRow.applicant_user_id);
  if (forbidden) return forbidden;

  const { data, error } = await auth.supabase
    .from("exemption_request")
    .update({
      request_status: payload.data.action,
      reviewed_by: auth.actor.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", payload.data.requestId)
    .select("id, applicant_user_id, team_id, exemption_type, start_date, end_date, request_status, reviewed_by, reviewed_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message || "审核豁免申请失败" }, { status: 500 });
  }

  let grant = null;
  if (payload.data.action === "approved") {
    const grantResult = await auth.supabase
      .from("exemption_grant")
      .insert({
        request_id: requestRow.id,
        user_id: requestRow.applicant_user_id,
        team_id: requestRow.team_id,
        start_date: requestRow.start_date,
        end_date: requestRow.end_date,
        grant_type: requestRow.exemption_type,
        status: "active",
        exemption_category: requestRow.exemption_category ?? "waive",
      })
      .select("id, request_id, user_id, team_id, start_date, end_date, grant_type, status, created_at")
      .single();

    if (grantResult.error) {
      return NextResponse.json({ error: grantResult.error.message || "写入豁免授予失败" }, { status: 500 });
    }

    grant = grantResult.data;
  }

  return NextResponse.json({ data, grant });
}
