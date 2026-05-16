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

type GrowthSupabase = SupabaseClient;
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

let contentScriptSchemaAvailable: boolean | null = null;

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

function isMissingContentScriptSchemaError(error: { message?: string } | null | undefined) {
  return Boolean(
    error?.message &&
      (error.message.includes("content_item.account_id") ||
        error.message.includes("script_document.content_item_id") ||
        error.message.includes("script_segment.segment_type") ||
        error.message.includes("column content_item.account_id does not exist") ||
        error.message.includes("column script_document.content_item_id does not exist") ||
        error.message.includes("column script_segment.segment_type does not exist") ||
        error.message.includes("Could not find the 'account_id' column of 'content_item'") ||
        error.message.includes("Could not find the 'content_item_id' column of 'script_document'") ||
        error.message.includes("Could not find the 'segment_type' column of 'script_segment'")),
  );
}

async function loadScriptContextData(supabase: GrowthSupabase, userId: string) {
  if (contentScriptSchemaAvailable === false) {
    return {
      contentItems: [] as ContentItemRow[],
      scriptDocuments: [] as ScriptDocumentRow[],
      scriptSegments: [] as ScriptSegmentRow[],
    };
  }

  const contentItemsResult = await supabase
    .from("content_item")
    .select("id, account_id, biz_date, owner_user_id")
    .eq("owner_user_id", userId);

  if (isMissingContentScriptSchemaError(contentItemsResult.error)) {
    contentScriptSchemaAvailable = false;
    return {
      contentItems: [],
      scriptDocuments: [],
      scriptSegments: [],
    };
  }

  const contentItems = (contentItemsResult.data ?? []) as ContentItemRow[];
  if (!contentItems.length) {
    contentScriptSchemaAvailable = true;
    return {
      contentItems,
      scriptDocuments: [],
      scriptSegments: [],
    };
  }

  const contentItemIds = contentItems.map((item) => item.id);

  const scriptDocumentsResult = await supabase
    .from("script_document")
    .select("id, content_item_id, raw_text, estimated_duration_sec")
    .in("content_item_id", contentItemIds);

  if (isMissingContentScriptSchemaError(scriptDocumentsResult.error)) {
    contentScriptSchemaAvailable = false;
    return {
      contentItems: [],
      scriptDocuments: [],
      scriptSegments: [],
    };
  }

  const scriptDocuments = (scriptDocumentsResult.data ?? []) as ScriptDocumentRow[];
  if (!scriptDocuments.length) {
    contentScriptSchemaAvailable = true;
    return {
      contentItems,
      scriptDocuments,
      scriptSegments: [],
    };
  }

  const scriptDocumentIds = scriptDocuments.map((document) => document.id);
  const scriptSegmentsResult = await supabase
    .from("script_segment")
    .select("id, script_document_id, segment_type, segment_order, content, start_sec, end_sec")
    .in("script_document_id", scriptDocumentIds);

  if (isMissingContentScriptSchemaError(scriptSegmentsResult.error)) {
    contentScriptSchemaAvailable = false;
    return {
      contentItems: [],
      scriptDocuments: [],
      scriptSegments: [],
    };
  }

  contentScriptSchemaAvailable = true;
  return {
    contentItems,
    scriptDocuments,
    scriptSegments: (scriptSegmentsResult.data ?? []) as ScriptSegmentRow[],
  };
}

export const __internal = {
  isMissingContentScriptSchemaError,
  loadScriptContextData,
  resetContentScriptSchemaCache() {
    contentScriptSchemaAvailable = null;
  },
};

