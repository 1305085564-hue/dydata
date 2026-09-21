import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";

type ContentView = "all" | "trash";

type ContentVideoNavigationInput = {
  view: ContentView;
  perspective: AdminDataPerspective;
  teamId: string | null;
  videoId: string | null;
  filters?: {
    userId?: string;
    accountId?: string;
    startDate?: string;
    endDate?: string;
    keyword?: string;
  };
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
}: ContentVideoNavigationInput) {
  const params = new URLSearchParams({ view, scope: perspective });
  if (perspective === "team" && teamId) params.set("teamId", teamId);
  if (videoId) params.set("videoId", videoId);
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value) params.set(key, String(value));
  }
  return `/admin/content?${params.toString()}`;
}

export function buildOpenContentVideoNavigation(input: ContentVideoNavigationInput): ContentVideoNavigationAction {
  return {
    href: buildContentPageUrl(input),
    method: "push",
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
