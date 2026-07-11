"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AdviceAction, AdviceSource, AdviceStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { feedbackToast } from "@/components/ui/feedback-toast";

type AdviceRow = Pick<
  AdviceAction,
  | "id"
  | "advice_content"
  | "advice_source"
  | "status"
  | "executed_video_id"
  | "evidence"
  | "created_at"
>;

type VideoOption = {
  id: string;
  video_title: string | null;
  content: string | null;
  published_at: string | null;
};

type PatchResponse = {
  ok?: boolean;
  error?: string;
  action?: AdviceAction;
};

const ACTIVE_STATUSES: AdviceStatus[] = ["待查看", "已查看", "待执行"];

function getSourceLabel(source: AdviceSource) {
  return source === "ai" ? "AI建议" : "人工建议";
}

function getStatusVariant(status: AdviceStatus): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "待查看":
      return "default";
    case "待执行":
      return "secondary";
    case "已忽略":
      return "destructive";
    default:
      return "outline";
  }
}

function getAdviceSummary(content: string) {
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ?? "未填写建议内容";
}

function getVideoLabel(video: VideoOption) {
  const title = video.video_title?.trim() || video.content?.trim() || "未命名视频";
  const dateText = video.published_at ? video.published_at.slice(5, 10) : "未填日期";
  return `${title} · ${dateText}`;
}

export function AdvicePanel() {
  const supabase = useMemo(() => createClient(), []);
  const [adviceList, setAdviceList] = useState<AdviceRow[]>([]);
  const [videoOptions, setVideoOptions] = useState<VideoOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [executingAdviceId, setExecutingAdviceId] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (isMounted) {
            setAdviceList([]);
            setVideoOptions([]);
          }
          return;
        }

        const [{ data: adviceData, error: adviceError }, { data: videoData, error: videoError }] =
          await Promise.all([
            supabase
              .from("advice_actions")
              .select("id, advice_content, advice_source, status, executed_video_id, evidence, created_at")
              .eq("target_user_id", user.id)
              .in("status", ACTIVE_STATUSES)
              .order("created_at", { ascending: false }),
            supabase
              .from("videos")
              .select("id, video_title, content, published_at")
              .eq("user_id", user.id)
              .order("published_at", { ascending: false })
              .order("created_at", { ascending: false }),
          ]);

        if (adviceError) throw adviceError;
        if (videoError) throw videoError;

        if (!isMounted) return;

        setAdviceList((adviceData ?? []) as AdviceRow[]);
        setVideoOptions((videoData ?? []) as VideoOption[]);
      } catch (error) {
        if (!isMounted) return;
        feedbackToast.error((error as Error).message || "建议加载失败，请稍后重试");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  async function updateAdviceStatus(adviceId: string, status: AdviceStatus, executedVideoId?: string | null) {
    const previousList = adviceList;
    const targetAdvice = previousList.find((item) => item.id === adviceId);
    if (!targetAdvice) return false;

    setPendingId(adviceId);
    setAdviceList((current) => {
      if (ACTIVE_STATUSES.includes(status)) {
        return current.map((item) =>
          item.id === adviceId
            ? {
                ...item,
                status,
                executed_video_id: executedVideoId ?? item.executed_video_id,
              }
            : item
        );
      }

      return current.filter((item) => item.id !== adviceId);
    });
    feedbackToast.success(`已更新为${status}`);

    try {
      const response = await fetch("/api/advice-action", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: adviceId,
          status,
          executed_video_id: executedVideoId,
        }),
      });

      const payload = (await response.json()) as PatchResponse;

      if (!response.ok || !payload.action) {
        throw new Error(payload.error || "状态更新失败");
      }

      if (["待查看", "已查看", "待执行"].includes(payload.action.status)) {
        setAdviceList((current) =>
          current.map((item) =>
            item.id === adviceId
              ? {
                  ...item,
                  status: payload.action!.status,
                  executed_video_id: payload.action!.executed_video_id,
                }
              : item
          )
        );
      } else {
        setAdviceList((current) => current.filter((item) => item.id !== adviceId));
      }
      return true;
    } catch (error) {
      setAdviceList(previousList);
      feedbackToast.error((error as Error).message || "状态更新失败");
      return false;
    } finally {
      setPendingId(null);
    }
  }

  async function handleExecuteConfirm() {
    if (!executingAdviceId) return;

    if (!selectedVideoId) {
      feedbackToast.error("请先选择关联视频");
      return;
    }

    const ok = await updateAdviceStatus(executingAdviceId, "已执行", selectedVideoId);

    if (ok) {
      setExecutingAdviceId(null);
      setSelectedVideoId("");
    }
  }

  if (isLoading) {
    return <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-[13px] text-stone-500">建议加载中...</div>;
  }

  if (adviceList.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-3">
        {adviceList.map((advice) => {
          const isPending = pendingId === advice.id;
          return (
            <div
              key={advice.id}
              className="space-y-3 rounded-xl border border-stone-200 bg-white px-4 py-4 transition-[background-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getStatusVariant(advice.status)}>{advice.status}</Badge>
                    <Badge variant="outline">{getSourceLabel(advice.advice_source)}</Badge>
                  </div>
                  <p className="text-[13px] font-medium leading-[1.7] text-stone-700">{getAdviceSummary(advice.advice_content)}</p>
                  {advice.evidence ? (
                    <p className="text-[12px] leading-[1.7] text-stone-500">来源依据：{advice.evidence}</p>
                  ) : null}
                </div>
                <span className="text-[12px] tabular-nums text-stone-500">{advice.created_at.slice(5, 10)}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending || advice.status === "已查看"}
                  onClick={() => void updateAdviceStatus(advice.id, "已查看")}
                >
                  标记已查看
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending || advice.status === "待执行"}
                  onClick={() => void updateAdviceStatus(advice.id, "待执行")}
                >
                  标记待执行
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => void updateAdviceStatus(advice.id, "已忽略")}
                >
                  标记已忽略
                </Button>
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    setExecutingAdviceId(advice.id);
                    setSelectedVideoId(advice.executed_video_id ?? "");
                  }}
                >
                  标记已执行
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={Boolean(executingAdviceId)}
        onOpenChange={(open) => {
          if (!open) {
            setExecutingAdviceId(null);
            setSelectedVideoId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-[18px] font-medium tracking-tight text-stone-700">关联已执行视频</DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.7] text-stone-500">选择你已发布或已提交的视频，系统会把这条建议标记为已执行。</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-[13px] font-medium text-stone-700">选择视频</p>
            <Select
              value={selectedVideoId}
              onValueChange={(value) => setSelectedVideoId(value ?? "")}
              items={videoOptions.map((video) => ({ value: video.id, label: getVideoLabel(video) }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={videoOptions.length ? "请选择视频" : "暂无可关联视频"} />
              </SelectTrigger>
              <SelectContent>
                {videoOptions.map((video) => (
                  <SelectItem key={video.id} value={video.id}>
                    {getVideoLabel(video)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setExecutingAdviceId(null);
              setSelectedVideoId("");
            }}>
              取消
            </Button>
            <Button onClick={() => void handleExecuteConfirm()} disabled={pendingId === executingAdviceId || videoOptions.length === 0}>
              确认标记
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