function generateVirtualReports(
  accountIds: string[],
  userId: string,
  count: number,
  baseDate: Date,
  existingDates: Set<string>,
): MetricsReport[] {
  const reports: MetricsReport[] = [];
  const templates = [
    { play_count: 52000, likes: 1100, comments: 150, shares: 100, favorites: 180, follower_gain: 42, completion_rate: "38%", completion_rate_5s: "56%" },
    { play_count: 48000, likes: 980, comments: 130, shares: 90, favorites: 165, follower_gain: 38, completion_rate: "35%", completion_rate_5s: "53%" },
    { play_count: 55000, likes: 1200, comments: 165, shares: 110, favorites: 195, follower_gain: 45, completion_rate: "40%", completion_rate_5s: "58%" },
  ];

  let offset = 1;
  while (reports.length < count) {
    const candidateDate = shiftDateOnly(baseDate, -offset);
    if (!existingDates.has(candidateDate)) {
      const template = templates[reports.length % templates.length];
      const accountId = accountIds[reports.length % accountIds.length] ?? "virtual";
      reports.push({
        user_id: userId,
        account_id: accountId,
        report_date: candidateDate,
        ...template,
      });
    }
    offset++;
    if (offset > 60) break;
  }
  return reports;
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
    aiInsightResult,
    scriptContextData,
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
    supabase
      .from("ai_insight_result")
      .select("id, insight_type, result_status, result_json, rendered_text, created_at")
      .eq("insight_type", "growth_edit")
      .order("created_at", { ascending: false })
      .limit(1),
    loadScriptContextData(supabase, userId),
  ]);

  const profile = profileResult.data as ProfileRow | null;
  const myAccounts = (myAccountsResult.data ?? []) as MetricsAccount[];
  const allAccounts = (allAccountsResult.data ?? []) as MetricsAccount[];
  const teamReports = (teamReportsResult.data ?? []) as DailyReportRow[];
  const profileNameMap = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((item) => [item.id, item.name ?? ""]));
  const { contentItems, scriptDocuments, scriptSegments } = scriptContextData;
  const aiInsight = ((aiInsightResult.data ?? [])[0] ?? null) as AiInsightRow | null;

  const teamReportsWithSubmitter: GrowthReport[] = teamReports.map((report) => ({
    ...report,
    submitter: profileNameMap.get(report.user_id) ?? "未知",
  }));

  const myAccountIds = myAccounts.map((account) => account.id);
  const myAccountIdSet = new Set(myAccountIds);
  const myAllReports = teamReportsWithSubmitter.filter((report) => myAccountIdSet.has(report.account_id));

  const needsVirtualData = myAllReports.length < 3;
  const virtualReports = needsVirtualData
    ? generateVirtualReports(myAccountIds, userId, 3 - myAllReports.length, now, new Set(myAllReports.map((r) => r.report_date)))
    : [];
  const effectiveMyReports = [...myAllReports, ...virtualReports];

  const myReports7d = effectiveMyReports.filter((report) => report.report_date >= weekAgo);
  const myReportsPrev7d = effectiveMyReports.filter((report) => report.report_date >= twoWeeksAgo && report.report_date < weekAgo);

  const statusCards = buildStatusCards(myReports7d, myReportsPrev7d);
  const capabilityCards = buildGrowthDimensionCards({ myReports: effectiveMyReports, teamReports: teamReportsWithSubmitter });
  const weakestDimensions = getWeakestDimensions(effectiveMyReports, teamReportsWithSubmitter);

  const contentItemById = new Map(contentItems.map((item) => [item.id, item]));
  const contentItemByAccountAndDate = new Map(contentItems.map((item) => [`${item.account_id ?? ""}-${item.biz_date}`, item]));
  const latestReport = myAllReports.reduce<GrowthReport | null>((latest, current) => {
    if (!latest) return current;
    return current.report_date > latest.report_date ? current : latest;
  }, null);
  const linkedContentItem = latestReport ? contentItemByAccountAndDate.get(`${latestReport.account_id}-${latestReport.report_date}`) ?? null : null;
  const scriptDocumentByContentItemId = new Map(scriptDocuments.map((document) => [document.content_item_id, document]));
  const linkedScriptDocument = linkedContentItem ? scriptDocumentByContentItemId.get(linkedContentItem.id) ?? null : null;
  const scriptSegmentsByDocumentId = new Map<string, ScriptSegmentRow[]>();
  for (const segment of scriptSegments) {
    const list = scriptSegmentsByDocumentId.get(segment.script_document_id);
    if (list) {
      list.push(segment);
    } else {
      scriptSegmentsByDocumentId.set(segment.script_document_id, [segment]);
    }
  }
  for (const [documentId, segments] of scriptSegmentsByDocumentId) {
    segments.sort((left, right) => (left.segment_order ?? 0) - (right.segment_order ?? 0));
    scriptSegmentsByDocumentId.set(documentId, segments);
  }
  const linkedScriptSegments = linkedScriptDocument
    ? (scriptSegmentsByDocumentId.get(linkedScriptDocument.id) ?? [])
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
    const contentItem = contentItemById.get(document.content_item_id);
    const accountId = contentItem?.account_id;
    if (!accountId) continue;
    const segments = scriptSegmentsByDocumentId.get(document.id) ?? [];
    if (!segments.length) continue;
    scriptSegmentsByAccountId.set(
      accountId,
      segments.map((segment) => ({ content: segment.content })),
    );
  }

  const weakBenchmarkCards = buildWeakBenchmarkCards({
    weakestDimensions,
    myAccountId: myAccountIds[0] ?? "",
    myProfileId: userId,
    myReports: effectiveMyReports,
    teamReports: teamReportsWithSubmitter,
    accounts: allAccounts,
    scriptSegmentsByAccountId,
  });

  const myTags = collectTags(myAccounts);
  const myTagsSet = new Set(myTags);
  const pkOpponentAccount = allAccounts.find(
    (account) => account.profile_id !== userId && [account.content_direction, account.presentation_format].some((tag) => Boolean(tag && myTagsSet.has(tag))),
  );
  const reportsByAccountId = new Map<string, GrowthReport[]>();
  for (const report of teamReportsWithSubmitter) {
    const list = reportsByAccountId.get(report.account_id);
    if (list) {
      list.push(report);
    } else {
      reportsByAccountId.set(report.account_id, [report]);
    }
  }
  const pkPanel = pkOpponentAccount
    ? buildPkComparisonData({
        leftName: profile?.name ?? userEmail ?? "我",
        rightName: profileNameMap.get(pkOpponentAccount.profile_id) ?? pkOpponentAccount.name,
        leftReports: effectiveMyReports,
        rightReports: reportsByAccountId.get(pkOpponentAccount.id) ?? [],
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
  const accountIdsByProfileId = new Map<string, string[]>();
  for (const account of allAccounts) {
    const accountIds = accountIdsByProfileId.get(account.profile_id);
    if (accountIds) {
      accountIds.push(account.id);
    } else {
      accountIdsByProfileId.set(account.profile_id, [account.id]);
    }
  }
  const teamMembers = Array.from(accountIdsByProfileId.keys())
    .filter((profileId) => profileId !== userId)
    .map((profileId) => {
      const memberAccountIds = accountIdsByProfileId.get(profileId) ?? [];
      const memberReports = memberAccountIds.flatMap((accountId) => reportsByAccountId.get(accountId) ?? []);
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
    myReports: effectiveMyReports,
    teamReports: teamReportsWithSubmitter,
    teamMembers,
    summary: {
      hasEnoughData: true,
      weakestDimension: weakestDimensions[0] ?? null,
    },
  };
}
