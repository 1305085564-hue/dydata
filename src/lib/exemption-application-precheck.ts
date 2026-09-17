import type { SupabaseClient } from "@supabase/supabase-js";

import { shiftDateOnly } from "@/lib/loaders/shared";
import {
  getPendingExemptionDatesFromRequests,
  type PendingExemptionDateLike,
  type PendingExemptionRequestLike,
} from "@/lib/豁免";
import type { ExemptionCategory } from "@/types";

type RequestRange = { start_date: string; end_date: string | null };

export async function checkPendingExemptionOverlap(
  client: Pick<SupabaseClient, "from">,
  input: {
    applicantUserId: string;
    category: ExemptionCategory;
    ranges: RequestRange[];
  },
): Promise<
  | { ok: true; overlappingDates: string[] }
  | { ok: false; stage: "requests" | "dates"; error: unknown }
> {
  const { data: pendingRows, error: requestError } = await client
    .from("exemption_request")
    .select("id, start_date, end_date")
    .eq("applicant_user_id", input.applicantUserId)
    .eq("request_status", "pending")
    .eq("exemption_category", input.category)
    .limit(500);

  if (requestError) return { ok: false, stage: "requests", error: requestError };

  const requests = (pendingRows ?? []) as PendingExemptionRequestLike[];
  const requestIds = requests.map((row) => row.id).filter((id): id is string => Boolean(id));
  const { data: pendingDateRows, error: dateError } = requestIds.length > 0
    ? await client
        .from("exemption_request_date")
        .select("request_id, request_date, status")
        .in("request_id", requestIds)
    : { data: [] as PendingExemptionDateLike[], error: null };

  if (dateError) return { ok: false, stage: "dates", error: dateError };

  const pendingDates = new Set(getPendingExemptionDatesFromRequests(
    requests,
    (pendingDateRows ?? []) as PendingExemptionDateLike[],
  ));
  const overlapping = new Set<string>();
  for (const range of input.ranges) {
    const end = range.end_date ?? range.start_date;
    for (
      let date = range.start_date;
      date <= end;
      date = shiftDateOnly(new Date(`${date}T00:00:00+08:00`), 1)
    ) {
      if (pendingDates.has(date)) overlapping.add(date);
    }
  }
  return { ok: true, overlappingDates: Array.from(overlapping).sort() };
}
