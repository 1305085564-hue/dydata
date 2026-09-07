import type { AdminDataPerspective } from "@/lib/admin-data-perspective";

type ContentView = "pending" | "all";

type ContentVideoNavigationInput = {
  view: ContentView;
  perspective: AdminDataPerspective;
  teamId: string | null;
  videoId: string | null;
};

type ContentVideoListNavigationInput = Omit<ContentVideoNavigationInput, "videoId">;

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
