"use client";

import { useSearchParams } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import type { AdminContentPageData } from "@/lib/loaders/admin-content-page";
import type { TeamOption } from "@/lib/teams";
import { parseContentListFilters } from "./content-list-filters";
import {
  buildContentPageUrl,
  resolveContentPageStateFromSearch,
} from "./content-video-navigation";

type ContentView = "all" | "trash";

type ContentPageQueryOptions = {
  background?: boolean;
  fresh?: boolean;
};

export type ContentPageQueryState = {
  view: ContentView;
  perspective: AdminDataPerspective;
  teamId: string | null;
};

export function buildContentApiUrl(
  view: ContentView,
  perspective: AdminDataPerspective,
  teamId: string | null,
  options: { fresh?: boolean } = {},
) {
  const params = new URLSearchParams({ view, scope: perspective });
  if (perspective === "team" && teamId) params.set("teamId", teamId);
  // 写操作后的首次取数：服务端跳过 60 秒缓存并回填，浏览器也不复用旧响应
  if (options.fresh) params.set("fresh", "1");
  return `/api/admin/content/list?${params.toString()}`;
}

export function readCurrentListFilters() {
  if (typeof window === "undefined") return undefined;
  return parseContentListFilters(new URLSearchParams(window.location.search));
}

export function shouldReloadContentPageList(
  nextState: ContentPageQueryState,
  currentState: ContentPageQueryState,
) {
  return nextState.view !== currentState.view
    || nextState.perspective !== currentState.perspective
    || nextState.teamId !== currentState.teamId;
}

interface UseContentPageQueryArgs {
  initialView: ContentView;
  initialData: AdminContentPageData;
  initialPerspective: AdminDataPerspective;
  initialTeamId: string | null;
  canSwitchPerspective: boolean;
  teams: TeamOption[];
  fallbackTeamId: string | null;
}

export function useContentPageQuery({
  initialView,
  initialData,
  initialPerspective,
  initialTeamId,
  canSwitchPerspective,
  teams,
  fallbackTeamId,
}: UseContentPageQueryArgs) {
  const searchParams = useSearchParams();
  const urlVideoId = searchParams.get("videoId");
  const [view, setView] = useState<ContentView>(initialView);
  const [data, setData] = useState<AdminContentPageData>(initialData);
  const [perspective, setPerspective] = useState<AdminDataPerspective>(initialPerspective);
  const [teamId, setTeamId] = useState<string | null>(initialTeamId);
  const [isLoading, setIsLoading] = useState(false);
  const requestSeq = useRef(0);
  const [clientSelectedVideoId, setClientSelectedVideoId] = useState<string | null | undefined>(undefined);
  const selectedVideoId = clientSelectedVideoId !== undefined ? clientSelectedVideoId : urlVideoId;

  const selectVideo = useCallback(
    (videoId: string) => {
      setClientSelectedVideoId(videoId);
      const newUrl = buildContentPageUrl({
        view,
        perspective,
        teamId,
        videoId,
        filters: readCurrentListFilters(),
      });
      window.history.pushState(null, "", newUrl);
    },
    [perspective, teamId, view],
  );

  const closeVideo = useCallback(() => {
    setClientSelectedVideoId(null);
    const newUrl = buildContentPageUrl({
      view,
      perspective,
      teamId,
      videoId: null,
      filters: readCurrentListFilters(),
    });
    window.history.pushState(null, "", newUrl);
  }, [perspective, teamId, view]);

  const loadData = useCallback(async (
    nextView: ContentView,
    nextPerspective: AdminDataPerspective,
    nextTeamId: string | null,
    options: ContentPageQueryOptions = {},
  ) => {
    const currentSeq = requestSeq.current + 1;
    requestSeq.current = currentSeq;
    if (!options.background) setIsLoading(true);
    try {
      const res = await fetch(buildContentApiUrl(nextView, nextPerspective, nextTeamId, { fresh: options.fresh }));
      if (!res.ok) throw new Error("加载失败");
      const nextData = (await res.json()) as AdminContentPageData;
      if (currentSeq !== requestSeq.current) return false;
      startTransition(() => {
        setData(nextData);
        setView(nextView);
        setPerspective(nextPerspective);
        setTeamId(nextTeamId);
      });
      if (!options.background) {
        // 数据已由上面的客户端 fetch 就地换好；这里只镜像地址栏（可分享、刷新留在当前视图）。
        // 用 history.replaceState 而非 router.replace：后者会让 page.tsx 的 Suspense key 随
        // view/perspective/teamId 变化 → 整块重挂露 TableSkeleton，并再跑一次服务器取数（与上面重复）。
        window.history.replaceState(null, "", buildContentPageUrl({
          view: nextView,
          perspective: nextPerspective,
          teamId: nextTeamId,
          videoId: null,
          filters: readCurrentListFilters(),
        }));
      }
      return true;
    } catch {
      // 保持旧数据，但必须明确告知：静默失败会让人拿着上一次的数当最新证据下判断
      toast.error("列表刷新失败，当前显示的仍是上次的数据");
      return false;
    } finally {
      if (!options.background && currentSeq === requestSeq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const availableTeamIds = teams.length > 0
        ? teams.map((team) => team.id)
        : [fallbackTeamId].filter((id): id is string => Boolean(id));
      const nextState = resolveContentPageStateFromSearch(window.location.search, {
        canSwitchPerspective,
        availableTeamIds,
        fallbackTeamId,
      });
      const currentState = { view, perspective, teamId } satisfies ContentPageQueryState;

      if (shouldReloadContentPageList(nextState, currentState)) {
        setClientSelectedVideoId(null);
        void loadData(
          nextState.view,
          nextState.perspective,
          nextState.teamId,
          { background: true },
        ).then((loaded) => {
          if (loaded) setClientSelectedVideoId(nextState.videoId);
        });
        return;
      }

      setClientSelectedVideoId(nextState.videoId);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [
    canSwitchPerspective,
    fallbackTeamId,
    loadData,
    perspective,
    teamId,
    teams,
    view,
  ]);

  const switchPerspective = useCallback(async (nextPerspective: AdminDataPerspective) => {
    if (nextPerspective === perspective) return;
    const nextTeamId = nextPerspective === "team" ? teamId ?? teams[0]?.id ?? null : teamId;
    await loadData(view, nextPerspective, nextTeamId);
  }, [loadData, perspective, teamId, teams, view]);

  const switchTeam = useCallback(async (nextTeamId: string | null) => {
    if (!nextTeamId) return;
    if (nextTeamId === teamId) return;
    await loadData(view, "team", nextTeamId);
  }, [loadData, teamId, view]);

  return {
    data,
    view,
    perspective,
    teamId,
    isLoading,
    selectedVideoId,
    loadData,
    selectVideo,
    closeVideo,
    switchPerspective,
    switchTeam,
  };
}

export type { ContentView };
