"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Layers,
  X,
  Smartphone,
  Maximize2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { formatAnomalyStatusText } from "@/lib/video-anomaly";
import type {
  ContentReviewReadiness,
  Video,
  VideoMetricsSnapshot,
} from "@/types";
import type {
  AttributionFinding,
  MultiRefAttributionResult,
} from "@/lib/content-attribution";
import {
  type MetricKey,
} from "@/lib/content-attribution-map";

import {
  buildReviewQueue,
  buildSnapshotMap,
  getMetricWarningReasons,
  type VideoRow,
} from "@/lib/review-queue";
import {
  DEFAULT_VIDEO_REVIEW_THRESHOLDS,
  type VideoReviewThresholds,
} from "@/lib/video-review-thresholds";

function formatRefShortLabel(refKey: string, rawLabel?: string): string {
  if (refKey === "self") return "近三条";
  if (refKey === "team") return "7天均值";
  if (refKey === "top") return "7天最高";
  if (refKey === "user") {
    if (rawLabel) {
      const match = rawLabel.match(/对比(.+)近3条/);
      if (match && match[1] && match[1] !== "指定人") {
        return match[1];
      }
    }
    return "指定成员";
  }
  if (!rawLabel) return refKey;
  if (rawLabel.includes("近3条") || rawLabel.includes("近 3 条") || rawLabel.includes("近三条")) return "近三条";
  if (rawLabel.includes("均值")) return "7天均值";
  if (rawLabel.includes("最高")) return "7天最高";
  return rawLabel.replace(/^对比/, "").replace(/近\s*7\s*天/, "7天").replace(/播放$/, "").trim();
}

interface ContentDiagnosisWorkbenchProps {
  video: VideoRow | null;
  snapshot?: VideoMetricsSnapshot | null;
  onClose: () => void;
  canOperateLifecycle: boolean;
  onLifecycleChanged: () => void;
  profiles?: Array<{ id: string; name: string }>;
  anomalyVideos?: VideoRow[];
  videos?: VideoRow[];
  snapshots?: VideoMetricsSnapshot[];
  reviewReadiness?: Record<string, ContentReviewReadiness>;
  onVideoSelect?: (videoId: string) => void;
  onAnalysisGenerated?: () => void;
  onToggleTopicLibrary?: (
    videoId: string,
    action: "remove" | "restore",
  ) => Promise<void>;
}

type ContentAnalysisResult = {
  insight_result_id?: string;
  data_summary: string;
  suspected_stage: string[];
  key_metric_evidence: string[];
  copywriting_reason: string;
  abnormal_points: string[];
};

const statusBadgeClass: Record<Video["anomaly_status"], string> = {
  normal: "border-[#E2E2DF] bg-[#F1F1F0] text-[#6FAA7D]",
  abnormal: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]",
  正常: "border-[#E2E2DF] bg-[#F1F1F0] text-[#6FAA7D]",
  删稿: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]",
  限流: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]",
  投流: "border-[#B98A54]/30 bg-[#B98A54]/5 text-[#B98A54]",
  活动干预: "border-[#B98A54]/30 bg-[#B98A54]/5 text-[#B98A54]",
  未满24h: "border-[#E2E2DF] bg-[#F1F1F0] text-[#78716C]",
};

export type RefKey = "self" | "team" | "top" | "user";

const emptySubscribe = () => () => {};

function WorkbenchDrawerPortal({ children }: { children: ReactNode }) {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  if (!isMounted) return null;
  return createPortal(children, document.body);
}

// AnimatePresence 只保留 isValidElement 的子节点，portal 对象会被过滤；
// 必须经由组件边界挂 portal，抽屉才能真正渲染到 body（脱离 app-main 的 isolate 层级）。
function QueueDrawerPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

