import type { SortField } from "./content-list";
import { DEFAULT_SORT_DIR } from "./content-list";
import type { ContentListFilterValue } from "@/app/(app)/admin/content/content-list-filters";
import {
  parseContentListFilters,
  parseContentListSort,
  resolveEffectiveDates,
} from "@/app/(app)/admin/content/content-list-filters";

export const CONTENT_PAGE_SIZE_OPTIONS = [50, 100, 500] as const;
export const DEFAULT_CONTENT_PAGE_SIZE = 100;

export type ContentListQuery = {
  view: "all" | "trash";
  perspective: "company" | "team";
  teamId: string | null;
  page: number;
  pageSize: number;
  cursor: string | null;
  filters: ContentListFilterValue;
  sortField: SortField;
  sortDir: "asc" | "desc";
};

/** Bind cursors to the server-resolved data scope, never to a request's optional teamId. */
export function bindContentListQueryToEffectiveScope<T extends Pick<ContentListQuery, "perspective" | "teamId">>(
  query: T,
  effectiveTeamId: string | null,
): T {
  return {
    ...query,
    teamId: query.perspective === "team" ? effectiveTeamId : null,
  };
}

export type ContentListCursor = {
  queryFingerprint: string;
  sortValue: string | null;
  id: string;
  direction: "before" | "after";
};

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
export function normalizeContentPageSize(value: string | null) {
  const parsed = positiveInteger(value, DEFAULT_CONTENT_PAGE_SIZE);
  return CONTENT_PAGE_SIZE_OPTIONS.includes(
    parsed as (typeof CONTENT_PAGE_SIZE_OPTIONS)[number],
  )
    ? parsed
    : DEFAULT_CONTENT_PAGE_SIZE;
}

export function normalizeContentPage(value: string | null) {
  return Math.min(positiveInteger(value, 1), 10_000);
}

export function buildContentQueryFingerprint(
  query: Pick<
    ContentListQuery,
    | "view"
    | "perspective"
    | "teamId"
    | "pageSize"
    | "filters"
    | "sortField"
    | "sortDir"
  >,
) {
  return JSON.stringify({
    view: query.view,
    perspective: query.perspective,
    teamId: query.teamId,
    pageSize: query.pageSize,
    filters: query.filters,
    sortField: query.sortField,
    sortDir: query.sortDir,
  });
}

export function encodeContentCursor(cursor: ContentListCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeContentCursor(
  value: string | null,
): ContentListCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ContentListCursor>;
    // sortValue 会被服务端直接转 numeric：只接受 null 或可解析的数字字符串，
    // 其余一律按"游标失效"处理，避免被篡改成非数字时把接口打成 500。
    const sortValueIsNumeric =
      parsed.sortValue === null ||
      (typeof parsed.sortValue === "string" &&
        parsed.sortValue.trim() !== "" &&
        Number.isFinite(Number(parsed.sortValue)));
    if (
      typeof parsed.queryFingerprint !== "string" ||
      typeof parsed.id !== "string" ||
      (parsed.direction !== "before" && parsed.direction !== "after") ||
      !sortValueIsNumeric
    )
      return null;
    return parsed as ContentListCursor;
  } catch {
    return null;
  }
}

export function parseContentListQuery(
  params: Pick<URLSearchParams, "get">,
): Omit<ContentListQuery, "perspective" | "teamId"> {
  const sort = parseContentListSort(params);
  const parsedFilters = parseContentListFilters(params);
  const { effectiveStartDate, effectiveEndDate } =
    resolveEffectiveDates(parsedFilters);
  return {
    view: params.get("view") === "trash" ? "trash" : "all",
    page: normalizeContentPage(params.get("page")),
    pageSize: normalizeContentPageSize(params.get("pageSize")),
    cursor: params.get("cursor"),
    filters: {
      ...parsedFilters,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
    },
    sortField: sort.sortField,
    sortDir: sort.sortDir,
  };
}

export function writeContentListQuery(
  currentParams: URLSearchParams,
  query: Pick<
    ContentListQuery,
    "page" | "pageSize" | "cursor" | "sortField" | "sortDir"
  >,
) {
  const next = new URLSearchParams(currentParams);
  if (query.page > 1) next.set("page", String(query.page));
  else next.delete("page");
  if (query.pageSize !== DEFAULT_CONTENT_PAGE_SIZE)
    next.set("pageSize", String(query.pageSize));
  else next.delete("pageSize");
  if (query.cursor) next.set("cursor", query.cursor);
  else next.delete("cursor");
  if (
    query.sortField === "published_at" &&
    query.sortDir === DEFAULT_SORT_DIR.published_at
  ) {
    next.delete("sort");
    next.delete("dir");
  } else {
    next.set("sort", query.sortField);
    next.set("dir", query.sortDir);
  }
  return next;
}
