import type { NextRequest } from "next/server";

import { loadAdminFirstScreenData, loadPendingExemptionRows } from "@/app/(app)/admin/components/admin-first-screen-loader";
import { listPendingRequestsForAdmin } from "@/lib/team-join/service";
import { createAdminClient } from "@/lib/supabase/admin";

import { parseDateParam, requireAdminServiceClient } from "../_shared";
import { buildQueueOverviewResponse } from "./handler";
import type { QueueMetricSummary } from "./handler";

function getShanghaiDayStart(date: string) {
  return `${date}T00:00:00+08:00`;
}

function getShanghaiNextDayStart(date: string) {
  const target = new Date(`${date}T00:00:00+08:00`);
  target.setUTCDate(target.getUTCDate() + 1);
  return target.toISOString().slice(0, 10) + "T00:00:00+08:00";
}

function getWeekStart(date: string) {
  const target = new Date(`${date}T00:00:00+08:00`);
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() - (day - 1));
  return target.toISOString().slice(0, 10);
}

function enumerateDateRange(start: string, endInclusive: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00+08:00`);
  const end = new Date(`${endInclusive}T00:00:00+08:00`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function loadQueueMetricSummary(date: string, visibleUserIds: string[] | null) {
  const supabase = createAdminClient();
  const dayStart = getShanghaiDayStart(date);
  const nextDayStart = getShanghaiNextDayStart(date);
  const weekStart = getWeekStart(date);
  const weekDates = enumerateDateRange(weekStart, date);

  let videoQuery = supabase
    .from("videos")
    .select("id, user_id, created_at")
    .gte("created_at", dayStart)
    .lt("created_at", nextDayStart);

  let reviewQuery = supabase
    .from("content_feedback_cards")
    .select("id, target_user_id, sent_at, viewed_at, confirmed_at")
    .gte("confirmed_at", `${weekStart}T00:00:00+08:00`);

  let caseLibraryQuery = supabase
    .from("violation_cases")
    .select("id, submitted_by")
    .eq("status", "submitted")
    .eq("is_deleted", false);

  let profilesQuery = supabase
    .from("profiles")
    .select("id, status")
    .eq("status", "active");

  let reportsQuery = supabase
    .from("daily_reports")
    .select("id, user_id, report_date")
    .in("report_date", weekDates);

  if (visibleUserIds && visibleUserIds.length > 0) {
    videoQuery = videoQuery.in("user_id", visibleUserIds);
    reviewQuery = reviewQuery.in("target_user_id", visibleUserIds);
    caseLibraryQuery = caseLibraryQuery.in("submitted_by", visibleUserIds);
    profilesQuery = profilesQuery.in("id", visibleUserIds);
    reportsQuery = reportsQuery.in("user_id", visibleUserIds);
  }

  const [videosResult, reviewsResult, caseLibraryResult, profilesResult, reportsResult] =
    await Promise.all([videoQuery, reviewQuery, caseLibraryQuery, profilesQuery, reportsQuery]);

  const videos = videosResult.data ?? [];
  const reviews = reviewsResult.data ?? [];
  const caseLibraryRows = caseLibraryResult.data ?? [];
  const activeProfiles = profilesResult.data ?? [];
  const reports = reportsResult.data ?? [];

  const activeProfileIds = new Set(activeProfiles.map((row) => row.id).filter(Boolean));
  const submittedPairs = new Set(
    reports
      .filter((row) => row.user_id && row.report_date)
      .map((row) => `${row.user_id}:${row.report_date}`),
  );
  const totalExpected = activeProfileIds.size * weekDates.length;
  const submittedCount = Array.from(submittedPairs).filter((value) => {
    const [userId] = value.split(":");
    return activeProfileIds.has(userId);
  }).length;
  const weeklySubmissionRate =
    totalExpected > 0 ? Math.round((submittedCount / totalExpected) * 100) : 0;

  return {
    newVideosToday: videos.length,
    weeklySubmissionRate,
    weeklyReviewedCount: reviews.length,
    caseLibraryPendingCount: caseLibraryRows.length,
  } satisfies QueueMetricSummary;
}


export async function GET(request: NextRequest) {
  return buildQueueOverviewResponse(request, {
    parseDateParam,
    requireAdminServiceClient,
    loadAdminFirstScreenData,
    loadPendingExemptionRows,
    listPendingRequestsForAdmin,
    loadQueueMetricSummary,
  });
}