export function ContentDiagnosisWorkbench({
  video,
  snapshot = null,
  onClose,
  canOperateLifecycle = false,
  onLifecycleChanged,
  profiles = [],
  anomalyVideos = [],
  videos = [],
  snapshots = [],
  reviewReadiness = {},
  onVideoSelect,
  onAnalysisGenerated,
  onToggleTopicLibrary,
}: ContentDiagnosisWorkbenchProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [mobileScreenshotIndex, setMobileScreenshotIndex] = useState(0);
  const [isTogglingTopicLibrary, setIsTogglingTopicLibrary] = useState(false);
  const [thresholds, setThresholds] = useState<VideoReviewThresholds>(
    DEFAULT_VIDEO_REVIEW_THRESHOLDS,
  );
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    fetch("/api/admin/settings/thresholds")
      .then((res) => res.json())
      .then((data) => {
        if (data?.thresholds) setThresholds(data.thresholds);
      })
      .catch(() => {});
  }, []);

  const snapshotMap = useMemo(
    () => buildSnapshotMap(snapshots ?? []),
    [snapshots],
  );

  const reviewQueue = useMemo(() => {
    if (videos && videos.length > 0) {
      return buildReviewQueue({
        videos,
        snapshots: snapshotMap,
        reviewReadiness: reviewReadiness ?? {},
        thresholds,
        sortMode: "priority",
      });
    }
    return anomalyVideos && anomalyVideos.length > 0
      ? anomalyVideos
      : video
        ? [video]
        : [];
  }, [
    videos,
    snapshotMap,
    reviewReadiness,
    thresholds,
    anomalyVideos,
    video,
  ]);

  const currentIndex = useMemo(() => {
    if (!video || reviewQueue.length === 0) return -1;
    return reviewQueue.findIndex((v) => v.id === video.id);
  }, [reviewQueue, video]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < reviewQueue.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev && onVideoSelect) {
      onVideoSelect(reviewQueue[currentIndex - 1].id);
    }
  }, [hasPrev, onVideoSelect, reviewQueue, currentIndex]);

  const handleNext = useCallback(() => {
    if (hasNext && onVideoSelect) {
      onVideoSelect(reviewQueue[currentIndex + 1].id);
    }
  }, [hasNext, onVideoSelect, reviewQueue, currentIndex]);

  useEffect(() => {
    if (isQueueOpen && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [isQueueOpen, video?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName.toLowerCase();
        if (
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "select" ||
          target.isContentEditable ||
          target.getAttribute("contenteditable") === "true" ||
          target.getAttribute("role") === "textbox"
        ) {
          return;
        }
      }

      if (e.key === "j" || e.key === "J" || e.key === "ArrowDown") {
        if (hasNext) {
          e.preventDefault();
          handleNext();
        }
      } else if (e.key === "k" || e.key === "K" || e.key === "ArrowUp") {
        if (hasPrev) {
          e.preventDefault();
          handlePrev();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (isQueueOpen) {
          setIsQueueOpen(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasNext, hasPrev, handleNext, handlePrev, isQueueOpen, onClose]);
  const [analysisResult, setAnalysisResult] =
    useState<ContentAnalysisResult | null>(null);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);

  type RefKey = "self" | "team" | "top" | "user";
  const [selectedRefs, setSelectedRefs] = useState<Set<RefKey>>(
    () => new Set(["self", "team"]),
  );
  const [selectedRefUserId, setSelectedRefUserId] = useState<string | null>(
    null,
  );
  const [multiAttribution, setMultiAttribution] =
    useState<MultiRefAttributionResult | null>(null);
  const [attributionLoading, setAttributionLoading] = useState(false);
  const [attributionError, setAttributionError] = useState<string | null>(null);
  const [showMoreMetrics, setShowMoreMetrics] = useState(false);
  const [cardCols, setCardCols] = useState<3 | 4>(3);

  const handleTrashAction = async () => {
    if (!video) return;
    setIsTrashing(true);
    try {
      const res = await fetch(`/api/admin/videos/${video.id}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trash" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "移入回收站失败");
      onLifecycleChanged();
    } catch (error) {
      feedbackToast.error(
        error instanceof Error ? error.message : "移入回收站失败",
      );
    } finally {
      setIsTrashing(false);
    }
  };

  const toggleRef = (refKey: RefKey) => {
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(refKey)) {
        if (next.size > 1) {
          next.delete(refKey);
        }
      } else {
        next.add(refKey);
      }
      return next;
    });
  };

  const fetchAttribution = useCallback(
    async (
      vId: string,
      refs: RefKey[],
      signal: AbortSignal,
      refUserId?: string | null,
    ) => {
      setAttributionLoading(true);
      setAttributionError(null);
      const refsStr = refs.length > 0 ? refs.join(",") : "self";
      let url = `/api/admin/content-attribution/${vId}?refs=${encodeURIComponent(refsStr)}`;
      if (refs.includes("user") && refUserId) {
        url += `&refUserId=${encodeURIComponent(refUserId)}`;
      }
      try {
        const res = await fetch(url, { signal });
        const data = (await res.json()) as MultiRefAttributionResult & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || "归因数据加载失败");
        }
        if (signal.aborted) return;
        setMultiAttribution(data);
      } catch (error) {
        if (signal.aborted) return;
        setMultiAttribution(null);
        setAttributionError(
          error instanceof Error ? error.message : "归因数据加载失败",
        );
      } finally {
        if (!signal.aborted) setAttributionLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!video?.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换视频时重置分析结果（受控对象切换重置）
    setAnalysisResult(null);
    setMobileScreenshotIndex(0);
  }, [video?.id]);

  useEffect(() => {
    const videoId = video?.id;
    if (!videoId) return;
    const controller = new AbortController();
    const activeArr = Array.from(selectedRefs);
    if (activeArr.includes("user") && !selectedRefUserId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 缺少用户归因引用时清空归因状态（数据依赖分支重置）
      setMultiAttribution(null);
      setAttributionError(null);
      setAttributionLoading(false);
      return () => controller.abort();
    }
    void fetchAttribution(
      videoId,
      activeArr,
      controller.signal,
      selectedRefUserId,
    );
    return () => controller.abort();
  }, [video?.id, selectedRefs, selectedRefUserId, fetchAttribution]);

  // 核心病因提取与诊断总览（第一眼抓重点，告别无头绪数据堆砌）
  const primaryDiagnosis = useMemo(() => {
    if (!video) return null;

    // 1. 生命周期或播放量突降异常（平台限流、删稿、腰斩等）
    const isAnomaly =
      video.anomaly_status !== "normal" &&
      video.anomaly_status !== "正常" &&
      video.anomaly_status !== "未满24h";
    const isHalve = video.play_change_signal === "halve";

    // 2. 从归因结果中提取最显著的异常指标（优先提取 bad，其次 warn）
    let worstFinding: AttributionFinding | null = null;
    let worstRefLabel = "";
    if (multiAttribution?.attributions) {
      for (const refKey of Array.from(selectedRefs)) {
        const block = multiAttribution.attributions[refKey];
        if (!block?.findings) continue;
        const badSegmentFinding = block.findings.find(
          (f) => f.tone === "bad" && f.locate.segment_hint,
        );
        const badFinding = badSegmentFinding || block.findings.find((f) => f.tone === "bad");
        if (badFinding) {
          worstFinding = badFinding;
          worstRefLabel = block.ref_label;
          break;
        }
        if (!worstFinding) {
          const warnSegmentFinding = block.findings.find(
            (f) => f.tone === "warn" && f.locate.segment_hint,
          );
          const warnFinding = warnSegmentFinding || block.findings.find((f) => f.tone === "warn");
          if (warnFinding) {
            worstFinding = warnFinding;
            worstRefLabel = block.ref_label;
          }
        }
      }
    }

    const displayRefLabel = formatRefShortLabel("", worstRefLabel);

    if (isAnomaly || isHalve) {
      const statusText = isAnomaly
        ? formatAnomalyStatusText(video.anomaly_status)
        : "播放量腰斩";
      return {
        severity: "critical" as const,
        badge: statusText,
        title: `作品状态异常 · ${statusText}`,
        description:
          video.anomaly_status === "删稿"
            ? "该作品已在抖音下架或转私密，已阻断后续自然流量获取。"
            : video.anomaly_status === "限流"
              ? "该作品已被平台识别为限流状态，推荐流已阻断，建议重点核对违规台词与画面素材。"
              : "该作品播放量相较日常基准出现大幅腰斩骤降，内容吸引力或账号权重存在异常波动。",
        detail: worstFinding
          ? `伴随指标：${worstFinding.metric_label}（实测 ${worstFinding.value ?? "—"} vs ${displayRefLabel} ${worstFinding.ref_value ?? "—"}）`
          : null,
        refLabel: displayRefLabel,
      };
    }

    if (worstFinding) {
      const isBad = worstFinding.tone === "bad";
      const formattedVal =
        worstFinding.value != null
          ? worstFinding.metric.includes("rate")
            ? `${worstFinding.value.toFixed(1)}%`
            : worstFinding.metric.includes("duration")
              ? `${worstFinding.value.toFixed(1)}s`
              : new Intl.NumberFormat("zh-CN").format(Math.round(worstFinding.value))
          : "—";
      const formattedRef =
        worstFinding.ref_value != null
          ? worstFinding.metric.includes("rate")
            ? `${worstFinding.ref_value.toFixed(1)}%`
            : worstFinding.metric.includes("duration")
              ? `${worstFinding.ref_value.toFixed(1)}s`
              : new Intl.NumberFormat("zh-CN").format(Math.round(worstFinding.ref_value))
          : "—";
      const deltaStr =
        worstFinding.delta != null
          ? worstFinding.metric.includes("rate")
            ? `${worstFinding.delta > 0 ? `+${worstFinding.delta.toFixed(1)}%` : `${worstFinding.delta.toFixed(1)}%`}`
            : worstFinding.metric.includes("duration")
              ? `${worstFinding.delta > 0 ? `+${worstFinding.delta.toFixed(1)}s` : `${worstFinding.delta.toFixed(1)}s`}`
              : `${worstFinding.delta > 0 ? `+${Math.round(worstFinding.delta)}` : Math.round(worstFinding.delta)}`
          : null;

      return {
        severity: (isBad ? "bad" : "warn") as "bad" | "warn",
        badge: isBad ? "严重偏离" : "指标波动",
        title: `核心诊断：【${worstFinding.metric_label}】表现不佳`,
        description: worstFinding.points_to,
        detail: `实测 ${formattedVal} vs ${displayRefLabel} ${formattedRef}${deltaStr ? `（偏差 ${deltaStr}）` : ""}`,
        refLabel: displayRefLabel,
      };
    }

    if (multiAttribution?.snapshot_ready) {
      return {
        severity: "good" as const,
        badge: "表现健康",
        title: "作品体征平稳，未发现明显脱落",
        description: "各项核心留存与播放指标均处于健康基准线之上，无严重跳出风险。",
        detail: null,
        refLabel: "",
      };
    }

    return {
      severity: "pending" as const,
      badge: "数据收集中",
      title: "待 24h 快照数据齐备",
      description: "当前视频尚未生成满 24h 留存快照，可先人工核验原片文案与初生数据。",
      detail: null,
      refLabel: "",
    };
  }, [video, multiAttribution, selectedRefs]);

  const screenshotItems = useMemo(() => {
    if (!snapshot) return [] as { label: string; url: string }[];
    return [
      ...(snapshot.curve_screenshot_url
        ? [{ label: "流量曲线截图", url: snapshot.curve_screenshot_url }]
        : []),
      ...(snapshot.retention_screenshot_url
        ? [{ label: "留存截图", url: snapshot.retention_screenshot_url }]
        : []),
      ...(snapshot.screenshot_urls ?? []).map((url, index) => ({
        label: `数据截图 ${index + 1}`,
        url,
      })),
    ];
  }, [snapshot]);

  async function handleGenerateAnalysis() {
    if (!video) return;
    setIsGeneratingAnalysis(true);
    try {
      const res = await fetch("/api/admin/content-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: video.id }),
      });
      const data = (await res.json()) as ContentAnalysisResult & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "生成分析失败");
      setAnalysisResult(data);
      onAnalysisGenerated?.();
    } catch (error) {
      feedbackToast.error(
        error instanceof Error ? error.message : "生成辅助分析失败",
      );
    } finally {
      setIsGeneratingAnalysis(false);
    }
  }

  const showOverlay = previewIndex !== null && screenshotItems[previewIndex];

  return (
    <WorkbenchDrawerPortal>
      <div className="fixed inset-0 z-[80] flex justify-end">
        {/* 背景压暗遮罩（点击快速关闭抽屉） */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 bg-[#1C1917]/35 backdrop-blur-[2px] cursor-pointer"
        />

        {/* 右侧沉浸式精致抽屉（黄金 760px 版心，克制不霸屏） */}
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 280 }}
          className="relative z-10 flex h-full w-full max-w-full sm:max-w-[760px] 2xl:max-w-[800px] flex-col bg-white shadow-claude-dialog border-l border-[#E2E2DF] overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          <header className="flex shrink-0 items-center justify-between gap-2.5 border-b border-[#E2E2DF] bg-white/95 px-3.5 py-2.5 sm:px-5 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Button
                variant="ghost"
                size="m"
                onClick={onClose}
                className="group gap-1 text-[12px] text-[#292524] font-medium hover:bg-[#EBEBE9] transition-colors cursor-pointer h-7 px-2"
                title="关闭诊断 (Esc)"
              >
                <X className="size-3.5 group-hover:scale-110 transition-transform" />
                <span>关闭</span>
                <span className="hidden sm:inline-block rounded bg-[#E2E2DF]/60 px-1 py-0.2 text-[9.5px] text-[#78716C]">
                  Esc
                </span>
              </Button>

              <div className="h-3.5 w-px bg-[#E2E2DF] hidden sm:block" />

              {/* 队列展开/收起开关 */}
              <Button
                variant="secondary"
                size="m"
                onClick={() => setIsQueueOpen((prev) => !prev)}
                aria-pressed={isQueueOpen}
                className={`gap-1 text-[11.5px] font-medium transition-all h-7 px-2 ${
                  isQueueOpen
                    ? "bg-[#E4E4E1] text-[#1C1917] font-semibold"
                    : "bg-[#F1F1F0] text-[#292524]"
                }`}
              >
                <Layers className="size-3" />
                <span className="hidden xs:inline">{isQueueOpen ? "收起队列" : "展开队列"}</span>
                <span className="text-[10.5px] tabular-nums font-normal text-[#78716C]">
                  ({reviewQueue.length})
                </span>
              </Button>

              {/* 流水线前进后退器 */}
              <div className="flex items-center rounded-lg bg-[#F1F1F0]/70 p-0.5">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={!hasPrev}
                  title="上一条 (K 或 ↑)"
                  className="inline-flex h-6.5 items-center justify-center rounded-md px-1.5 text-[11.5px] font-medium text-[#292524] transition-colors hover:bg-white hover:text-[#1C1917] hover:shadow-2xs disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#292524] disabled:hover:shadow-none cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="size-3.5 mr-0.5" />
                  <span className="hidden md:inline">上一条</span>
                </button>

                <div className="flex items-center px-1.5 text-[11px] font-medium text-[#78716C] select-none">
                  <span className="tabular-nums font-semibold text-[#1C1917]">
                    {currentIndex >= 0 ? currentIndex + 1 : "—"}
                  </span>
                  <span className="mx-0.5 text-[#E2E2DF]">/</span>
                  <span className="tabular-nums font-medium text-[#292524]">
                    {reviewQueue.length}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!hasNext}
                  title={
                    currentIndex === reviewQueue.length - 1 &&
                    reviewQueue.length > 0
                      ? "已到队尾"
                      : "下一条 (J 或 ↓)"
                  }
                  className="inline-flex h-6.5 items-center justify-center rounded-md px-1.5 text-[11.5px] font-medium text-[#292524] transition-colors hover:bg-white hover:text-[#1C1917] hover:shadow-2xs disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#292524] disabled:hover:shadow-none cursor-pointer disabled:cursor-not-allowed"
                >
                  <span className="hidden md:inline">下一条</span>
                  <ChevronRight className="size-3.5 ml-0.5" />
                </button>
              </div>
            </div>

            {/* 视频核心信息与状态 */}
            <div className="flex shrink-0 items-center gap-2">
              <div className="text-right hidden sm:block">
                <p
                  className="max-w-[140px] md:max-w-[190px] truncate text-[12px] font-semibold text-[#1C1917] leading-tight"
                  title={video?.video_title || "未命名视频"}
                >
                  {video?.video_title || "视频复盘"}
                </p>
                <p className="mt-0.5 text-[10.5px] text-[#78716C] truncate max-w-[140px] md:max-w-[190px]">
                  {video?.profiles?.name || "未知"} ·{" "}
                  {video?.accounts?.name || "未知"}
                </p>
              </div>

          {/* 选题库入库管理与状态 (Topics V3: 由后端真实字段驱动) */}
          {video && (() => {
            const status = (video as { topic_library_status?: string })
              .topic_library_status;

            if (status === "review_excluded") {
              return (
                <span
                  title="复盘类型视频无论数据多高，均不进入干货选题库"
                  className="hidden md:inline-flex items-center rounded-lg border border-[#E2E2DF] bg-[#FCFCFB] px-2 py-1 text-[11px] text-[#78716C] font-normal"
                >
                  复盘内容不入选题库
                </span>
              );
            }

            if (status === "removed") {
              return (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-lg border border-[#E2E2DF] bg-[#F1F1F0] px-2 py-1 text-[11px] text-[#78716C] font-normal">
                    已从题库移出
                  </span>
                  {onToggleTopicLibrary && (
                    <button
                      type="button"
                      disabled={isTogglingTopicLibrary}
                      onClick={async () => {
                        try {
                          setIsTogglingTopicLibrary(true);
                          await onToggleTopicLibrary(video.id, "restore");
                          feedbackToast.success("已恢复至干货选题库，员工已重新可见");
                        } catch (err) {
                          feedbackToast.error("恢复入库失败", {
                            details:
                              err instanceof Error ? err.message : String(err),
                          });
                        } finally {
                          setIsTogglingTopicLibrary(false);
                        }
                      }}
                      className="inline-flex h-6.5 items-center justify-center rounded-lg border border-[#E2E2DF] bg-white px-2 text-[11px] font-medium text-[#292524] hover:bg-[#EBEBE9] transition-colors cursor-pointer shadow-2xs disabled:opacity-40"
                    >
                      {isTogglingTopicLibrary ? "处理中..." : "恢复入库"}
                    </button>
                  )}
                </div>
              );
            }

            if (status === "in_library") {
              return (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-lg border border-[#6FAA7D]/20 bg-[#6FAA7D]/10 px-2 py-1 text-[11px] text-[#6FAA7D] font-medium">
                    已自动入选题库
                  </span>
                  {onToggleTopicLibrary && (
                    <button
                      type="button"
                      disabled={isTogglingTopicLibrary}
                      onClick={async () => {
                        try {
                          setIsTogglingTopicLibrary(true);
                          await onToggleTopicLibrary(video.id, "remove");
                          feedbackToast.success("已从选题库移出，历史数据已完整保留");
                        } catch (err) {
                          feedbackToast.error("移出题库失败", {
                            details:
                              err instanceof Error ? err.message : String(err),
                          });
                        } finally {
                          setIsTogglingTopicLibrary(false);
                        }
                      }}
                      title="移出后仅对员工停止展示，不删除历史数据"
                      className="inline-flex h-6.5 items-center justify-center rounded-lg border border-[#E2E2DF] bg-white px-2 text-[11px] font-medium text-[#78716C] hover:text-[#C9604D] hover:bg-[#EBEBE9] transition-colors cursor-pointer shadow-2xs disabled:opacity-40"
                    >
                      {isTogglingTopicLibrary ? "处理中..." : "移出题库"}
                    </button>
                  )}
                </div>
              );
            }

            if (status === "ineligible") {
              return (
                <span
                  title="干货视频 24h 播放满 3 万将自动进入干货选题库"
                  className="hidden lg:inline-flex items-center rounded-lg border border-[#E2E2DF] bg-[#FCFCFB] px-2 py-1 text-[11px] text-[#78716C] font-normal"
                >
                  暂未达入库标准 (满3万自动进入)
                </span>
              );
            }

            return null;
          })()}

          {video &&
            canOperateLifecycle &&
            (video.lifecycle_state ?? "active") === "active" && (
              <button
                type="button"
                onClick={handleTrashAction}
                disabled={isTrashing}
                className="inline-flex h-7 items-center justify-center rounded-lg border border-[#C9604D]/20 bg-[#C9604D]/5 px-2.5 text-[11.5px] font-medium text-[#C9604D] transition-colors hover:bg-[#C9604D]/10 disabled:opacity-50"
              >
                {isTrashing ? "正在回收..." : "移入回收站"}
              </button>
            )}

          {video && (
            <Badge
              variant="outline"
              className={`h-6 text-[11.5px] font-medium ${statusBadgeClass[video.anomaly_status]}`}
            >
              {formatAnomalyStatusText(video.anomaly_status)}
            </Badge>
          )}
        </div>
      </header>

      <div className="relative flex-1 flex overflow-hidden min-h-0">
        {/* 全视口悬浮抽屉 + 半透明遮罩（portal 到 body，从左侧滑出，不抢占主抽屉版心） */}
        <AnimatePresence>
          {isQueueOpen && (
            <QueueDrawerPortal>
              <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setIsQueueOpen(false)}
                className="fixed inset-0 z-[85] bg-[#1C1917]/20 backdrop-blur-[1px]"
              />

              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 26, stiffness: 280 }}
                className="fixed inset-y-0 left-0 z-[85] flex w-84 max-w-[85vw] flex-col border-r border-[#E2E2DF] bg-[#FCFCFB]/95 backdrop-blur-xl shadow-claude-dialog"
              >
                <div className="flex items-center justify-between border-b border-[#E2E2DF] px-4 py-3 bg-[#FCFCFB]/80">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#1C1917]">
                      今日待盘队列
                    </span>
                    <span className="rounded-md bg-[#E2E2DF]/70 px-1.5 py-0.5 text-[11px] font-medium text-[#292524] tabular-nums">
                      {reviewQueue.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsQueueOpen(false)}
                    className="rounded-lg p-1 text-[#78716C] hover:bg-[#E2E2DF] hover:text-[#292524] transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-[#E2E2DF] p-1.5 pb-[calc(2rem+var(--app-bottom-nav-height,0px)+env(safe-area-inset-bottom,0px))] md:pb-2">
                  {reviewQueue.map((item, idx) => {
                    const isSelected = item.id === video?.id;
                    const snap = snapshotMap.get(item.id);
                    const warnings = getMetricWarningReasons(
                      snap,
                      thresholds,
                    ).slice(0, 2);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        ref={isSelected ? activeItemRef : undefined}
                        onClick={() => {
                          onVideoSelect?.(item.id);
                          setIsQueueOpen(false);
                        }}
                        className={`group flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition-all min-h-[58px] ${
                          isSelected
                            ? "bg-[#F1F1F0] text-[#1C1917] font-medium border-l-2 border-[#1C1917] shadow-2xs"
                            : "hover:bg-[#EBEBE9] text-[#292524] border-l-2 border-transparent"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-[11px] tabular-nums font-semibold ${
                            isSelected
                              ? "bg-[#43718E] text-white"
                              : "bg-[#F1F1F0] text-[#292524]"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="truncate text-[12px] font-medium text-[#1C1917]">
                              {item.profiles?.name || "未知"} ·{" "}
                              {item.accounts?.name || "未知"}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            {item.anomaly_status !== "normal" &&
                              item.anomaly_status !== "正常" && (
                                <span className="rounded bg-[#C9604D]/10 px-1 py-0.2 text-[10px] font-medium text-[#C9604D]">
                                  {formatAnomalyStatusText(item.anomaly_status)}
                                </span>
                              )}
                            {item.play_change_signal === "halve" && (
                              <span className="rounded bg-[#C9604D]/10 px-1 py-0.2 text-[10px] font-medium text-[#C9604D]">
                                腰斩
                              </span>
                            )}
                            {warnings.map((w, wIdx) => (
                              <span
                                key={wIdx}
                                className="rounded bg-[#F1F1F0] px-1 py-0.2 text-[10px] text-[#78716C]"
                              >
                                {w}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.aside>
              </>
            </QueueDrawerPortal>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto min-h-0 min-w-0">
          <div className="flex flex-col bg-white p-3.5 sm:p-5 space-y-5">
            {/* 一、核心诊断病因看板（第一眼抓重点） */}
            {primaryDiagnosis && (
              <div
                className={`rounded-2xl border p-4 sm:p-5 transition-all ${
                  primaryDiagnosis.severity === "critical"
                    ? "border-[#C9604D]/30 bg-gradient-to-br from-[#C9604D]/[0.05] via-[#FCFCFB] to-white"
                    : primaryDiagnosis.severity === "bad"
                      ? "border-[#D97757]/30 bg-gradient-to-br from-[#D97757]/[0.05] via-[#FCFCFB] to-white"
                      : primaryDiagnosis.severity === "warn"
                        ? "border-[#B98A54]/30 bg-gradient-to-br from-[#B98A54]/[0.05] via-[#FCFCFB] to-white"
                        : primaryDiagnosis.severity === "good"
                          ? "border-[#6FAA7D]/30 bg-gradient-to-br from-[#6FAA7D]/[0.05] via-[#FCFCFB] to-white"
                          : "border-[#E2E2DF] bg-[#FCFCFB]/80"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          primaryDiagnosis.severity === "critical" || primaryDiagnosis.severity === "bad"
                            ? "bg-[#C9604D]/12 text-[#C9604D]"
                            : primaryDiagnosis.severity === "warn"
                              ? "bg-[#B98A54]/12 text-[#B98A54]"
                              : primaryDiagnosis.severity === "good"
                                ? "bg-[#6FAA7D]/12 text-[#6FAA7D]"
                                : "bg-[#E2E2DF] text-[#78716C]"
                        }`}
                      >
                        {primaryDiagnosis.badge}
                      </span>
                      <span className="text-[11px] text-[#78716C]">
                        {primaryDiagnosis.refLabel ? `对比基准：${primaryDiagnosis.refLabel}` : "综合体征判定"}
                      </span>
                    </div>
                    <h3 className="text-[15px] sm:text-[16px] font-[580] tracking-tight text-[#1C1917] font-serif not-italic">
                      {primaryDiagnosis.title}
                    </h3>
                    <p className="text-[12.5px] leading-relaxed text-[#292524]">
                      {primaryDiagnosis.description}
                    </p>
                    {primaryDiagnosis.detail && (
                      <p className="text-[11.5px] text-[#78716C] tabular-nums font-medium">
                        {primaryDiagnosis.detail}
                      </p>
                    )}
                  </div>

                </div>
              </div>
            )}

            {/* 三、归因诊断与多参照系对比 */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E2DF] pb-2.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-[12px] font-medium tracking-[0.06em] text-[#78716C]">
                    多参照系归因对比
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {/* 多选 Tag 控制栏 */}
                  <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#F1F1F0]/70 p-1">
                    {(
                      [
                        { key: "self", label: "近三条" },
                        { key: "team", label: "7天均值" },
                        { key: "top", label: "7天最高" },
                        { key: "user", label: "指定成员" },
                      ] as const
                    ).map(({ key, label }) => {
                      const active = selectedRefs.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleRef(key)}
                          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? "bg-white text-[#1C1917] shadow-2xs"
                              : "text-[#78716C] hover:text-[#292524]"
                          }`}
                        >
                          <span
                            className={`size-3 rounded border flex items-center justify-center transition-colors ${
                              active
                                ? "border-[#1C1917] bg-[#1C1917] text-white"
                                : "border-[#E2E2DF] bg-white"
                            }`}
                          >
                            {active && <Check className="size-2.5 stroke-[3]" />}
                          </span>
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 3列 / 4列 切换器 */}
                  <div className="hidden sm:inline-flex items-center rounded-lg bg-[#F1F1F0]/70 p-0.5 text-[10.5px]">
                    <button
                      type="button"
                      onClick={() => setCardCols(3)}
                      className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                        cardCols === 3
                          ? "bg-white text-[#1C1917] shadow-2xs font-semibold"
                          : "text-[#78716C] hover:text-[#292524]"
                      }`}
                      title="每排 3 个卡片（2 排整齐对齐）"
                    >
                      3列
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardCols(4)}
                      className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                        cardCols === 4
                          ? "bg-white text-[#1C1917] shadow-2xs font-semibold"
                          : "text-[#78716C] hover:text-[#292524]"
                      }`}
                      title="每排 4 个卡片（极致紧凑）"
                    >
                      4列
                    </button>
                  </div>
                </div>
              </div>

              {selectedRefs.has("user") && profiles.length > 0 && (
                <div className="flex items-center gap-2 bg-[#F1F1F0]/70 rounded-lg p-2.5 animate-fade-in">
                  <span className="text-[11px] text-[#78716C] font-medium">
                    选择指定对比人:
                  </span>
                  <Select
                    value={selectedRefUserId || undefined}
                    onValueChange={(val) => setSelectedRefUserId(val)}
                  >
                    <SelectTrigger className="h-7 min-w-36 text-[11px] bg-[#FCFCFB]/50 border-[#E2E2DF] rounded-md">
                      <SelectValue placeholder="选一个成员" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles
                        .filter((p) => p.id !== video?.user_id)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {attributionLoading ? (
                <div className={cardCols === 3 ? "grid grid-cols-1 sm:grid-cols-3 gap-2" : "grid grid-cols-2 sm:grid-cols-4 gap-1.5"}>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-xl" />
                  ))}
                </div>
              ) : attributionError ? (
                <div className="rounded-xl border border-dashed border-[#C0685C]/30 bg-[#C0685C]/5 p-6 text-center text-[12px] text-[#C0685C]">
                  <p className="font-medium">归因数据加载失败</p>
                  <p className="mt-1 text-[11px]">{attributionError}</p>
                </div>
              ) : !multiAttribution || !multiAttribution.snapshot_ready ? (
                <div className="rounded-xl border border-dashed border-[#E2E2DF] bg-[#FCFCFB]/60 p-6 text-center text-[12px] text-[#78716C]">
                  <p className="font-semibold text-[#292524]">归因待数据齐</p>
                  <p className="mt-1 text-[11px] text-[#78716C]">
                    {multiAttribution
                      ? "这条视频还没有 24h 快照数据，先人工核对下方曲线与素材"
                      : "正在加载归因数据..."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* 6 大核心卡片（真正紧凑无浪费） */}
                  <div className={cardCols === 3 ? "grid grid-cols-1 sm:grid-cols-3 gap-2" : "grid grid-cols-2 sm:grid-cols-4 gap-1.5"}>
                    <MultiRefMetricCard
                      metricKey="play_count"
                      label="播放量"
                      unit="count"
                      multiAttribution={multiAttribution}
                      selectedRefs={Array.from(selectedRefs)}
                    />
                    <MultiRefMetricCard
                      metricKey="completion_rate"
                      label="完播率"
                      unit="rate"
                      multiAttribution={multiAttribution}
                      selectedRefs={Array.from(selectedRefs)}
                    />
                    <MultiRefMetricCard
                      metricKey="bounce_rate_2s"
                      label="2s 跳出率"
                      unit="rate"
                      multiAttribution={multiAttribution}
                      selectedRefs={Array.from(selectedRefs)}
                    />
                    <MultiRefMetricCard
                      metricKey="completion_rate_5s"
                      label="5s 完播率"
                      unit="rate"
                      multiAttribution={multiAttribution}
                      selectedRefs={Array.from(selectedRefs)}
                    />
                    <MultiRefMetricCard
                      metricKey="avg_play_duration"
                      label="平均播放时长"
                      unit="s"
                      multiAttribution={multiAttribution}
                      selectedRefs={Array.from(selectedRefs)}
                    />
                    <MultiRefMetricCard
                      metricKey="follower_gain"
                      label="今日净增粉"
                      unit="count"
                      multiAttribution={multiAttribution}
                      selectedRefs={Array.from(selectedRefs)}
                    />
                  </div>

                  {/* 更多归因指标 (4项) */}
                  <div className="border-t border-[#E2E2DF] pt-1.5">
                    <button
                      type="button"
                      onClick={() => setShowMoreMetrics(!showMoreMetrics)}
                      className="text-[11.5px] font-medium text-[#78716C] hover:text-[#1C1917] transition-colors inline-flex items-center gap-1 cursor-pointer select-none"
                    >
                      <span>
                        {showMoreMetrics
                          ? "收起互动归因指标"
                          : "展开更多互动归因指标 (点赞/评论/分享/收藏)"}
                      </span>
                      <ChevronDown
                        className={`size-3.5 transition-transform ${showMoreMetrics ? "rotate-180" : ""}`}
                      />
                    </button>

                    {showMoreMetrics && (
                      <div className={cardCols === 3 ? "grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2" : "grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-2"}>
                        <MultiRefMetricCard
                          metricKey="likes"
                          label="点赞数"
                          unit="count"
                          multiAttribution={multiAttribution}
                          selectedRefs={Array.from(selectedRefs)}
                        />
                        <MultiRefMetricCard
                          metricKey="comments"
                          label="评论数"
                          unit="count"
                          multiAttribution={multiAttribution}
                          selectedRefs={Array.from(selectedRefs)}
                        />
                        <MultiRefMetricCard
                          metricKey="shares"
                          label="分享数"
                          unit="count"
                          multiAttribution={multiAttribution}
                          selectedRefs={Array.from(selectedRefs)}
                        />
                        <MultiRefMetricCard
                          metricKey="favorites"
                          label="收藏数"
                          unit="count"
                          multiAttribution={multiAttribution}
                          selectedRefs={Array.from(selectedRefs)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {screenshotItems.length > 0 && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.06em] text-[#78716C]">
                      <span className="size-1.5 rounded-full bg-[#78716C]" />
                      四、手机端长屏截图对照
                    </h2>
                    <span className="hidden sm:inline-flex items-center rounded bg-[#F1F1F0] px-1.5 py-0.5 text-[10px] text-[#78716C]">
                      真机长屏比例
                    </span>
                  </div>
                  <span className="text-[11px] text-[#78716C]">
                    点击截屏可全屏沉浸放大
                  </span>
                </div>

                {/* 移动端 (<640px 手机视口): 双长屏分段 Tab，单张满幅 1:1 清晰呈现，防小字缩成芝麻 */}
                {screenshotItems.length > 1 && (
                  <div className="flex sm:hidden p-1 rounded-xl bg-[#F1F1F0] gap-1">
                    {screenshotItems.slice(0, 2).map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setMobileScreenshotIndex(idx)}
                        className={`flex-1 py-1.5 px-2.5 text-[11.5px] font-medium rounded-lg transition-all text-center cursor-pointer ${
                          mobileScreenshotIndex === idx
                            ? "bg-white text-[#1C1917] shadow-2xs font-semibold"
                            : "text-[#78716C] hover:text-[#292524]"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* 移动端 (<640px): 当前选中截图展示 */}
                <div className="block sm:hidden">
                  {(() => {
                    const activeIndex =
                      mobileScreenshotIndex < screenshotItems.length
                        ? mobileScreenshotIndex
                        : 0;
                    const item = screenshotItems[activeIndex];
                    if (!item) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => setPreviewIndex(activeIndex)}
                        className="group relative w-full rounded-2xl border border-[#E2E2DF] bg-[#FCFCFB] p-2 overflow-hidden shadow-2xs text-left transition-all hover:border-[#1C1917]/30 cursor-zoom-in"
                      >
                        <div className="relative aspect-[9/18] w-full max-h-[500px] overflow-hidden rounded-xl bg-stone-900/5">
                          <Image
                            src={item.url}
                            alt={item.label}
                            fill
                            unoptimized
                            className="object-top object-contain group-hover:scale-[1.01] transition-transform duration-200"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-transparent to-transparent p-3 pt-8 flex items-center justify-between text-white">
                            <span className="text-[11.5px] font-medium drop-shadow-sm">
                              {item.label}
                            </span>
                            <span className="text-[11px] rounded bg-white/20 backdrop-blur-md px-2 py-0.5 drop-shadow-sm flex items-center gap-1">
                              <Maximize2 className="size-3" />
                              点击放大原图
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })()}
                </div>

                {/* 桌面端 (≥640px): 双真机画框并排 (Side-by-side Dual Phone Deck) */}
                <div className="hidden sm:grid sm:grid-cols-2 gap-3.5">
                  {screenshotItems.slice(0, 2).map((item, index) => (
                    <div
                      key={`${item.label}-${item.url}`}
                      className="flex flex-col rounded-2xl border border-[#E2E2DF] bg-[#FCFCFB] p-2.5 shadow-2xs hover:shadow-card-ring transition-all group"
                    >
                      {/* 手机状态拟态标牌 */}
                      <div className="flex items-center justify-between px-1.5 pb-2 border-b border-[#E2E2DF]/60">
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="size-3 text-[#78716C]" />
                          <span className="text-[11.5px] font-medium text-[#1C1917]">
                            {item.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#78716C] font-normal">
                          {index === 0 ? "流量曲线" : "留存脱落"}
                        </span>
                      </div>

                      {/* 手机真机比例视窗 (9:17.5 ~ 9:19 竖屏适读比例，锁定最高 490px，不无脑拉伸) */}
                      <button
                        type="button"
                        onClick={() => setPreviewIndex(index)}
                        className="relative mt-2 aspect-[9/17.5] w-full max-h-[490px] overflow-hidden rounded-xl bg-stone-900/5 cursor-zoom-in group/img text-left"
                        title="点击放大查看原图"
                      >
                        <Image
                          src={item.url}
                          alt={item.label}
                          fill
                          unoptimized
                          className="object-top object-contain group-hover/img:scale-[1.01] transition-transform duration-200"
                        />
                        {/* 悬浮遮罩与放大提示 */}
                        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/15 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/75 text-white text-[11px] font-medium px-2.5 py-1 rounded-full backdrop-blur-sm shadow-md flex items-center gap-1">
                            <Maximize2 className="size-3" />
                            点击放大原图
                          </span>
                        </div>
                      </button>

                      {/* 底部微操作栏 */}
                      <div className="mt-2 flex items-center justify-between px-1 pt-1 text-[11px] text-[#78716C]">
                        <span>满 24h 快照</span>
                        <button
                          type="button"
                          onClick={() => setPreviewIndex(index)}
                          className="text-[#292524] font-medium hover:text-[#1C1917] hover:underline transition-colors cursor-pointer"
                        >
                          查看大图
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 若有额外数据截图 (>2张)，轻量横滑展示 */}
                {screenshotItems.length > 2 && (
                  <div className="pt-2">
                    <p className="text-[11px] text-[#78716C] mb-1.5">
                      其他补充截图 ({screenshotItems.length - 2} 张)
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {screenshotItems.slice(2).map((item, idx) => (
                        <button
                          key={item.url}
                          type="button"
                          onClick={() => setPreviewIndex(idx + 2)}
                          className="shrink-0 w-28 aspect-[9/16] relative rounded-lg border border-[#E2E2DF] overflow-hidden bg-stone-900/5 hover:border-[#1C1917]/30 transition-colors cursor-zoom-in"
                        >
                          <Image
                            src={item.url}
                            alt={item.label}
                            fill
                            unoptimized
                            className="object-top object-contain"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {screenshotItems.length > 0 && (
              <div className="h-px bg-[#E2E2DF]/60 pt-0.5" />
            )}
          </div>

          {/* AI 诊断区：取消左右分栏后置于此，随主体单列堆叠到最下方 */}
          <div className="flex flex-col bg-white border-t border-[#E2E2DF] p-3.5 sm:p-5 pb-[calc(2.5rem+var(--app-bottom-nav-height,0px)+env(safe-area-inset-bottom,0px))] space-y-5 min-w-0">
            {/* AI 辅助分析（学者边注风格） */}
            {analysisResult && (
              <div className="rounded-xl border-l-2 border-[#D97757]/60 bg-gradient-to-r from-[#F1F1F0]/80 via-[#FCFCFB]/50 to-transparent p-4 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[#292524] font-medium text-[12.5px]">
                    <Sparkles className="size-3.5 text-[#D97757]" />
                    <span className="font-serif tracking-tight font-medium">编辑部智囊 · 诊断思路批注</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAnalysisResult(null)}
                    className="text-[#78716C] hover:text-[#292524] text-[11px] font-medium transition-colors"
                  >
                    收起批注
                  </button>
                </div>
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: { opacity: 0 },
                    visible: {
                      opacity: 1,
                      transition: {
                        staggerChildren: 0.12,
                      },
                    },
                  }}
                  className="space-y-3 text-[12px] text-[#292524] leading-relaxed"
                >
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: 6 },
                      visible: { opacity: 1, y: 0 },
                    }}
                  >
                    <span className="font-medium text-[#1C1917] block">
                      数据特征总结：
                    </span>
                    <p className="mt-0.5 text-[#292524]">
                      {analysisResult.data_summary}
                    </p>
                  </motion.div>
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: 6 },
                      visible: { opacity: 1, y: 0 },
                    }}
                  >
                    <span className="font-medium text-[#1C1917] block">
                      改进方向与思路：
                    </span>
                    <p className="mt-0.5 text-[#292524]">
                      {analysisResult.copywriting_reason}
                    </p>
                  </motion.div>
                  {analysisResult.abnormal_points &&
                    analysisResult.abnormal_points.length > 0 && (
                      <motion.div
                        variants={{
                          hidden: { opacity: 0, y: 6 },
                          visible: { opacity: 1, y: 0 },
                        }}
                      >
                        <span className="font-medium text-[#1C1917] block">
                          异常提示点：
                        </span>
                        <ul className="list-disc pl-4 mt-0.5 space-y-0.5 text-[#292524]">
                          {analysisResult.abnormal_points.map((pt, i) => (
                            <li key={i}>{pt}</li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                </motion.div>
              </div>
            )}
            <div className="space-y-3.5 pt-1">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-medium tracking-[0.06em] text-[#78716C]">
                  辅助诊断智囊
                </h3>
              </div>

              <div className="rounded-xl bg-white/70 p-3.5 space-y-1.5 shadow-card-ring">
                <span className="text-[11.5px] font-medium text-[#1C1917] block">
                  诊断依据
                </span>
                <p className="text-[11.5px] leading-relaxed text-[#78716C]">
                  综合 24h 留存快照、多参照系指标偏差与台词结构，提炼潜在脱落点与复盘切入点。
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-[#E2E2DF]/60 pt-3">
                <span className="text-[11.5px] text-[#78716C]">
                  点击生成当期视频的归因与文案思路
                </span>
                <Button
                  size="m"
                  onClick={handleGenerateAnalysis}
                  disabled={isGeneratingAnalysis}
                  className="bg-[#D97757] hover:bg-[#C46A4D] text-white font-medium text-[12px] px-3.5 gap-1.5 shadow-sm active:scale-[0.99] active:duration-120 cursor-pointer"
                >
                  <Sparkles className="size-3.5" />
                  {isGeneratingAnalysis ? "推导中..." : "生成诊断批注"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

        </motion.aside>
      </div>

      {showOverlay && (
        <ScreenshotPreview
          items={screenshotItems}
          index={previewIndex!}
          onClose={() => setPreviewIndex(null)}
          onPrev={() =>
            setPreviewIndex((i) =>
              i !== null && i > 0 ? i - 1 : screenshotItems.length - 1,
            )
          }
          onNext={() =>
            setPreviewIndex((i) =>
              i !== null && i < screenshotItems.length - 1 ? i + 1 : 0,
            )
          }
        />
      )}
    </WorkbenchDrawerPortal>
  );
}

type MetricRow = {
  play_count: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  completion_rate: number | null;
  avg_play_duration: number | null;
  avg_play_ratio: number | null;
  follower_gain: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
};

function MultiRefMetricCard({
  metricKey,
  label,
  unit,
  multiAttribution,
  selectedRefs,
}: {
  metricKey: MetricKey;
  label: string;
  unit: "%" | "pp" | "s" | "count" | "rate";
  multiAttribution: MultiRefAttributionResult | null;
  selectedRefs: RefKey[];
}) {
  const currentRow = multiAttribution?.current_row;
  const currentVal = currentRow
    ? (currentRow[metricKey as keyof MetricRow] as number | null)
    : null;

  const formattedCurrent =
    currentVal == null
      ? "—"
      : unit === "%" || unit === "pp"
        ? `${currentVal.toFixed(1)}%`
        : unit === "s"
          ? `${currentVal.toFixed(1)}s`
          : new Intl.NumberFormat("zh-CN").format(Math.round(currentVal));

  return (
    <div className="rounded-lg bg-white p-2 sm:p-2.5 shadow-card-ring space-y-1.5 transition-all">
      <div className="flex items-baseline justify-between border-b border-[#E2E2DF]/60 pb-1 gap-1.5">
        <span className="text-[11.5px] font-semibold text-[#1C1917] tracking-tight truncate">
          {label}
        </span>
        <span className="text-[14px] sm:text-[15px] font-[580] tabular-nums tracking-tight text-[#1C1917] shrink-0">
          {formattedCurrent}
        </span>
      </div>

      <div className="space-y-0.5 pt-0.5">
        {selectedRefs.map((refKey) => {
          const block = multiAttribution?.attributions?.[refKey];
          const fullRefLabel =
            block?.ref_label ??
            (refKey === "self"
              ? "比自己近3条"
              : refKey === "team"
                ? "比团队近7天均值"
                : refKey === "top"
                  ? "比团队近7天最高"
                  : "比指定成员");
          const shortLabel = formatRefShortLabel(refKey, fullRefLabel);
          const sampleStatus = block?.sample_status ?? "missing_snapshot";
          const refRow = block?.reference_row;
          const refVal = refRow
            ? (refRow[metricKey as keyof MetricRow] as number | null)
            : null;
          const finding = block?.findings?.find((f) => f.metric === metricKey);

          if (
            sampleStatus === "missing_snapshot" ||
            currentVal == null ||
            refVal == null
          ) {
            return (
              <div
                key={refKey}
                className="flex items-center justify-between text-[10.5px] py-0.5 gap-1"
              >
                <span
                  className="text-[#78716C] truncate shrink-0"
                  title={fullRefLabel}
                >
                  {shortLabel}
                </span>
                <span className="text-[#78716C] font-normal">—</span>
              </div>
            );
          }

          if (sampleStatus === "insufficient_sample") {
            return (
              <div
                key={refKey}
                className="flex items-center justify-between text-[10.5px] py-0.5 gap-1"
              >
                <span
                  className="text-[#78716C] truncate shrink-0"
                  title={fullRefLabel}
                >
                  {shortLabel}
                </span>
                <span className="text-[#78716C] font-medium text-[9.5px]">
                  缺样本 ({block?.sample_count ?? 0}/
                  {block?.sample_required ?? 3})
                </span>
              </div>
            );
          }

          let deltaStr = "";
          const tone = finding?.tone ?? "good";

          if (unit === "pp" || unit === "%" || unit === "rate") {
            const diff = currentVal - refVal;
            deltaStr = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} pp`;
          } else if (unit === "s") {
            const diff = currentVal - refVal;
            deltaStr = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}s`;
          } else {
            if (refVal === 0) {
              deltaStr = "—";
            } else {
              const diffPct = ((currentVal - refVal) / Math.abs(refVal)) * 100;
              deltaStr = `${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}%`;
            }
          }

          // 严格遵循红涨绿跌：涨/领先用红，跌/落后用绿
          const toneClass =
            tone === "good"
              ? "text-[#C0685C] bg-[#C0685C]/8 border-[#C0685C]/20"
              : tone === "warn"
                ? "text-[#B98A54] bg-[#B98A54]/8 border-[#B98A54]/20"
                : tone === "bad"
                ? "text-[#6FAA7D] bg-[#6FAA7D]/8 border-[#6FAA7D]/20"
                : "text-[#78716C] bg-[#FCFCFB] border-[#E2E2DF]/60";

          const toneSymbol =
            tone === "good"
              ? "▲ 领先"
              : tone === "bad" || tone === "warn"
                ? "▼ 落后"
                : "持平";

          return (
            <div
              key={refKey}
              className="flex items-center justify-between text-[10.5px] py-0.5 gap-1"
            >
              <span
                className="text-[#78716C] truncate shrink-0"
                title={fullRefLabel}
              >
                {shortLabel}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="font-semibold tabular-nums text-[#292524] text-[10.5px]">
                  {deltaStr}
                </span>
                <span
                  className={`inline-flex items-center rounded border px-1 py-0 text-[9px] leading-tight font-medium ${toneClass}`}
                >
                  {toneSymbol}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScreenshotPreview({
  items,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  items: { label: string; url: string }[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext]);

  const current = items[index];
  if (!current) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="screenshot-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-[#1C1917]/60 p-4 backdrop-blur-md"
        onClick={onClose}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex min-h-[44px] min-w-[44px] items-center justify-center p-2 text-white/70 hover:text-white"
        >
          关闭
        </button>

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrev();
              }}
              className="absolute left-4 top-1/2 inline-flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
            >
              ←
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
              className="absolute right-4 top-1/2 inline-flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
            >
              →
            </button>
          </>
        )}

        <div
          className="relative max-h-[calc(100dvh-6rem)] max-w-[calc(100vw-2rem)]"
          onClick={(e) => e.stopPropagation()}
        >
          <Image
            src={current.url}
            alt={current.label}
            width={1600}
            height={1200}
            unoptimized
            className="max-h-[calc(100dvh-6rem)] max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-black object-contain"
          />
        </div>
        <p className="mt-4 text-[12px] font-medium text-white/80">
          {current.label}
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
