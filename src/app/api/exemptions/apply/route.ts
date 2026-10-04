import { NextResponse } from "next/server";

import {
  isActiveTeamMembership,
  teamMembershipRequiredResponse,
} from "@/app/api/topics/_shared";
import { checkPendingExemptionOverlap } from "@/lib/exemption-application-precheck";
import { writePendingExemptionRequests } from "@/lib/exemption-application-write";
import { EXEMPTION_REASON_MAX_LENGTH, validateTextBoundary } from "@/lib/input-boundaries";
import type { MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

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

export const defaultApplyExemptionDeps: { requireSignedInUser: typeof requireSignedInUser } = {
  requireSignedInUser,
};

export async function buildApplyExemptionResponse(
  request: Request,
  deps: { requireSignedInUser: typeof requireSignedInUser } = defaultApplyExemptionDeps,
  observation?: MutationObservation,
): Promise<NextResponse> {
  observation?.mark("auth");
  const auth = await deps.requireSignedInUser();
  if ("response" in auth) {
    return auth.response ?? NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  observation?.mark("read");
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

  observation?.mark("validate");
  const body = await readJsonBody(request);
  if ("response" in body) {
    return body.response ?? NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const payload = parseApplyExemptionPayload(body.data);
  if ("response" in payload) return payload.response;

  // 永久豁免保持单条整段申请；其余按连续日期段拆分，避免幻影区间挡住未申请的日期。
  const segments: RequestSegment[] = payload.data.exemptionType === "permanent"
    ? [{ startDate: payload.data.startDate, endDate: null, dates: [payload.data.startDate] }]
    : splitContiguousSegments(payload.data.dates);

  // 与数据库 exclusion constraint 对齐：只拦同一申请人、同一分类的 pending 日期交集。
  // 跨标签页或跨实例的并发写入仍由数据库返回明确的 409 兜底。
  const precheck = await checkPendingExemptionOverlap(auth.supabase, {
    applicantUserId: auth.user.id,
    category: payload.data.exemptionCategory,
    ranges: segments.map(({ startDate, endDate }) => ({ start_date: startDate, end_date: endDate })),
  });
  if (!precheck.ok) {
    console.error(
      precheck.stage === "requests"
        ? "[exemptions] failed to check duplicate request"
        : "[exemptions] failed to check duplicate request dates",
      precheck.error,
    );
    return NextResponse.json({ error: "提交前校验失败，请稍后重试" }, { status: 500 });
  }

  if (precheck.overlappingDates.length > 0) {
    return NextResponse.json({ error: "已有重叠的待处理申请，请勿重复提交" }, { status: 409 });
  }

  const drafts = segments.map((segment) => ({
    applicant_user_id: auth.user.id,
    team_id: profile.team_id,
    exemption_type: payload.data.exemptionType,
    exemption_category: payload.data.exemptionCategory,
    start_date: segment.startDate,
    end_date: segment.endDate,
    reason: payload.data.reason,
  }));
  const writeResult = await writePendingExemptionRequests(auth.supabase, drafts, {
    mark: (stage) => {
      observation?.mark(stage === "requests" ? "write-request" : stage === "dates" ? "write-dates" : "compensate");
    },
    dateRowsForDraft: (draft, created) => {
      const segment = segments.find(
        (candidate) => candidate.startDate === draft.start_date && candidate.endDate === draft.end_date,
      );
      return (segment?.dates ?? []).map((requestDate) => ({
        request_id: created.id,
        request_date: requestDate,
        reason: payload.data.dateReasons[requestDate] ?? (payload.data.reason || null),
      }));
    },
  });
  if (!writeResult.ok) {
    console.error(
      writeResult.stage === "dates"
        ? "[exemptions] failed to create request dates"
        : "[exemptions] failed to create request",
      writeResult.error,
    );
    const code = (writeResult.error as { code?: string }).code;
    if (writeResult.stage === "requests" && (code === "23P01" || code === "23505")) {
      return NextResponse.json({ error: "已有重叠的待处理申请，请勿重复提交" }, { status: 409 });
    }
    return NextResponse.json(
      { error: writeResult.stage === "dates" ? "保存申请日期失败" : "提交豁免申请失败" },
      { status: 500 },
    );
  }

  observation?.mark("finalize");
  return NextResponse.json({ data: writeResult.data }, { status: 201 });
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/exemptions/apply", request, async (observation) =>
    appendObservedMutationResult(
      await buildApplyExemptionResponse(request, defaultApplyExemptionDeps, observation),
      observation,
    ),
  );
}
