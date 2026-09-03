import { NextResponse } from "next/server";

import {
  isActiveTeamMembership,
  teamMembershipRequiredResponse,
} from "@/app/api/topics/_shared";
import {
  getPendingExemptionDatesFromRequests,
  type PendingExemptionDateLike,
  type PendingExemptionRequestLike,
} from "@/lib/豁免";
import { EXEMPTION_REASON_MAX_LENGTH, validateTextBoundary } from "@/lib/input-boundaries";

import {
  isRecord,
  isValidDate,
  readJsonBody,
  requireSignedInUser,
} from "@/app/api/production/_shared";

const EXEMPTION_TYPES = new Set(["single", "3days", "4days", "5days", "yesterday", "range", "permanent"]);

type ApplyExemptionPayload = {
  exemptionType: string;
  exemptionCategory: "waive" | "leave";
  startDate: string;
  endDate: string | null;
  reason: string;
  dates: string[];
  dateReasons: Record<string, string>;
};

type RequestSegment = {
  startDate: string;
  endDate: string | null;
  dates: string[];
};

function overlapsPendingRange(
  pendingDates: Set<string>,
  startDate: string,
  endDate: string | null,
) {
  for (const date of expandDates(startDate, endDate)) {
    if (pendingDates.has(date)) return true;
  }
  return false;
}

