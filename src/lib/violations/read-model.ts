import {
  calculatePassRate,
  getUtcWeekStartIso,
  mapRecentViolations,
  selectConversionTop3,
  selectDangerousTop3,
  selectSafeTop3,
  type DashboardCaseRow,
  type DashboardConversionRow,
  type DashboardRecentRow,
} from "./dashboard-summary";

export type SortKey = "conversion_rate" | "pass_rate" | "usage_count" | "created_at";
export type SortDirection = "asc" | "desc";
export type StatusFilter = "pending" | "processed";
export type ViolationsListView = "admin" | "staff";

export type ViolationsListItemRow = {
  id?: string | null;
  created_at?: string | null;
  script_text?: string | null;
  category?: string | null;
  purpose?: string | null;
  guidance_method?: string | null;
  pass_count?: number | null;
  fail_count?: number | null;
  usage_count?: number | null;
  weighted_conversion_rate?: number | null;
  usage_state?: string | null;
  promotion_level?: string | null;
  status?: string | null;
};

export type ViolationCaseDetailRow = {
  id: string;
  created_at?: string | null;
  submitted_by?: string | null;
  script_text?: string | null;
  is_violation?: boolean | null;
  category?: string | null;
  account_id?: string | null;
  account_name_snapshot?: string | null;
  team_id?: string | null;
  scene_description?: string | null;
  screenshot_paths?: string[] | null;
  result?: string | null;
  tags?: string[] | null;
  pass_count?: number | null;
  fail_count?: number | null;
  status?: string | null;
  risk_level?: string | null;
  admin_conclusion?: string | null;
  suggested_action?: string | null;
  reviewed_at?: string | null;
  purpose?: string | null;
  script_format?: string | null;
  total_views?: number | null;
  total_follows?: number | null;
  usage_count?: number | null;
  weighted_conversion_rate?: number | null;
  platforms?: string[] | null;
  guidance_method?: string | null;
  promotion_level?: string | null;
  usage_state?: string | null;
  reviewed_by?: string | null;
  submitter?: unknown;
  team?: unknown;
  reviewer?: unknown;
  test_records?: unknown[];
  violation_test_records?: unknown[];
};

export type DashboardSummaryData = {
  dangerousTop3: ReturnType<typeof selectDangerousTop3>;
  safeTop3: ReturnType<typeof selectSafeTop3>;
  conversionTop3: ReturnType<typeof selectConversionTop3>;
  weeklyStats: {
    newViolations: number;
    newCases: number;
  };
  recentViolations: ReturnType<typeof mapRecentViolations>;
};

type QueryResult<T> = {
  data: T[] | null;
  error: unknown;
  count: number | null;
};

type MaybeSingleQueryResult<T> = {
  data: T | null;
  error: unknown;
};

type RangeQuery<T> = {
  eq: (column: string, value: unknown) => RangeQuery<T>;
  in: (column: string, values: string[]) => RangeQuery<T>;
  ilike: (column: string, value: string) => RangeQuery<T>;
  order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => RangeQuery<T>;
  range: (from: number, to: number) => Promise<QueryResult<T>>;
};

type AwaitableQuery<T> = RangeQuery<T> & PromiseLike<QueryResult<T>>;

type RangeSelectable<T> = {
  select: (columns: string, options?: { count?: "exact"; head?: boolean }) => AwaitableQuery<T>;
};

type MaybeSingleSelectable<T> = {
  select: (columns: string) => {
    eq: (column: string, value: unknown) => ReturnType<MaybeSingleSelectable<T>["select"]>;
    maybeSingle: () => Promise<MaybeSingleQueryResult<T>>;
    single: () => Promise<MaybeSingleQueryResult<T>>;
  };
};

type SummaryQuery = {
  eq: (column: string, value: unknown) => SummaryQuery;
  gte: (column: string, value: string | number) => SummaryQuery;
  order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => SummaryQuery;
  limit: (count: number) => SummaryQuery;
};

type SummarySelectable = {
  select: (columns: string, options?: { count?: "exact"; head?: boolean }) => SummaryQuery;
};

export type QueryClientLike = {
  from: (table: string) => unknown;
};

export type DetailClientLike = QueryClientLike;
export type TestRecordClientLike = QueryClientLike;

export type ViolationCaseTestRecordRow = {
  id: string;
  case_id: string;
  tested_by?: string | null;
  tested_at: string;
  account_id?: string | null;
  passed: boolean;
  note?: string | null;
  account_name_snapshot?: string | null;
  tester?: { id?: string | null; name?: string | null } | { id?: string | null; name?: string | null }[] | null;
  accounts?: { id?: string | null; name?: string | null } | { id?: string | null; name?: string | null }[] | null;
};

