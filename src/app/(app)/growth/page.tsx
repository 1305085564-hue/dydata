import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { MetricsAccount, MetricsReport } from "@/lib/metrics";
import {
  buildAdviceSections,
  buildGrowthDimensionCards,
  buildPkComparisonData,
  buildScriptBreakdownData,
  buildStatusCards,
  buildWeakBenchmarkCards,
  getWeakestDimensions,
} from "@/lib/growth-page";
import { GrowthClientShell } from "./growth-client";

type ProfileRow = { id: string; name: string | null };
type DailyReportRow = MetricsReport & { content?: string | null };
type ContentItemRow = { id: string; account_id: string | null; biz_date: string; owner_user_id: string };
type ScriptDocumentRow = { id: string; content_item_id: string; raw_text: string | null; estimated_duration_sec: number | null };
type ScriptSegmentRow = {
  id: string;
  script_document_id: string;
  segment_type: "hook" | "background" | "core_point" | "action_cta" | "closing";
  segment_order: number | null;
  content: string;
  start_sec: number | null;
  end_sec: number | null;
};
type AiInsightRow = {
  id: string;
  insight_type: string;
  result_status: string | null;
  result_json: Record<string, unknown> | null;
  rendered_text: string | null;
  created_at: string;
};

function collectTags(accounts: MetricsAccount[]): string[] {
  return Array.from(
    new Set(
      accounts
        .flatMap((account) => [account.content_direction, account.presentation_format])
        .map((tag) => tag?.trim())
        .filter((tag): tag is string => Boolean(tag)),
    ),
  );
}

