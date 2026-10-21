import { useEffect } from "react";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";
import { parseContentListFilters, writeContentListFilters, type ContentListFilterValue } from "./content-list-filters";

type ContentView = "all" | "trash";

type ContentVideoNavigationInput = {
  view: ContentView;
  perspective: AdminDataPerspective;
  teamId: string | null;
  videoId: string | null;
  filters?: Partial<ContentListFilterValue>;
  /**
   * 当前地址栏的原始查询串（可带 "?"）。
   *
   * 打开/关闭作品详情时需要重建地址栏，而 filters 只覆盖 5 个键——排序、异常开关、
   * 流量档位、质量等级、选题库状态等都不在其中，会被静默丢掉。
   * 表现为「在按互动率升序找最差的视图里点开一条作品，关掉后排序变回发布时间」（2026-10-11 审计 M1）。
   * 传入原始查询串后，除 view/scope/teamId/videoId 由本函数接管外其余参数原样保留，
   * 后续新增筛选参数也不必再来这里补白名单。
   */
  search?: string;
};

type ContentVideoListNavigationInput = Omit<ContentVideoNavigationInput, "videoId">;

type ContentPageStateFromSearchOptions = {
  canSwitchPerspective: boolean;
  availableTeamIds: string[];
  fallbackTeamId: string | null;
};

export type ContentVideoNavigationAction = {
  href: string;
  method: "push" | "replace";
  options: { scroll: false };
};

export function buildContentPageUrl({
  view,
  perspective,
  teamId,
  videoId,
  filters,
  search,
}: ContentVideoNavigationInput) {
  // 以当前查询串为底，再覆盖由本函数接管的键：这样排序等其余筛选不会在
  // 打开/关闭详情时被悄悄丢掉（审计 M1）
  const params = new URLSearchParams(search?.startsWith("?") ? search.slice(1) : (search ?? ""));
  params.set("view", view);
  params.set("scope", perspective);
  if (perspective === "team" && teamId) params.set("teamId", teamId);
  else params.delete("teamId");
  if (videoId) params.set("videoId", videoId);
  else params.delete("videoId");
  const listFilters = { ...parseContentListFilters(params), ...filters };
  const serializedFilters = writeContentListFilters(params, listFilters);
  serializedFilters.delete("highlightRules");
  return `/admin/content?${serializedFilters.toString()}`;
}

export function resolveContentVideoPosition({
  videoIds,
  selectedVideoId,
  pageStartIndex,
  totalVideos,
}: {
  videoIds: string[];
  selectedVideoId: string | null;
  pageStartIndex: number;
  totalVideos: number;
}) {
  const pageIndex = selectedVideoId ? videoIds.indexOf(selectedVideoId) : -1;
  const currentIndex = pageIndex < 0 ? -1 : pageStartIndex + pageIndex;
  return {
    pageIndex,
    currentIndex,
    totalCount: totalVideos,
    hasPrev: currentIndex > 0,
    hasNext: currentIndex >= 0 && currentIndex < totalVideos - 1,
  };
}

export function buildOpenContentVideoNavigation(input: ContentVideoNavigationInput): ContentVideoNavigationAction {
  return {
    href: buildContentPageUrl(input),
    method: "push",
    options: { scroll: false },
  };
}

export function buildStepContentVideoNavigation(input: ContentVideoNavigationInput): ContentVideoNavigationAction {
  return {
    href: buildContentPageUrl(input),
    method: "replace",
    options: { scroll: false },
  };
}

export function buildCloseContentVideoNavigation(input: ContentVideoListNavigationInput): ContentVideoNavigationAction {
  return {
    href: buildContentPageUrl({ ...input, videoId: null }),
    method: "push",
    options: { scroll: false },
  };
}

function normalizeContentView(value: string | null): ContentView {
  return value === "trash" ? value : "all";
}

export function resolveContentPageStateFromSearch(
  search: string,
  options: ContentPageStateFromSearchOptions,
): ContentVideoNavigationInput {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const requestedPerspective = params.get("scope") === "team" ? "team" : "company";
  const resolvedScope = resolveAdminDataPerspective({
    requestedPerspective,
    requestedTeamId: params.get("teamId"),
    canUseCompanyPerspective: options.canSwitchPerspective,
    availableTeamIds: options.availableTeamIds,
    fallbackTeamId: options.fallbackTeamId,
  });
  const videoId = params.get("videoId")?.trim() || null;
  const filters = {
    userId: params.get("userId") ?? "",
    accountId: params.get("accountId") ?? "",
    startDate: params.get("startDate") ?? "",
    endDate: params.get("endDate") ?? "",
    keyword: params.get("keyword") ?? "",
  };
  const hasFilters = Object.values(filters).some(Boolean);

  return {
    view: normalizeContentView(params.get("view")),
    perspective: resolvedScope.perspective,
    teamId: resolvedScope.teamId,
    videoId,
    ...(hasFilters ? { filters } : {}),
  };
}

export function useContentVideoStepShortcut({
  open,
  onStepVideo,
  hasPrev,
  hasNext,
  disabled = false,
}: {
  open: boolean;
  onStepVideo?: (direction: "prev" | "next") => void;
  hasPrev: boolean;
  hasNext: boolean;
  disabled?: boolean;
}) {
  useEffect(() => {
    if (!open || !onStepVideo || disabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "[" || (e.altKey && e.key === "ArrowLeft")) {
        e.preventDefault();
        if (hasPrev) onStepVideo("prev");
      } else if (e.key === "]" || (e.altKey && e.key === "ArrowRight")) {
        e.preventDefault();
        if (hasNext) onStepVideo("next");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onStepVideo, hasPrev, hasNext, disabled]);
}