function expandDates(startDate: string, endDate: string | null) {
  const dates: string[] = [];
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate ?? startDate}T00:00:00.000Z`);
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += 86_400_000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}

function nextIsoDay(date: string) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * 非连续日期不能存成一个大区间：否则 [1日,5日] 会按连续区间挡住后续 3 日的申请
 * （应用层预检与数据库 daterange exclusion 约束都按 start~end 判断）。
 * 这里把日期拆成连续段，每段一条申请单，段内区间与实际申请日期一致。
 */
function splitContiguousSegments(dates: string[]): RequestSegment[] {
  const segments: RequestSegment[] = [];
  for (const date of dates) {
    const last = segments[segments.length - 1];
    if (last && nextIsoDay(last.endDate ?? last.startDate) === date) {
      last.endDate = date;
      last.dates.push(date);
    } else {
      segments.push({ startDate: date, endDate: date, dates: [date] });
    }
  }
  return segments;
}

function parseApplyExemptionPayload(input: unknown): { data: ApplyExemptionPayload } | { response: NextResponse } {
  if (!isRecord(input)) {
    return { response: NextResponse.json({ error: "请求体必须是对象" }, { status: 400 }) };
  }

  const exemptionType = typeof input.exemption_type === "string" ? input.exemption_type.trim() : "";
  const exemptionCategory = input.exemption_category === "leave" ? "leave" : input.exemption_category === "waive" || input.exemption_category == null ? "waive" : null;
  if (!exemptionCategory) return { response: NextResponse.json({ error: "exemption_category 不正确" }, { status: 400 }) };
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

  const reasonResult = validateTextBoundary({
    label: "豁免理由",
    value: input.reason,
    maxLength: EXEMPTION_REASON_MAX_LENGTH,
  });
  if (!reasonResult.ok) {
    return { response: NextResponse.json({ error: reasonResult.error }, { status: 400 }) };
  }
  const reason = reasonResult.data ?? "";
  const rawDates = Array.isArray(input.dates) ? input.dates : [];
  const dates = rawDates.length > 0
    ? Array.from(new Set(rawDates.filter((date): date is string => typeof date === "string" && isValidDate(date)))).sort()
    : expandDates(startDate, endDate);
  if (rawDates.length > 0 && dates.length !== rawDates.length) {
    return { response: NextResponse.json({ error: "dates 必须是有效日期数组" }, { status: 400 }) };
  }
  if (!reason && exemptionCategory === "leave") {
    return { response: NextResponse.json({ error: "reason 不能为空" }, { status: 400 }) };
  }

  const dateReasons: Record<string, string> = {};
  if (isRecord(input.date_reasons)) {
    for (const [date, value] of Object.entries(input.date_reasons)) {
      if (!dates.includes(date)) continue;
      const dateReason = validateTextBoundary({
        label: "逐日豁免原因",
        value,
        maxLength: EXEMPTION_REASON_MAX_LENGTH,
      });
      if (!dateReason.ok) {
        return { response: NextResponse.json({ error: dateReason.error }, { status: 400 }) };
      }
      if (dateReason.data) dateReasons[date] = dateReason.data;
    }
  }
  if (exemptionCategory === "waive" && rawDates.length > 0 && dates.length > 1 && dates.some((date) => !dateReasons[date])) {
    return { response: NextResponse.json({ error: "特殊豁免必须为每天填写申请原因" }, { status: 400 }) };
  }
  return { data: { exemptionType, exemptionCategory, startDate: dates[0]!, endDate: dates.length > 1 ? dates[dates.length - 1]! : null, reason: reason || dateReasons[dates[0]!] || "", dates, dateReasons } };
}

export async function buildApplyExemptionResponse(
  request: Request,
  deps: { requireSignedInUser: typeof requireSignedInUser } = { requireSignedInUser },
) {
  const auth = await deps.requireSignedInUser();
  if ("response" in auth) return auth.response;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id, team_id, membership_status")
    .eq("id", auth.user.id)
    .single();

  if (profileError || !profile) {
    if (profileError) console.error("[exemptions] failed to load applicant profile", profileError);
    return NextResponse.json({ error: "用户信息不存在" }, { status: 403 });
  }

  if (!isActiveTeamMembership(profile)) {
    return teamMembershipRequiredResponse();
  }

  const body = await readJsonBody(request);
  if ("response" in body) return body.response;

  const payload = parseApplyExemptionPayload(body.data);
  if ("response" in payload) return payload.response;

  // 永久豁免保持单条整段申请；其余按连续日期段拆分，避免幻影区间挡住未申请的日期。
  const segments: RequestSegment[] = payload.data.exemptionType === "permanent"
    ? [{ startDate: payload.data.startDate, endDate: null, dates: [payload.data.startDate] }]
    : splitContiguousSegments(payload.data.dates);

  // 与数据库 exclusion constraint 对齐：只拦同一申请人、同一分类的 pending 日期交集。
  // 跨标签页或跨实例的并发写入仍由数据库返回明确的 409 兜底。
  const { data: pendingRows, error: duplicateError } = await auth.supabase
    .from("exemption_request")
    .select("id, start_date, end_date")
    .eq("applicant_user_id", auth.user.id)
    .eq("request_status", "pending")
    .eq("exemption_category", payload.data.exemptionCategory)
    .limit(500);

  if (duplicateError) {
    console.error("[exemptions] failed to check duplicate request", duplicateError);
    return NextResponse.json({ error: "提交前校验失败，请稍后重试" }, { status: 500 });
  }

  const typedPendingRows = (pendingRows ?? []) as PendingExemptionRequestLike[];
  const requestIds = typedPendingRows.map((row) => row.id).filter((id): id is string => Boolean(id));
  const { data: pendingDateRows, error: pendingDateError } = requestIds.length > 0
    ? await auth.supabase
        .from("exemption_request_date")
        .select("request_id, request_date, status")
        .in("request_id", requestIds)
    : { data: [], error: null };

  if (pendingDateError) {
    console.error("[exemptions] failed to check duplicate request dates", pendingDateError);
    return NextResponse.json({ error: "提交前校验失败，请稍后重试" }, { status: 500 });
  }

  const pendingDates = new Set(getPendingExemptionDatesFromRequests(
    typedPendingRows,
    (pendingDateRows ?? []) as PendingExemptionDateLike[],
  ));
  const hasOverlap = segments.some((segment) =>
    overlapsPendingRange(pendingDates, segment.startDate, segment.endDate),
  );
  if (hasOverlap) {
    return NextResponse.json({ error: "已有重叠的待处理申请，请勿重复提交" }, { status: 409 });
  }

  const created: Array<Record<string, unknown> & { id: string }> = [];
  const cleanupCreated = async () => {
    for (const row of created) {
      const { error } = await auth.supabase
        .from("exemption_request")
        .delete()
        .eq("id", row.id)
        .eq("request_status", "pending");
      if (error) console.error("[exemptions] failed to cleanup orphan request", row.id, error);
    }
  };

  const dateRows: Array<{ request_id: string; request_date: string; reason: string | null }> = [];
  for (const segment of segments) {
    const { data, error } = await auth.supabase
      .from("exemption_request")
      .insert({
        applicant_user_id: auth.user.id,
        team_id: profile.team_id,
        exemption_type: payload.data.exemptionType,
        exemption_category: payload.data.exemptionCategory,
        start_date: segment.startDate,
        end_date: segment.endDate,
        reason: payload.data.reason,
      })
      .select("id, applicant_user_id, team_id, exemption_type, exemption_category, start_date, end_date, reason, request_status, created_at")
      .single();

    if (error) {
      console.error("[exemptions] failed to create request", error);
      await cleanupCreated();
      const code = (error as { code?: string }).code;
      if (code === "23P01" || code === "23505") {
        return NextResponse.json({ error: "已有重叠的待处理申请，请勿重复提交" }, { status: 409 });
      }
      return NextResponse.json({ error: "提交豁免申请失败" }, { status: 500 });
    }

    const createdRow = data as Record<string, unknown> & { id: string };
    created.push(createdRow);
    for (const requestDate of segment.dates) {
      dateRows.push({
        request_id: createdRow.id,
        request_date: requestDate,
        reason: payload.data.dateReasons[requestDate] ?? (payload.data.reason || null),
      });
    }
  }

  const { error: dateError } = await auth.supabase.from("exemption_request_date").insert(dateRows);
  if (dateError) {
    console.error("[exemptions] failed to create request dates", dateError);
    await cleanupCreated();
    return NextResponse.json({ error: "保存申请日期失败" }, { status: 500 });
  }

  return NextResponse.json({ data: created }, { status: 201 });
}

export async function POST(request: Request) {
  return buildApplyExemptionResponse(request);
}
