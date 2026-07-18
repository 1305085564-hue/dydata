"use client";

import { useCallback, useState, startTransition } from "react";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import type { TeamOption } from "@/lib/teams";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VideoList } from "./video-list";
import type { AdminVideosPageData } from "@/lib/loaders/admin-videos-page";

type VideoView = "pending" | "all";

interface VideoPageClientProps {
  initialView: VideoView;
  initialData: AdminVideosPageData;
  initialPerspective: AdminDataPerspective;
  initialTeamId: string | null;
  canSwitchPerspective: boolean;
  teams: TeamOption[];
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
}: VideoPageClientProps) {
  const [view, setView] = useState<VideoView>(initialView);
  const [data, setData] = useState<AdminVideosPageData>(initialData);
  const [perspective, setPerspective] = useState<AdminDataPerspective>(initialPerspective);
  const [teamId, setTeamId] = useState<string | null>(initialTeamId);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeferredLoading, setIsDeferredLoading] = useState(false);
  const selectedTeamName = teams.find((team) => team.id === teamId)?.name;

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
    await loadData(nextView, perspective, teamId);
  }, [loadData, perspective, teamId, view]);

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
      className="flex flex-1 flex-col scroll-mt-8 space-y-3 rounded-2xl border border-stone-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-stone-50 p-0.5"
            title="待处理 = 未打标 或 状态异常"
          >
            <button
              type="button"
              onClick={() => switchView("pending")}
              disabled={isLoading}
              className={[
                "rounded-md px-3 py-1 text-[12px] tracking-tight transition-colors",
                view === "pending"
                  ? "border border-stone-200 bg-white text-stone-900"
                  : "text-stone-500 hover:text-stone-700",
              ].join(" ")}
            >
              待处理
              <span className="ml-1.5 text-[12px] tabular-nums text-[#B4532F]">
                {data.summary.pendingCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => switchView("all")}
              disabled={isLoading}
              className={[
                "rounded-md px-3 py-1 text-[12px] tracking-tight transition-colors",
                view === "all"
                  ? "border border-stone-200 bg-white text-stone-900"
                  : "text-stone-500 hover:text-stone-700",
              ].join(" ")}
            >
              全部
              <span className="ml-1.5 text-[12px] tabular-nums text-stone-500">
                {data.summary.totalVideos}
              </span>
            </button>
          </div>

          {canSwitchPerspective ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                <button
                  type="button"
                  onClick={() => switchPerspective("company")}
                  disabled={isLoading}
                  className={[
                    "rounded-md px-3 py-1 text-[12px] tracking-tight transition-colors",
                    perspective === "company"
                      ? "border border-stone-200 bg-white text-stone-900"
                      : "text-stone-500 hover:text-stone-700",
                  ].join(" ")}
                >
                  公司视角
                </button>
                <button
                  type="button"
                  onClick={() => switchPerspective("team")}
                  disabled={isLoading}
                  className={[
                    "rounded-md px-3 py-1 text-[12px] tracking-tight transition-colors",
                    perspective === "team"
                      ? "border border-stone-200 bg-white text-stone-900"
                      : "text-stone-500 hover:text-stone-700",
                  ].join(" ")}
                >
                  团队视角
                </button>
              </div>

              {perspective === "team" && teams.length > 0 ? (
                <Select value={teamId ?? teams[0]?.id} onValueChange={switchTeam}>
                  <SelectTrigger className="h-9 min-w-36 rounded-lg border-stone-200 bg-white text-[12px] text-stone-700">
                    <SelectValue placeholder="选择团队">
                      {selectedTeamName ?? undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-stone-500">
          <span>
            已入库
            <span className="ml-0.5 tabular-nums text-[#3F7A4E]">
              {data.assetSummary.readyCount}
            </span>
          </span>
          <span>
            待整理
            <span className="ml-0.5 tabular-nums text-[#8F641B]">
              {data.assetSummary.pendingLibraryCount}
            </span>
          </span>
          <span>
            已评级
            <span className="ml-0.5 tabular-nums text-stone-700">
              {data.assetSummary.gradedCount}
            </span>
          </span>
          <span className="pl-2 text-[13px] font-medium text-stone-500">素材库</span>
        </div>
      </div>

      <VideoList
        videos={data.videos}
        snapshots={data.snapshots}
        profiles={data.profiles}
        accounts={data.accounts}
        videoTags={data.videoTags}
        assetLibrary={data.assetLibrary}
        totalCount={data.summary.totalVideos}
        hasDeferredData={Boolean(data.isPartial)}
        isDeferredDataLoading={isDeferredLoading}
        onLoadDeferredData={loadDeferredData}
      />
    </section>
  );
}
