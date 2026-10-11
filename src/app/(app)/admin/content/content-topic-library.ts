"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AdminContentPageData } from "@/lib/loaders/admin-content-page";
import type { VideoTopicKind, VideoTopicLibraryStatus } from "@/lib/topics/library";
import { buildTopicLibraryStatusRequests } from "./topic-library-status-request";

type AdminContentVideo = AdminContentPageData["videos"][number];

export type TopicLibraryStatusInfo = {
  status: VideoTopicLibraryStatus;
  subTopicId: string | null;
  /** 视频「话题」分类：干货看收藏率，复盘及其他看点赞率。 */
  topicKind: VideoTopicKind;
};

type TopicLibraryStatusPayload = {
  statuses?: Record<string, TopicLibraryStatusInfo>;
};

export function buildTopicLibraryStatusSignature(videos: Array<Pick<AdminContentVideo, "id">>) {
  return [...videos.map((video) => video.id).filter(Boolean)].sort().join(",");
}

/**
 * 这一轮要不要真的去发请求。
 *
 * 抽成纯函数是为了能直接测「同一个签名连来两次」这个首屏竞态：
 * 签名已成功加载过 → 跳过；同一签名正在途 → 也跳过（这就是 2026-10-11 审计 M2 的修复点，
 * 此前只判「已成功」，于是首屏第二批同签名请求把在途的第一批 abort 掉又原样重发）。
 */
export function shouldLoadTopicLibraryStatus(
  signature: string,
  loadedSignature: string | null,
  pendingSignature: string | null,
): boolean {
  if (signature === loadedSignature) return false;
  if (signature === pendingSignature) return false;
  return true;
}

export function mergeTopicLibraryStatusPayloads(payloads: Array<TopicLibraryStatusPayload | null>) {
  const merged: Record<string, TopicLibraryStatusInfo> = {};
  for (const payload of payloads) {
    if (payload?.statuses) Object.assign(merged, payload.statuses);
  }
  return merged;
}

interface UseContentTopicLibraryArgs {
  videos: AdminContentVideo[];
  canReviewContent: boolean;
  refreshList: () => Promise<unknown>;
}

export function useContentTopicLibrary({
  videos,
  canReviewContent,
  refreshList,
}: UseContentTopicLibraryArgs) {
  const [topicLibraryStatuses, setTopicLibraryStatuses] = useState<Record<string, TopicLibraryStatusInfo>>({});
  // 已成功加载状态的视频 ID 签名；相同签名不重复请求，切换视角/入库操作后置空强制刷新
  const topicStatusKeyRef = useRef<string | null>(null);
  // 正在途中的签名。首屏 videos 会先来一批、随即再变一次，两次签名相同；
  // 而 topicStatusKeyRef 只在成功后才记录，第二次 effect 进来时第一批还没回来，
  // 于是旧请求被 abort、又原样重发一遍——实测每次加载发 12 批、6 批白跑（2026-10-11 审计 M2）。
  // 用「在途签名」在 effect 入口同步拦掉这一轮重复请求。
  const topicStatusPendingSignatureRef = useRef<string | null>(null);
  const topicStatusAbortRef = useRef<AbortController | null>(null);

  const loadTopicLibraryStatuses = useCallback(async (nextVideos: AdminContentVideo[]) => {
    const ids = nextVideos.map((video) => video.id).filter(Boolean);
    const signature = buildTopicLibraryStatusSignature(nextVideos);
    if (!shouldLoadTopicLibraryStatus(signature, topicStatusKeyRef.current, topicStatusPendingSignatureRef.current)) return;
    if (!ids.length) {
      topicStatusKeyRef.current = signature;
      return;
    }
    // 新请求发起时取消仍在途的旧请求，避免过期结果覆盖新列表状态
    topicStatusAbortRef.current?.abort();
    const controller = new AbortController();
    topicStatusAbortRef.current = controller;
    topicStatusPendingSignatureRef.current = signature;
    // 接口单次最多 400 个 ID：全量列表（1800+ 条）必须分批请求后再合并，
    // 否则第 401 名之后的视频永久缺失入库状态与话题分类
    const requests = buildTopicLibraryStatusRequests(ids);
    let failedBatches = 0;
    try {
      const responses = await Promise.all(
        requests.map(async (request) => {
          try {
            const res = await fetch(request.url, { ...request.init, signal: controller.signal });
            if (!res.ok) throw new Error("选题库状态加载失败");
            return (await res.json()) as TopicLibraryStatusPayload;
          } catch (error) {
            if (controller.signal.aborted) throw error;
            failedBatches += 1;
            return null;
          }
        }),
      );
      if (controller.signal.aborted) return;
      const merged = mergeTopicLibraryStatusPayloads(responses);
      if (Object.keys(merged).length === 0) {
        toast.error("选题库状态加载失败，请稍后重试");
        return;
      }
      // 部分批次失败时不记录签名，下次列表变化会重试；未覆盖的视频按「话题未识别」处理（不出评级）
      if (failedBatches === 0) {
        topicStatusKeyRef.current = signature;
      } else {
        toast.error(`选题库状态有 ${failedBatches} 批未加载成功，未覆盖的视频暂不显示入库状态与评级`);
      }
      setTopicLibraryStatuses(merged);
    } catch {
      if (controller.signal.aborted) return;
      toast.error("选题库状态加载失败，请稍后重试");
    } finally {
      // 只有「自己仍是最新一次请求」时才清在途标记：
      // 被后来者 abort 的旧请求若在这里清掉，会把新请求的标记误删，重复请求防护就失效了
      if (topicStatusAbortRef.current === controller) {
        topicStatusPendingSignatureRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!canReviewContent) {
      setTopicLibraryStatuses({});
      return;
    }
    // 列表变化时按需拉取选题库状态（请求生命周期状态）
    void loadTopicLibraryStatuses(videos);
  }, [canReviewContent, loadTopicLibraryStatuses, videos]);

  const videosWithLibraryStatus = useMemo(
    () => videos.map((video) => ({
      ...video,
      topic_library_status: topicLibraryStatuses[video.id]?.status ?? null,
      topic_library_sub_topic_id: topicLibraryStatuses[video.id]?.subTopicId ?? null,
    })),
    [topicLibraryStatuses, videos],
  );

  const toggleTopicLibrary = useCallback(async (videoId: string, action: "remove" | "restore") => {
    const subTopicId = topicLibraryStatuses[videoId]?.subTopicId ?? null;
    if (!subTopicId) {
      throw new Error("未找到该视频对应的选题记录，无法操作");
    }
    const res = await fetch("/api/admin/topics-library/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subTopicId, action }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || "操作失败，请重试");
    }
    // 入库状态已在服务端变更，置空签名让列表刷新后强制重算该列表状态；
    // 在途标记也要一起清，否则新列表签名若与在途请求相同会被误判为「正在途」而跳过刷新
    topicStatusKeyRef.current = null;
    topicStatusPendingSignatureRef.current = null;
    await refreshList();
  }, [refreshList, topicLibraryStatuses]);

  return {
    topicLibraryStatuses,
    videosWithLibraryStatus,
    toggleTopicLibrary,
  };
}

export type { AdminContentVideo };
