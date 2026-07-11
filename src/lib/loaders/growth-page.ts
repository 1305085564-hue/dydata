import type { SupabaseClient } from "@supabase/supabase-js";
import { measureAsync } from "@/lib/perf";
import {
  buildGrowthDataContract,
  buildGrowthDimensionCards,
  buildPkComparisonData,
  buildScriptBreakdownData,
  buildStatusCards,
  buildWeakBenchmarkCards,
  getWeakestDimensions,
  type AdviceSections,
  type GrowthDimensionCard,
  type GrowthPageContract,
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
export type GrowthPageLoadMode = "initial" | "full";

type GrowthPageSummary = {
  hasEnoughData: boolean;
  weakestDimension: string | null;
};

type LinkedScriptContext = {
  linkedScriptDocument: ScriptDocumentRow | null;
  linkedScriptSegments: Array<{
    id: string;
    segmentType: "hook" | "background" | "core_point" | "action_cta" | "closing";
    content: string;
    startSec: number | null;
    endSec: number | null;
  }>;
  scriptSegmentsByAccountId: Map<string, Array<{ content: string }>>;
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
        error.message.includes("content_item.owner_user_id") ||
        error.message.includes("script_document.content_item_id") ||
        error.message.includes("script_segment.segment_type") ||
        error.message.includes("column content_item.account_id does not exist") ||
        error.message.includes("column content_item.owner_user_id does not exist") ||
        error.message.includes("column script_document.content_item_id does not exist") ||
        error.message.includes("column script_segment.segment_type does not exist") ||
        error.message.includes("Could not find the 'account_id' column of 'content_item'") ||
        error.message.includes("Could not find the 'owner_user_id' column of 'content_item'") ||
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

  const contentItemsResult = await measureAsync("growth.full.scriptContext.contentItems", () =>
    supabase
      .from("content_item")
      .select("id, account_id, biz_date, owner_user_id")
      .eq("owner_user_id", userId),
  );

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

  const scriptDocumentsResult = await measureAsync("growth.full.scriptContext.scriptDocuments", () =>
    supabase
      .from("script_document")
      .select("id, content_item_id, raw_text, estimated_duration_sec")
      .in("content_item_id", contentItemIds),
  );

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
  const scriptSegmentsResult = await measureAsync("growth.full.scriptContext.scriptSegments", () =>
    supabase
      .from("script_segment")
      .select("id, script_document_id, segment_type, segment_order, content, start_sec, end_sec")
      .in("script_document_id", scriptDocumentIds),
  );

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

function mapReportsWithSubmitter(reports: DailyReportRow[], profileNameMap: Map<string, string>) {
  return reports.map((report) => ({
    ...report,
    submitter: profileNameMap.get(report.user_id) ?? "未知",
  })) as GrowthReport[];
}

function buildProfileNameMap(rows: ProfileRow[]) {
  return new Map(rows.map((item) => [item.id, item.name ?? ""]));
}

function buildLinkedScriptContext({
  latestReport,
  scriptContextData,
}: {
  latestReport: GrowthReport | null;
  scriptContextData: Awaited<ReturnType<typeof loadScriptContextData>> | null;
}): LinkedScriptContext {
  if (!scriptContextData || !latestReport) {
    return {
      linkedScriptDocument: null,
      linkedScriptSegments: [],
      scriptSegmentsByAccountId: new Map(),
    };
  }

  const { contentItems, scriptDocuments, scriptSegments } = scriptContextData;
  const contentItemById = new Map(contentItems.map((item) => [item.id, item]));
  const contentItemByAccountAndDate = new Map(contentItems.map((item) => [`${item.account_id ?? ""}-${item.biz_date}`, item]));
  const linkedContentItem = contentItemByAccountAndDate.get(`${latestReport.account_id}-${latestReport.report_date}`) ?? null;
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
    ? (scriptSegmentsByDocumentId.get(linkedScriptDocument.id) ?? []).map((segment) => ({
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

  return {
    linkedScriptDocument,
    linkedScriptSegments,
    scriptSegmentsByAccountId,
  };
}

function buildTeamMembers({
  allAccounts,
  userId,
  teamReportsWithSubmitter,
  profileNameMap,
}: {
  allAccounts: MetricsAccount[];
  userId: string;
  teamReportsWithSubmitter: GrowthReport[];
  profileNameMap: Map<string, string>;
}) {
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

  const reportsByAccountId = new Map<string, GrowthReport[]>();
  for (const report of teamReportsWithSubmitter) {
    const list = reportsByAccountId.get(report.account_id);
    if (list) {
      list.push(report);
    } else {
      reportsByAccountId.set(report.account_id, [report]);
    }
  }

  return Array.from(accountIdsByProfileId.keys())
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
}

function buildPkPanel({
  myAccounts,
  allAccounts,
  userId,
  profile,
  userEmail,
  teamReportsWithSubmitter,
  effectiveMyReports,
  profileNameMap,
}: {
  myAccounts: MetricsAccount[];
  allAccounts: MetricsAccount[];
  userId: string;
  profile: ProfileRow | null;
  userEmail: string | null | undefined;
  teamReportsWithSubmitter: GrowthReport[];
  effectiveMyReports: MetricsReport[];
  profileNameMap: Map<string, string>;
}) {
  const myTags = collectTags(myAccounts);
  const myTagsSet = new Set(myTags);
  const pkOpponentAccount = allAccounts.find(
    (account) => account.profile_id !== userId && [account.content_direction, account.presentation_format].some((tag) => Boolean(tag && myTagsSet.has(tag))),
  );

  if (!pkOpponentAccount) {
    return null;
  }

  const reportsByAccountId = new Map<string, GrowthReport[]>();
  for (const report of teamReportsWithSubmitter) {
    const list = reportsByAccountId.get(report.account_id);
    if (list) {
      list.push(report);
    } else {
      reportsByAccountId.set(report.account_id, [report]);
    }
  }

  return buildPkComparisonData({
    leftName: profile?.name ?? userEmail ?? "我",
    rightName: profileNameMap.get(pkOpponentAccount.profile_id) ?? pkOpponentAccount.name,
    leftReports: effectiveMyReports,
    rightReports: reportsByAccountId.get(pkOpponentAccount.id) ?? [],
  });
}

function buildGrowthSummary(reportCount: number, weakestDimensions: string[]) {
  return {
    hasEnoughData: reportCount >= 3,
    weakestDimension: weakestDimensions[0] ?? null,
  } satisfies GrowthPageSummary;
}

export interface GrowthPageData {
  contract: GrowthPageContract;
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
  teamReports: GrowthReport[];
  teamMembers: Array<{ id: string; name: string; scores: number[] }>;
  summary: GrowthPageSummary;
  loadMode: GrowthPageLoadMode;
  isPartial: boolean;
}

export interface GrowthPageHydrationData
  extends Pick<
    GrowthPageData,
    | "reportCount"
    | "contract"
    | "statusCards"
    | "capabilityCards"
    | "weakBenchmarkCards"
    | "pkPanel"
    | "scriptBreakdown"
    | "advice"
    | "myReports"
    | "teamReports"
    | "teamMembers"
    | "summary"
  > {
  loadMode: "full";
  isPartial: false;
}

function buildGrowthPageResponse({
  mode,
  now,
  userId,
  userEmail,
  profile,
  myAccounts,
  allAccounts,
  teamReports,
  scriptContextData,
}: {
  mode: GrowthPageLoadMode;
  now: Date;
  userId: string;
  userEmail: string | null | undefined;
  profile: ProfileRow | null;
  myAccounts: MetricsAccount[];
  allAccounts: MetricsAccount[];
  teamReports: DailyReportRow[];
  scriptContextData: Awaited<ReturnType<typeof loadScriptContextData>> | null;
}): GrowthPageData {
  const weekAgo = shiftDateOnly(now, -7);
  const twoWeeksAgo = shiftDateOnly(now, -14);
  const isInitialMode = mode === "initial";
  const profileNameMap = buildProfileNameMap(
    Array.from(new Map(teamReports.map((report) => [report.user_id, { id: report.user_id, name: (report as GrowthReport).submitter ?? null }])).values()),
  );
  const teamReportsWithSubmitter =
    teamReports.length && (teamReports[0] as GrowthReport).submitter
      ? (teamReports as GrowthReport[])
      : mapReportsWithSubmitter(teamReports, profileNameMap);

  const myAccountIds = myAccounts.map((account) => account.id);
  const myAccountIdSet = new Set(myAccountIds);
  const myAllReports = teamReportsWithSubmitter.filter((report) => myAccountIdSet.has(report.account_id));

  const effectiveMyReports = myAllReports;

  const myReports7d = effectiveMyReports.filter((report) => report.report_date >= weekAgo);
  const myReportsPrev7d = effectiveMyReports.filter((report) => report.report_date >= twoWeeksAgo && report.report_date < weekAgo);

  const statusCards = buildStatusCards(myReports7d, myReportsPrev7d);
  const capabilityCards = buildGrowthDimensionCards({ myReports: effectiveMyReports, teamReports: teamReportsWithSubmitter });
  const weakestDimensions = getWeakestDimensions(effectiveMyReports, teamReportsWithSubmitter);

  const latestReport = myAllReports.reduce<GrowthReport | null>((latest, current) => {
    if (!latest) return current;
    return current.report_date > latest.report_date ? current : latest;
  }, null);

  const { linkedScriptDocument, linkedScriptSegments, scriptSegmentsByAccountId } = buildLinkedScriptContext({
    latestReport,
    scriptContextData,
  });

  const scriptBreakdown = buildScriptBreakdownData({
    rawText: latestReport?.content ?? linkedScriptDocument?.raw_text ?? "",
    scriptDocument: linkedScriptDocument,
    scriptSegments: linkedScriptSegments,
  });

  const weakBenchmarkCards = isInitialMode
    ? []
    : buildWeakBenchmarkCards({
        weakestDimensions,
        myAccountId: myAccountIds[0] ?? "",
        myProfileId: userId,
        myReports: effectiveMyReports,
        teamReports: teamReportsWithSubmitter,
        accounts: allAccounts,
        scriptSegmentsByAccountId,
      });

  const teamMembers = isInitialMode
    ? []
    : buildTeamMembers({
        allAccounts,
        userId,
        teamReportsWithSubmitter,
        profileNameMap: buildProfileNameMap(
          Array.from(
            new Map(teamReportsWithSubmitter.map((report) => [report.user_id, { id: report.user_id, name: report.submitter ?? "" }])).values(),
          ),
        ),
      });

  const pkPanel = isInitialMode
    ? null
    : buildPkPanel({
        myAccounts,
        allAccounts,
        userId,
        profile,
        userEmail,
        teamReportsWithSubmitter,
        effectiveMyReports,
        profileNameMap: buildProfileNameMap(
          Array.from(
            new Map(teamReportsWithSubmitter.map((report) => [report.user_id, { id: report.user_id, name: report.submitter ?? "" }])).values(),
          ),
        ),
      });

  const contract = buildGrowthDataContract({
    profileName: profile?.name ?? userEmail ?? "",
    accountCount: myAccounts.length,
    myProfileId: userId,
    myReports: myAllReports,
    teamReports: teamReportsWithSubmitter,
    scriptSegments: linkedScriptSegments,
    scriptSegmentsByAccountId,
  });
  const advice: AdviceSections = contract.verdict
    ? {
        source: "rule",
        diagnosis: contract.verdict.diagnosis,
        reference:
          contract.benchmark.state === "ok" && contract.benchmark.peer
            ? `参考 ${contract.benchmark.peer.name}：${contract.benchmark.peer.scriptSnippet || "先看对方近期高表现内容。"}`
            : contract.benchmark.state === "fallback_team_avg"
              ? "当前没有可实名展示的稳定对标人，先参考团队均值。"
              : "当前没有可用团队对标，先复盘自己的真实历史数据。",
        action: contract.verdict.prescription,
      }
    : {
        source: "rule",
        diagnosis: "还没有真实日报数据，暂不生成体检结论。",
        reference: "提交真实日报后再生成团队对标。",
        action: "先提交一条真实日报。",
      };

  return {
    contract,
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
    summary: buildGrowthSummary(myAllReports.length, weakestDimensions),
    loadMode: mode,
    isPartial: isInitialMode,
  };
}

async function loadInitialGrowthPageData({
  supabase,
  userId,
  userEmail,
  now,
}: {
  supabase: GrowthSupabase;
  userId: string;
  userEmail: string | null | undefined;
  now: Date;
}) {
  const twoWeeksAgo = shiftDateOnly(now, -14);
  const [profileResult, myAccountsResult, teamReportsResult] = await Promise.all([
    measureAsync("growth.initial.profile", () => supabase.from("profiles").select("id, name").eq("id", userId).single()),
    measureAsync("growth.initial.myAccounts", () =>
      supabase
        .from("accounts")
        .select("id, profile_id, name, content_direction, presentation_format")
        .eq("profile_id", userId)
        .order("created_at", { ascending: true }),
    ),
    measureAsync("growth.initial.teamReports14d", () =>
      supabase
        .from("daily_reports")
        .select("user_id, account_id, report_date, play_count, likes, comments, shares, favorites, follower_gain, completion_rate, completion_rate_5s, content")
        .gte("report_date", twoWeeksAgo),
    ),
  ]);

  const profile = profileResult.data as ProfileRow | null;
  const myAccounts = (myAccountsResult.data ?? []) as MetricsAccount[];
  const teamReports = (teamReportsResult.data ?? []) as DailyReportRow[];
  const teamUserIds = Array.from(new Set([...teamReports.map((report) => report.user_id), userId]));
  const profilesResult =
    teamUserIds.length > 0
      ? await measureAsync("growth.initial.teamProfiles", () => supabase.from("profiles").select("id, name").in("id", teamUserIds))
      : { data: [] as ProfileRow[], error: null };
  const profileNameMap = buildProfileNameMap((profilesResult.data ?? []) as ProfileRow[]);
  return buildGrowthPageResponse({
    mode: "initial",
    now,
    userId,
    userEmail,
    profile,
    myAccounts,
    allAccounts: myAccounts,
    teamReports: mapReportsWithSubmitter(teamReports, profileNameMap),
    scriptContextData: null,
  });
}

async function loadFullGrowthPageData({
  supabase,
  userId,
  userEmail,
  now,
}: {
  supabase: GrowthSupabase;
  userId: string;
  userEmail: string | null | undefined;
  now: Date;
}) {
  const monthAgo = shiftDateOnly(now, -30);
  const [allAccountsResult, teamReportsResult, scriptContextData] = await Promise.all([
    measureAsync("growth.full.allAccounts", () =>
      supabase
        .from("accounts")
        .select("id, profile_id, name, content_direction, presentation_format")
        .order("created_at", { ascending: true }),
    ),
    measureAsync("growth.full.teamReports30d", () =>
      supabase
        .from("daily_reports")
        .select("user_id, account_id, report_date, play_count, likes, comments, shares, favorites, follower_gain, completion_rate, completion_rate_5s, content")
        .gte("report_date", monthAgo),
    ),
    measureAsync("growth.full.scriptContext.total", () => loadScriptContextData(supabase, userId)),
  ]);

  const allAccounts = (allAccountsResult.data ?? []) as MetricsAccount[];
  const myAccounts = allAccounts.filter((account) => account.profile_id === userId);
  const teamReports = (teamReportsResult.data ?? []) as DailyReportRow[];
  const teamUserIds = Array.from(new Set([...teamReports.map((report) => report.user_id), userId]));
  const profilesResult =
    teamUserIds.length > 0
      ? await measureAsync("growth.full.teamProfiles", () => supabase.from("profiles").select("id, name").in("id", teamUserIds))
      : { data: [] as ProfileRow[], error: null };
  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const profileNameMap = buildProfileNameMap(profiles);
  const profile = profiles.find((item) => item.id === userId) ?? null;

  return buildGrowthPageResponse({
    mode: "full",
    now,
    userId,
    userEmail,
    profile,
    myAccounts,
    allAccounts,
    teamReports: mapReportsWithSubmitter(teamReports, profileNameMap),
    scriptContextData,
  });
}

export async function loadGrowthPageHydrationData({
  supabase,
  userId,
  userEmail,
  now = new Date(),
}: {
  supabase: GrowthSupabase;
  userId: string;
  userEmail: string | null | undefined;
  now?: Date;
}): Promise<GrowthPageHydrationData> {
  const fullData = await measureAsync("growth.full.total", () =>
    loadFullGrowthPageData({
      supabase,
      userId,
      userEmail,
      now,
    }),
  );

  return {
    contract: fullData.contract,
    reportCount: fullData.reportCount,
    statusCards: fullData.statusCards,
    capabilityCards: fullData.capabilityCards,
    weakBenchmarkCards: fullData.weakBenchmarkCards,
    pkPanel: fullData.pkPanel,
    scriptBreakdown: fullData.scriptBreakdown,
    advice: fullData.advice,
    myReports: fullData.myReports,
    teamReports: fullData.teamReports,
    teamMembers: fullData.teamMembers,
    summary: fullData.summary,
    loadMode: "full",
    isPartial: false,
  };
}

export async function loadGrowthPageData({
  supabase,
  userId,
  userEmail,
  mode = "full",
  now = new Date(),
}: {
  supabase: GrowthSupabase;
  userId: string;
  userEmail: string | null | undefined;
  mode?: GrowthPageLoadMode;
  now?: Date;
}): Promise<GrowthPageData> {
  if (mode === "initial") {
    return measureAsync("growth.initial.total", () =>
      loadInitialGrowthPageData({
        supabase,
        userId,
        userEmail,
        now,
      }),
    );
  }

  return measureAsync("growth.full.legacyTotal", () =>
    loadFullGrowthPageData({
      supabase,
      userId,
      userEmail,
      now,
    }),
  );
}

export async function loadGrowthPageContract({
  supabase,
  userId,
  userEmail,
  now = new Date(),
}: {
  supabase: GrowthSupabase;
  userId: string;
  userEmail: string | null | undefined;
  now?: Date;
}): Promise<GrowthPageContract> {
  const fullData = await measureAsync("growth.contract.total", () =>
    loadFullGrowthPageData({
      supabase,
      userId,
      userEmail,
      now,
    }),
  );

  return fullData.contract;
}