export type LoadCaseIdsByVisualTagIds = (
  supabase: QueryClientLike,
  tagIds: string[],
) => Promise<{ caseIds: string[]; error: unknown }>;

export type ViolationsListPayload = {
  data: ViolationsListItemRow[];
  view: ViolationsListView;
  sort: SortKey | null;
  order: SortDirection;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export const GUIDANCE_METHODS = ["oral", "visual", "profile", "comment", "other"] as const;
export const SORT_KEYS = new Set<SortKey>(["conversion_rate", "pass_rate", "usage_count", "created_at"]);
export const STATUS_FILTERS = new Set<StatusFilter>(["pending", "processed"]);
export const PROCESSED_STATUSES = ["verified", "rejected", "archived"];

const VIOLATIONS_LIST_SELECT = `
  id,
  created_at,
  script_text,
  category,
  purpose,
  guidance_method,
  pass_count,
  fail_count,
  usage_count,
  weighted_conversion_rate,
  usage_state,
  promotion_level,
  status
`;

const VIOLATION_DETAIL_SELECT = `
  id,
  created_at,
  submitted_by,
  script_text,
  is_violation,
  category,
  account_id,
  account_name_snapshot,
  team_id,
  scene_description,
  screenshot_paths,
  result,
  tags,
  pass_count,
  fail_count,
  status,
  risk_level,
  admin_conclusion,
  suggested_action,
  reviewed_at,
  purpose,
  script_format,
  total_views,
  total_follows,
  usage_count,
  weighted_conversion_rate,
  platforms,
  guidance_method,
  promotion_level,
  usage_state,
  reviewed_by,
  submitter:profiles!violation_cases_submitted_by_fkey(id, name),
  team:teams(id, name),
  reviewer:profiles!violation_cases_reviewed_by_fkey(id, name)
`;

const VIOLATION_TEST_RECORD_SELECT = `
  id,
  case_id,
  tested_by,
  tested_at,
  account_id,
  passed,
  note,
  account_name_snapshot,
  tester:profiles!violation_test_records_tested_by_fkey(id, name),
  accounts:accounts(id, name)
`;

function buildViolationsListPayload(
  data: ViolationsListItemRow[],
  view: ViolationsListView,
  page: number,
  pageSize: number,
  totalItems: number,
  sort: SortKey | null,
  order: SortDirection,
): ViolationsListPayload {
  return {
    data,
    view,
    sort,
    order,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0,
    },
  };
}

function asAwaitableQuery<T>(value: unknown) {
  return value as AwaitableQuery<T>;
}

function asRangeSelectable<T>(supabase: QueryClientLike) {
  return supabase.from("violation_cases") as RangeSelectable<T>;
}

function asMaybeSingleSelectable<T>(supabase: QueryClientLike) {
  return supabase.from("violation_cases") as MaybeSingleSelectable<T>;
}

