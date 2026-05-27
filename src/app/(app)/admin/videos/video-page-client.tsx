"use client";

import { useCallback, useState } from "react";
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
  const params = new URLSearchParams({ view, scope: perspective });
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
  const selectedTeamName = teams.find((team) => team.id === teamId)?.name;

  const loadData = useCallback(async (nextView: VideoView, nextPerspective: AdminDataPerspective, nextTeamId: string | null) => {
    setIsLoading(true);
    try {
      const res = await fetch(buildVideoApiUrl(nextView, nextPerspective, nextTeamId));
      if (!res.ok) throw new Error("加载失败");
      const nextData = (await res.json()) as AdminVideosPageData;
      setData(nextData);
      setView(nextView);
      setPerspective(nextPerspective);
      setTeamId(nextTeamId);
      window.history.replaceState({}, "", buildVideoPageUrl(nextView, nextPerspective, nextTeamId));
    } catch {
      // 保持旧数据，静默失败
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      className="scroll-mt-8 space-y-3 rounded-2xl border border-zinc-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
            title="待处理 = 未打标 或 状态异常"
          >
            <button
              type="button"
              onClick={() => switchView("pending")}
              disabled={isLoading}
              className={[
                "rounded-md px-3 py-1 text-[12px] tracking-tight transition-colors",
                view === "pending"
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              待处理
              <span className="ml-1.5 font-mono text-[11px] tabular-nums text-[#D97757]">
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
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              全部
              <span className="ml-1.5 font-mono text-[11px] tabular-nums text-zinc-400">
                {data.summary.totalVideos}
              </span>
            </button>
          </div>

          {canSwitchPerspective ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                <button
                  type="button"
                  onClick={() => switchPerspective("company")}
                  disabled={isLoading}
                  className={[
                    "rounded-md px-3 py-1 text-[12px] tracking-tight transition-colors",
                    perspective === "company"
                      ? "bg-white text-zinc-800 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700",
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
                      ? "bg-white text-zinc-800 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700",
                  ].join(" ")}
                >
                  团队视角
                </button>
              </div>

              {perspective === "team" && teams.length > 0 ? (
                <Select value={teamId ?? teams[0]?.id} onValueChange={switchTeam}>
                  <SelectTrigger className="h-9 min-w-36 rounded-lg border-zinc-200 bg-white text-[12px] text-zinc-700">
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

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500">
          <span>
            已入库
            <span className="ml-0.5 font-mono tabular-nums text-[#6FAA7D]">
              {data.assetSummary.readyCount}
            </span>
          </span>
          <span>
            待整理
            <span className="ml-0.5 font-mono tabular-nums text-[#D99E55]">
              {data.assetSummary.pendingLibraryCount}
            </span>
          </span>
          <span>
            已评级
            <span className="ml-0.5 font-mono tabular-nums text-zinc-700">
              {data.assetSummary.gradedCount}
            </span>
          </span>
          <span className="pl-2 text-[15px] font-medium tracking-tight text-zinc-400">素材库</span>
        </div>
      </div>

      <VideoList
        videos={data.videos}
        snapshots={data.snapshots}
        profiles={data.profiles}
        accounts={data.accounts}
        videoTags={data.videoTags}
        assetLibrary={data.assetLibrary}
      />
    </section>
  );
}
