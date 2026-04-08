import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAdviceSections,
  buildGrowthDimensionCards,
  buildPkComparisonData,
  buildScriptBreakdownData,
  buildStatusCards,
  buildWeakBenchmarkCards,
  getWeakestDimensions,
  type AdviceSections,
  type GrowthDimensionCard,
  type GrowthPkRow,
  type ScriptBreakdownData,
  type StatusCardItem,
  type WeakBenchmarkCard,
} from "@/lib/growth-page";
import type { MetricsAccount, MetricsReport } from "@/lib/metrics";
import { shiftDateOnly } from "./shared";

type GrowthSupabase = SupabaseClient<any, "public", any>;
type ProfileRow = { id: string; name: string | null };
type DailyReportRow = MetricsReport & { content?: string | null };
type GrowthReport = MetricsReport & { content?: string | null; submitter?: string };
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

export interface GrowthPageData {
  profileName: string;
  accountCount: number;
  reportCount: number;
  statusCards: StatusCardItem[];
  capabilityCards: GrowthDimensionCard[];
  weakBenchmarkCards: WeakBenchmarkCard[];
  pkPanel: { leftName: string; rightName: string; rows: GrowthPkRow[] } | null;
  scriptBreakdown: ScriptBreakdownData;
  advice: AdviceSections;
  myReports: MetricsReport[];
  teamReports: MetricsReport[];
  teamMembers: Array<{ id: string; name: string; scores: number[] }>;
  summary: {
    hasEnoughData: boolean;
    weakestDimension: string | null;
  };
}

export async function loadGrowthPageData({
  supabase,
  userId,
  userEmail,
}: {
  supabase: GrowthSupabase;
  userId: string;
  userEmail: string | null | undefined;
}): Promise<GrowthPageData> {
  const now = new Date();
  const monthAgo = shiftDateOnly(now, -30);
  const weekAgo = shiftDateOnly(now, -7);
  const twoWeeksAgo = shiftDateOnly(now, -14);

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
    supabase.from("profiles").select("id, name").eq("id", userId).single(),
    supabase
      .from("accounts")
      .select("id, profile_id, name, content_direction, presentation_format")
      .eq("profile_id", userId)
      .order("created_at", { ascending: true }),
    supabase.from("accounts").select("id, profile_id, name, content_direction, presentation_format"),
    supabase
      .from("daily_reports")
      .select("user_id, account_id, report_date, play_count, likes, comments, shares, favorites, follower_gain, completion_rate, completion_rate_5s, content")
      .gte("report_date", monthAgo),
    supabase.from("profiles").select("id, name"),
    supabase.from("content_item").select("id, account_id, biz_date, owner_user_id").eq("owner_user_id", userId),
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
  const profileNameMap = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((item) => [item.id, item.name ?? ""]));
  const contentItems = (contentItemsResult.data ?? []) as ContentItemRow[];
  const scriptDocuments = (scriptDocumentsResult.data ?? []) as ScriptDocumentRow[];
  const scriptSegments = (scriptSegmentsResult.data ?? []) as ScriptSegmentRow[];
  const aiInsight = ((aiInsightResult.data ?? [])[0] ?? null) as AiInsightRow | null;

  const teamReportsWithSubmitter: GrowthReport[] = teamReports.map((report) => ({
    ...report,
    submitter: profileNameMap.get(report.user_id) ?? "未知",
  }));

  const myAccountIds = myAccounts.map((account) => account.id);
  const myAllReports = teamReportsWithSubmitter.filter((report) => myAccountIds.includes(report.account_id));
  const myReports7d = myAllReports.filter((report) => report.report_date >= weekAgo);
  const myReportsPrev7d = myAllReports.filter((report) => report.report_date >= twoWeeksAgo && report.report_date < weekAgo);

  const statusCards = buildStatusCards(myReports7d, myReportsPrev7d);
  const capabilityCards = buildGrowthDimensionCards({ myReports: myAllReports, teamReports: teamReportsWithSubmitter });
  const weakestDimensions = getWeakestDimensions(myAllReports, teamReportsWithSubmitter);

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
    myProfileId: userId,
    myReports: myAllReports,
    teamReports: teamReportsWithSubmitter,
    accounts: allAccounts,
    scriptSegmentsByAccountId,
  });

  const myTags = collectTags(myAccounts);
  const pkOpponentAccount = allAccounts.find(
    (account) => account.profile_id !== userId && [account.content_direction, account.presentation_format].some((tag) => tag && myTags.includes(tag)),
  );
  const pkPanel = pkOpponentAccount
    ? buildPkComparisonData({
        leftName: profile?.name ?? userEmail ?? "我",
        rightName: profileNameMap.get(pkOpponentAccount.profile_id) ?? pkOpponentAccount.name,
        leftReports: myAllReports,
        rightReports: teamReportsWithSubmitter.filter((report) => report.account_id === pkOpponentAccount.id),
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

  const ratingToScore = (label: string): number => (label === "强" ? 85 : label === "中" ? 65 : 40);
  const allProfileIds = Array.from(new Set(allAccounts.map((account) => account.profile_id)));
  const teamMembers = allProfileIds
    .filter((profileId) => profileId !== userId)
    .map((profileId) => {
      const memberAccountIds = allAccounts.filter((account) => account.profile_id === profileId).map((account) => account.id);
      const memberReports = teamReportsWithSubmitter.filter((report) => memberAccountIds.includes(report.account_id));
      if (memberReports.length < 3) return null;
      const memberCards = buildGrowthDimensionCards({ myReports: memberReports, teamReports: teamReportsWithSubmitter });
      return {
        id: profileId,
        name: profileNameMap.get(profileId) ?? "未知",
        scores: memberCards.map((card) => ratingToScore(card.rating.label)),
      };
    })
    .filter((member): member is NonNullable<typeof member> => member !== null && member.scores.length === 6);

  return {
    profileName: profile?.name ?? userEmail ?? "",
    accountCount: myAccounts.length,
    reportCount: myAllReports.length,
    statusCards,
    capabilityCards,
    weakBenchmarkCards,
    pkPanel,
    scriptBreakdown,
    advice,
    myReports: myAllReports,
    teamReports: teamReportsWithSubmitter,
    teamMembers,
    summary: {
      hasEnoughData: myAllReports.length >= 3,
      weakestDimension: weakestDimensions[0] ?? null,
    },
  };
}
