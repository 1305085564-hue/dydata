import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";

type ContentView = "pending" | "all";

type ContentVideoNavigationInput = {
  view: ContentView;
  perspective: AdminDataPerspective;
  teamId: string | null;
  videoId: string | null;
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
}: ContentVideoNavigationInput) {
  const params = new URLSearchParams({ view, scope: perspective });
  if (perspective === "team" && teamId) params.set("teamId", teamId);
  if (videoId) params.set("videoId", videoId);
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
  return value === "all" ? "all" : "pending";
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

  return {
    view: normalizeContentView(params.get("view")),
    perspective: resolvedScope.perspective,
    teamId: resolvedScope.teamId,
    videoId,
  };
}
