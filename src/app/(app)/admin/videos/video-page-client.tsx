"use client";

import { useCallback, useState, startTransition, useEffect } from "react";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import type { TeamOption } from "@/lib/teams";
import { VideoList } from "./video-list";
import type { AdminVideosPageData } from "@/lib/loaders/admin-videos-page";
import type { UserPermissionInfo } from "@/lib/permissions";

type VideoView = "pending" | "all" | "trash";

interface VideoPageClientProps {
  initialView: VideoView;
  initialData: AdminVideosPageData;
  initialPerspective: AdminDataPerspective;
  initialTeamId: string | null;
  canSwitchPerspective: boolean;
  teams: TeamOption[];
  permissionInfo: UserPermissionInfo;
}

function buildVideoPageUrl(view: VideoView, perspective: AdminDataPerspective, teamId: string | null) {
  const params = new URLSearchParams({ view, scope: perspective });
  if (perspective === "team" && teamId) params.set("teamId", teamId);
  return `/admin/videos?${params.toString()}`;
}

function buildVideoApiUrl(view: VideoView, perspective: AdminDataPerspective, teamId: string | null) {
  const params = new URLSearchParams({ view, scope: perspective, mode: "full" });
  if (perspective === "team" && teamId) params.set("teamId", teamId);
  return `/api/admin/videos/list?${params.toString()}`;
}

export function VideoPageClient({
  initialView,
  initialData,
  initialPerspective,
  initialTeamId,
  canSwitchPerspective,
  teams,
  permissionInfo,
}: VideoPageClientProps) {
  const [view, setView] = useState<VideoView>(initialView);
  const [data, setData] = useState<AdminVideosPageData>(initialData);
  const [perspective, setPerspective] = useState<AdminDataPerspective>(initialPerspective);
  const [teamId, setTeamId] = useState<string | null>(initialTeamId);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeferredLoading, setIsDeferredLoading] = useState(false);

  const canAccessTrash = permissionInfo.role === "owner" || permissionInfo.role === "admin";

  useEffect(() => {
    if (initialView === "trash" && !canAccessTrash) {
      setView("pending");
      window.history.replaceState({}, "", buildVideoPageUrl("pending", initialPerspective, initialTeamId));
    }
  }, [initialView, canAccessTrash, initialPerspective, initialTeamId]);

  const loadData = useCallback(async (
    nextView: VideoView,
    nextPerspective: AdminDataPerspective,
    nextTeamId: string | null,
    options: { background?: boolean } = {},
  ) => {
    if (!options.background) setIsLoading(true);
    try {
      const res = await fetch(buildVideoApiUrl(nextView, nextPerspective, nextTeamId));
      if (!res.ok) throw new Error("加载失败");
      const nextData = (await res.json()) as AdminVideosPageData;
      startTransition(() => {
        setData(nextData);
        setView(nextView);
        setPerspective(nextPerspective);
        setTeamId(nextTeamId);
      });
      if (!options.background) {
        window.history.replaceState({}, "", buildVideoPageUrl(nextView, nextPerspective, nextTeamId));
      }
    } catch {
      // 保持旧数据，静默失败
    } finally {
      if (!options.background) setIsLoading(false);
    }
  }, []);

  const loadDeferredData = useCallback(async () => {
    if (!data.isPartial || isLoading || isDeferredLoading) return;
    setIsDeferredLoading(true);
    try {
      await loadData(view, perspective, teamId, { background: true });
    } finally {
      setIsDeferredLoading(false);
    }
  }, [data.isPartial, isDeferredLoading, isLoading, loadData, perspective, teamId, view]);

  const switchView = useCallback(async (nextView: VideoView) => {
    if (nextView === view) return;
    
    // 如果已经加载了 full data，在 pending 和 all 之间切换无需请求网络，实现无感瞬切
    if (!data.isPartial && view !== "trash" && nextView !== "trash") {
      startTransition(() => {
        setView(nextView);
      });
      window.history.replaceState({}, "", buildVideoPageUrl(nextView, perspective, teamId));
      return;
    }

    await loadData(nextView, perspective, teamId);
  }, [data.isPartial, loadData, perspective, teamId, view]);

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

  return (
    <section
      id="video-asset-list"
      className="flex flex-1 flex-col scroll-mt-8 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4"
    >
      <VideoList
        videos={data.videos}
        snapshots={data.snapshots}
        profiles={data.profiles}
        accounts={data.accounts}
        videoTags={data.videoTags}
        assetLibrary={data.assetLibrary}
        totalCount={data.summary.totalVideos}
        summary={data.summary}
        assetSummary={data.assetSummary}
        hasDeferredData={Boolean(data.isPartial)}
        isDeferredDataLoading={isDeferredLoading}
        onLoadDeferredData={loadDeferredData}
        permissionInfo={permissionInfo}
        view={view}
        perspective={perspective}
        teamId={teamId}
        teams={teams}
        canSwitchPerspective={canSwitchPerspective}
        canAccessTrash={canAccessTrash}
        isLoading={isLoading}
        onSwitchView={switchView}
        onSwitchPerspective={switchPerspective}
        onSwitchTeam={switchTeam}
        onRefresh={() => loadData(view, perspective, teamId)}
      />
    </section>
  );
}