export default async function GrowthPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const now = new Date();
  const monthAgoDate = new Date(now);
  monthAgoDate.setDate(monthAgoDate.getDate() - 30);
  const monthAgo = monthAgoDate.toISOString().split("T")[0];

  const weekAgoDate = new Date(now);
  weekAgoDate.setDate(weekAgoDate.getDate() - 7);
  const weekAgo = weekAgoDate.toISOString().split("T")[0];

  const twoWeeksAgoDate = new Date(now);
  twoWeeksAgoDate.setDate(twoWeeksAgoDate.getDate() - 14);
  const twoWeeksAgo = twoWeeksAgoDate.toISOString().split("T")[0];

  const [
    profileResult,
    myAccountsResult,
    allAccountsResult,
    teamReportsResult,
    profilesResult,
    contentItemsResult,
    scriptDocumentsResult,
    scriptSegmentsResult,
    aiInsightResult,
  ] = await Promise.all([
    supabase.from("profiles").select("id, name").eq("id", user.id).single(),
    supabase
      .from("accounts")
      .select("id, profile_id, name, content_direction, presentation_format")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true }),
    supabase.from("accounts").select("id, profile_id, name, content_direction, presentation_format"),
    supabase
      .from("daily_reports")
      .select("user_id, account_id, report_date, play_count, likes, comments, shares, favorites, follower_gain, completion_rate, completion_rate_5s, content")
      .gte("report_date", monthAgo),
    supabase.from("profiles").select("id, name"),
    supabase.from("content_item").select("id, account_id, biz_date, owner_user_id").eq("owner_user_id", user.id),
    supabase.from("script_document").select("id, content_item_id, raw_text, estimated_duration_sec"),
    supabase.from("script_segment").select("id, script_document_id, segment_type, segment_order, content, start_sec, end_sec"),
    supabase
      .from("ai_insight_result")
      .select("id, insight_type, result_status, result_json, rendered_text, created_at")
      .eq("insight_type", "growth_edit")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const profile = profileResult.data as ProfileRow | null;
  const myAccounts = (myAccountsResult.data ?? []) as MetricsAccount[];
  const allAccounts = (allAccountsResult.data ?? []) as MetricsAccount[];
  const teamReports = (teamReportsResult.data ?? []) as DailyReportRow[];
  const profileNameMap = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((item) => [item.id, item.name ?? ""])) ;
  const contentItems = (contentItemsResult.data ?? []) as ContentItemRow[];
  const scriptDocuments = (scriptDocumentsResult.data ?? []) as ScriptDocumentRow[];
  const scriptSegments = (scriptSegmentsResult.data ?? []) as ScriptSegmentRow[];
  const aiInsight = ((aiInsightResult.data ?? [])[0] ?? null) as AiInsightRow | null;

  const myAccountIds = myAccounts.map((account) => account.id);
  const myAllReports = teamReports.filter((report) => myAccountIds.includes(report.account_id));
  const myReports7d = myAllReports.filter((report) => report.report_date >= weekAgo);
  const myReportsPrev7d = myAllReports.filter((report) => report.report_date >= twoWeeksAgo && report.report_date < weekAgo);

  const statusCards = buildStatusCards(myReports7d, myReportsPrev7d);
  const capabilityCards = buildGrowthDimensionCards({ myReports: myAllReports, teamReports });
  const weakestDimensions = getWeakestDimensions(myAllReports, teamReports);

  const contentItemByAccountAndDate = new Map(contentItems.map((item) => [`${item.account_id ?? ""}-${item.biz_date}`, item]));
  const latestReport = [...myAllReports].sort((left, right) => right.report_date.localeCompare(left.report_date))[0] ?? null;
  const linkedContentItem = latestReport ? contentItemByAccountAndDate.get(`${latestReport.account_id}-${latestReport.report_date}`) ?? null : null;
  const linkedScriptDocument = linkedContentItem
    ? scriptDocuments.find((document) => document.content_item_id === linkedContentItem.id) ?? null
    : null;
  const linkedScriptSegments = linkedScriptDocument
    ? scriptSegments
        .filter((segment) => segment.script_document_id === linkedScriptDocument.id)
        .sort((left, right) => (left.segment_order ?? 0) - (right.segment_order ?? 0))
        .map((segment) => ({
          id: segment.id,
          segmentType: segment.segment_type,
          content: segment.content,
          startSec: segment.start_sec,
          endSec: segment.end_sec,
        }))
    : [];

  const scriptSegmentsByAccountId = new Map<string, Array<{ content: string }>>();
  for (const document of scriptDocuments) {
    const contentItem = contentItems.find((item) => item.id === document.content_item_id);
    const accountId = contentItem?.account_id;
    if (!accountId) continue;
    const segments = scriptSegments.filter((segment) => segment.script_document_id === document.id);
    if (!segments.length) continue;
    scriptSegmentsByAccountId.set(
      accountId,
      segments.sort((left, right) => (left.segment_order ?? 0) - (right.segment_order ?? 0)).map((segment) => ({ content: segment.content })),
    );
  }

  const weakBenchmarkCards = buildWeakBenchmarkCards({
    weakestDimensions,
    myAccountId: myAccountIds[0] ?? "",
    myProfileId: user.id,
    myReports: myAllReports,
    teamReports,
    accounts: allAccounts,
    scriptSegmentsByAccountId,
  });

  const myTags = collectTags(myAccounts);
  const pkOpponentAccount = allAccounts.find(
    (account) => account.profile_id !== user.id && [account.content_direction, account.presentation_format].some((tag) => tag && myTags.includes(tag)),
  );
  const pkPanel = pkOpponentAccount
    ? buildPkComparisonData({
        leftName: profile?.name ?? user.email ?? "我",
        rightName: profileNameMap.get(pkOpponentAccount.profile_id) ?? pkOpponentAccount.name,
        leftReports: myAllReports,
        rightReports: teamReports.filter((report) => report.account_id === pkOpponentAccount.id),
      })
    : null;

  const weakestCard = capabilityCards.find((item) => item.name === weakestDimensions[0]);
  const advice = buildAdviceSections({
    aiInsight,
    weakestDimension: weakestDimensions[0],
    selfValue: weakestCard?.metricValue ?? 0,
    teamValue: 0,
  });

  const scriptBreakdown = buildScriptBreakdownData({
    rawText: latestReport?.content ?? linkedScriptDocument?.raw_text ?? "",
    scriptDocument: linkedScriptDocument,
    scriptSegments: linkedScriptSegments,
  });

  // ─── 组装 teamMembers（六维雷达对比用） ──────────────────
  const ratingToScore = (label: string): number => (label === "强" ? 85 : label === "中" ? 65 : 40);
  const allProfileIds = Array.from(new Set(allAccounts.map((a) => a.profile_id)));
  const teamMembersForRadar = allProfileIds
    .filter((pid) => pid !== user.id)
    .map((pid) => {
      const memberAccountIds = allAccounts.filter((a) => a.profile_id === pid).map((a) => a.id);
      const memberReports = teamReports.filter((r) => memberAccountIds.includes(r.account_id));
      if (memberReports.length < 3) return null;
      const memberCards = buildGrowthDimensionCards({ myReports: memberReports, teamReports });
      return {
        id: pid,
        name: profileNameMap.get(pid) ?? "未知",
        scores: memberCards.map((c) => ratingToScore(c.rating.label)),
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null && m.scores.length === 6);

  return (
    <GrowthClientShell
      profileName={profile?.name ?? user.email ?? ""}
      accountCount={myAccounts.length}
      reportCount={myAllReports.length}
      statusCards={statusCards}
      capabilityCards={capabilityCards}
      weakBenchmarkCards={weakBenchmarkCards}
      pkPanel={pkPanel}
      scriptBreakdown={scriptBreakdown}
      advice={advice}
      myReports={myAllReports}
      teamReports={teamReports}
      teamMembers={teamMembersForRadar}
    />
  );
}