function comparePassRate(left: ViolationsListItemRow, right: ViolationsListItemRow, direction: SortDirection) {
  const leftRate = calculatePassRate(left.pass_count ?? null, left.fail_count ?? null) ?? -1;
  const rightRate = calculatePassRate(right.pass_count ?? null, right.fail_count ?? null) ?? -1;
  if (leftRate !== rightRate) {
    return direction === "asc" ? leftRate - rightRate : rightRate - leftRate;
  }

  const leftSamples = (left.pass_count ?? 0) + (left.fail_count ?? 0);
  const rightSamples = (right.pass_count ?? 0) + (right.fail_count ?? 0);
  if (leftSamples !== rightSamples) return rightSamples - leftSamples;

  const leftCreatedAt = left.created_at ?? "";
  const rightCreatedAt = right.created_at ?? "";
  if (leftCreatedAt !== rightCreatedAt) {
    return direction === "asc"
      ? leftCreatedAt.localeCompare(rightCreatedAt)
      : rightCreatedAt.localeCompare(leftCreatedAt);
  }

  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

export function applyStatusFilter<T extends RangeQuery<ViolationsListItemRow>>(query: T, status: string) {
  if (STATUS_FILTERS.has(status as StatusFilter)) {
    return status === "pending"
      ? query.eq("status", "submitted")
      : query.in("status", PROCESSED_STATUSES);
  }

  return query.eq("status", status);
}

export async function loadViolationsList({
  supabase,
  view,
  page,
  pageSize,
  from,
  to,
  status,
  category,
  teamId,
  search,
  sort,
  order,
  guidanceMethod,
  visualTagIds,
  loadCaseIdsByVisualTagIds,
}: {
  supabase: QueryClientLike;
  view: ViolationsListView;
  page: number;
  pageSize: number;
  from: number;
  to: number;
  status?: string | null;
  category?: string | null;
  teamId?: string | null;
  search?: string | null;
  sort: SortKey | null;
  order: SortDirection;
  guidanceMethod?: string | null;
  visualTagIds?: string[];
  loadCaseIdsByVisualTagIds?: LoadCaseIdsByVisualTagIds;
}): Promise<{ payload: ViolationsListPayload | null; errorMessage: string | null }> {
  const visualTagIdList = visualTagIds?.map((item) => item.trim()).filter(Boolean) ?? [];
  let visualTagCaseIds: string[] | null = null;

  if (visualTagIdList.length > 0) {
    if (!loadCaseIdsByVisualTagIds) {
      return { payload: null, errorMessage: "画面标签筛选器未初始化" };
    }

    const { caseIds, error } = await loadCaseIdsByVisualTagIds(
      supabase,
      Array.from(new Set(visualTagIdList)),
    );
    if (error) {
      return { payload: null, errorMessage: "获取画面标签筛选失败" };
    }
    visualTagCaseIds = caseIds;
    if (caseIds.length === 0) {
      return {
        payload: buildViolationsListPayload([], view, page, pageSize, 0, sort, order),
        errorMessage: null,
      };
    }
  }

  const usesInMemoryPassRateSort = sort === "pass_rate";
  let query = asRangeSelectable<ViolationsListItemRow>(supabase)
    .select(
      VIOLATIONS_LIST_SELECT,
      usesInMemoryPassRateSort ? undefined : { count: "exact" },
    )
    .eq("is_deleted", false)
    .eq("purpose", "violation");

  if (status) {
    query = applyStatusFilter(query, status);
  }

  if (category) {
    query = query.eq("category", category);
  }

  if (teamId) {
    query = query.eq("team_id", teamId);
  }

  if (search) {
    query = query.ilike("script_text", `%${search}%`);
  }

  if (guidanceMethod) {
    query = query.eq("guidance_method", guidanceMethod);
  }

  if (visualTagCaseIds && visualTagCaseIds.length > 0) {
    query = query.in("id", visualTagCaseIds);
  }

  if (view === "staff") {
    query = query
      .eq("status", "verified")
      .in("usage_state", ["available", "testing"]);
  }

  let orderedQuery = query;
  switch (sort) {
    case "conversion_rate":
      orderedQuery = orderedQuery
        .order("weighted_conversion_rate", { ascending: order === "asc", nullsFirst: false })
        .order("usage_count", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      break;
    case "usage_count":
      orderedQuery = orderedQuery
        .order("usage_count", { ascending: order === "asc", nullsFirst: false })
        .order("weighted_conversion_rate", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      break;
    case "created_at":
      orderedQuery = orderedQuery.order("created_at", { ascending: order === "asc" });
      break;
    case "pass_rate":
      orderedQuery = orderedQuery
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
      break;
    default:
      orderedQuery = orderedQuery
        .order("status", { ascending: true })
        .order("reviewed_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      break;
  }

  if (usesInMemoryPassRateSort) {
    const { data, error } = await asAwaitableQuery<ViolationsListItemRow>(orderedQuery);
    if (error) {
      return { payload: null, errorMessage: "获取违规话术列表失败" };
    }

    const rows = (data ?? []).slice().sort((left, right) => comparePassRate(left, right, order));
    return {
      payload: buildViolationsListPayload(rows.slice(from, to + 1), view, page, pageSize, rows.length, sort, order),
      errorMessage: null,
    };
  }

  const { data, error, count } = await orderedQuery.range(from, to);
  if (error) {
    return { payload: null, errorMessage: "获取违规话术列表失败" };
  }

  return {
    payload: buildViolationsListPayload(data ?? [], view, page, pageSize, count ?? 0, sort, order),
    errorMessage: null,
  };
}

async function runDetailLookup(
  client: DetailClientLike,
  id: string,
  purpose?: "conversion",
) {
  let query = asMaybeSingleSelectable<ViolationCaseDetailRow>(client)
    .select(VIOLATION_DETAIL_SELECT)
    .eq("id", id)
    .eq("is_deleted", false);

  if (purpose) {
    query = query.eq("purpose", purpose);
  }

  if (typeof query.maybeSingle === "function") {
    return query.maybeSingle();
  }
  return query.single();
}

export async function loadViolationCaseDetail({
  supabase,
  id,
  fallbackDetailClient,
}: {
  supabase: DetailClientLike;
  id: string;
  fallbackDetailClient?: DetailClientLike;
}): Promise<{ data: ViolationCaseDetailRow | null; errorMessage: string | null }> {
  const primary = await runDetailLookup(supabase, id);
  if (primary.data) {
    return { data: primary.data, errorMessage: null };
  }

  if (fallbackDetailClient) {
    const fallback = await runDetailLookup(fallbackDetailClient, id, "conversion");
    if (fallback.data) {
      return { data: fallback.data, errorMessage: null };
    }
    if (fallback.error) {
      return { data: null, errorMessage: "加载案例失败" };
    }
  }

  if (primary.error) {
    return { data: null, errorMessage: "加载案例失败" };
  }

  return { data: null, errorMessage: null };
}

export async function loadViolationCaseTestRecords({
  supabase,
  caseId,
}: {
  supabase: TestRecordClientLike;
  caseId: string;
}): Promise<{ data: ViolationCaseTestRecordRow[]; errorMessage: string | null }> {
  const { data, error } = await (supabase.from("violation_test_records") as {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{ data: ViolationCaseTestRecordRow[] | null; error: unknown }>;
      };
    };
  })
    .select(VIOLATION_TEST_RECORD_SELECT)
    .eq("case_id", caseId)
    .order("tested_at", { ascending: false });

  if (error) {
    return { data: [], errorMessage: "加载测试记录失败" };
  }

  return { data: (data ?? []) as ViolationCaseTestRecordRow[], errorMessage: null };
}

function fromSummaryTable(supabase: QueryClientLike, table: string) {
  return supabase.from(table) as SummarySelectable;
}

function executeSummaryQuery(query: SummaryQuery) {
  return query as unknown as Promise<QueryResult<Record<string, unknown>>>;
}

export async function loadViolationDashboardSummary({
  supabase,
  now,
}: {
  supabase: QueryClientLike;
  now?: Date;
}): Promise<{ data: DashboardSummaryData | null; errorMessage: string | null }> {
  const weekStart = getUtcWeekStartIso(now);

  const [casesResult, weekViolationsResult, weekAllResult, recentResult, conversionResult] =
    await Promise.all([
      executeSummaryQuery(fromSummaryTable(supabase, "violation_cases")
        .select("id, script_text, pass_count, fail_count")
        .eq("is_deleted", false)
        .eq("purpose", "violation")
        .eq("status", "verified")),

      executeSummaryQuery(fromSummaryTable(supabase, "violation_cases")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", false)
        .eq("purpose", "violation")
        .eq("status", "verified")
        .gte("created_at", weekStart)),

      executeSummaryQuery(fromSummaryTable(supabase, "violation_cases")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", false)
        .gte("created_at", weekStart)),

      executeSummaryQuery(fromSummaryTable(supabase, "violation_cases")
        .select(
          `id, script_text, created_at, risk_level,
           submitter:profiles!violation_cases_submitted_by_fkey(name)`,
        )
        .eq("is_deleted", false)
        .eq("purpose", "violation")
        .eq("status", "verified")
        .order("reviewed_at", { ascending: false, nullsFirst: false })
        .limit(3)),

      executeSummaryQuery(fromSummaryTable(supabase, "violation_cases")
        .select("id, script_text, total_views, total_follows, usage_count, weighted_conversion_rate")
        .eq("is_deleted", false)
        .eq("purpose", "conversion")
        .eq("status", "verified")
        .gte("usage_count", 3)
        .order("weighted_conversion_rate", { ascending: false, nullsFirst: false })
        .limit(5)),
    ]);

  const firstError =
    casesResult.error
    ?? weekViolationsResult.error
    ?? weekAllResult.error
    ?? recentResult.error
    ?? conversionResult.error;

  if (firstError) {
    return { data: null, errorMessage: "获取 Dashboard 数据失败" };
  }

  return {
    data: {
      dangerousTop3: selectDangerousTop3((casesResult.data ?? []) as DashboardCaseRow[]),
      safeTop3: selectSafeTop3((casesResult.data ?? []) as DashboardCaseRow[]),
      conversionTop3: selectConversionTop3((conversionResult.data ?? []) as DashboardConversionRow[]),
      weeklyStats: {
        newViolations: weekViolationsResult.count ?? 0,
        newCases: weekAllResult.count ?? 0,
      },
      recentViolations: mapRecentViolations((recentResult.data ?? []) as DashboardRecentRow[]),
    },
    errorMessage: null,
  };
}
