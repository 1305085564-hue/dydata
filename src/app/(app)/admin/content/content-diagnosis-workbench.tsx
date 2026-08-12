"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Plus,
  History,
  Copy,
  Layers,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  ContentFeedbackCardDetail,
  ContentFeedbackCardView,
  ContentReviewReadiness,
  Video,
  VideoMetricsSnapshot,
} from "@/types";
import type {
  AttributionFinding,
  MultiRefAttributionResult,
} from "@/lib/content-attribution";
import {
  METRIC_MAP_INDEX,
  RATE_METRICS,
  type MetricKey,
} from "@/lib/content-attribution-map";

export type RefKey = "self" | "team" | "top" | "user";
import { buildContentFeedbackCopyText } from "@/lib/content-feedback-copy";
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

interface ContentDiagnosisWorkbenchProps {
  video: VideoRow | null;
  snapshot: VideoMetricsSnapshot | null;
  feedbackCard: ContentFeedbackCardView | null;
  onFeedbackCardChanged: (
    videoId: string,
    card: ContentFeedbackCardView,
  ) => void;
  onClose: () => void;
  canOperateLifecycle: boolean;
  onLifecycleChanged: () => void;
  profiles?: Array<{ id: string; name: string }>;
  anomalyVideos?: VideoRow[];
  videos?: VideoRow[];
  snapshots?: VideoMetricsSnapshot[];
  feedbackCards?: Record<string, ContentFeedbackCardView>;
  reviewReadiness?: Record<string, ContentReviewReadiness>;
  onVideoSelect?: (videoId: string) => void;
}

type ContentAnalysisResult = {
  insight_result_id?: string;
  data_summary: string;
  suspected_stage: string[];
  key_metric_evidence: string[];
  copywriting_reason: string;
  abnormal_points: string[];
  reusable_experience: string;
  feedback_draft: {
    main_issues: string;
    improvement_feedback: string;
  };
};

type ExperienceType =
  | "hot_case"
  | "fail_case"
  | "opening_issue"
  | "middle_issue"
  | "retention_issue"
  | "conversion_issue";

const statusBadgeClass: Record<Video["anomaly_status"], string> = {
  normal: "border-zinc-200 bg-zinc-50 text-[#6FAA7D]",
  abnormal: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]",
  正常: "border-zinc-200 bg-zinc-50 text-[#6FAA7D]",
  删稿: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]",
  限流: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]",
  投流: "border-[#D99E55]/30 bg-[#D99E55]/5 text-[#C47A2B]",
  活动干预: "border-[#D99E55]/30 bg-[#D99E55]/5 text-[#C47A2B]",
  未满24h: "border-zinc-200 bg-zinc-100 text-zinc-500",
};

export function ContentDiagnosisWorkbench({
  video,
  snapshot,
  feedbackCard,
  onFeedbackCardChanged,
  onClose,
  canOperateLifecycle,
  onLifecycleChanged,
  profiles = [],
  anomalyVideos = [],
  videos,
  snapshots,
  feedbackCards,
  reviewReadiness,
  onVideoSelect,
}: ContentDiagnosisWorkbenchProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [thresholds, setThresholds] = useState<VideoReviewThresholds>(
    DEFAULT_VIDEO_REVIEW_THRESHOLDS,
  );
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

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
        feedbackCards: feedbackCards ?? {},
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
    feedbackCards,
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
        if (isQueueOpen) {
          e.preventDefault();
          setIsQueueOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasNext, hasPrev, handleNext, handlePrev, isQueueOpen]);
  const [cardDetail, setCardDetail] =
    useState<ContentFeedbackCardDetail | null>(null);
  const [mainIssues, setMainIssues] = useState("");
  const [feedback, setFeedback] = useState("");
  const [analysisResult, setAnalysisResult] =
    useState<ContentAnalysisResult | null>(null);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);

  const [isMarkingExperience, setIsMarkingExperience] = useState(false);
  const [highlightedSegmentIndex, setHighlightedSegmentIndex] = useState<
    number | null
  >(null);
  const [highlightedHint, setHighlightedHint] = useState<
    "opening" | "middle" | "ending" | null
  >(null);
  const [quotedIndices, setQuotedIndices] = useState<Set<number>>(new Set());

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

  const [previousFeedback, setPreviousFeedback] = useState<{
    has_previous: boolean;
    previous?: {
      card_id: string;
      source: "draft" | "sent";
      recorded_at: string | null;
      one_line: string | null;
      sent_at: string | null;
      message_for_member?: string;
      metrics?: Record<string, number | null>;
    };
  } | null>(null);
  const [previousFeedbackLoading, setPreviousFeedbackLoading] = useState(false);
  const [showPreviousFeedback, setShowPreviousFeedback] = useState(false);

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
      feedbackToast.success("作品已成功移入回收站");
      onLifecycleChanged();
    } catch (error) {
      feedbackToast.error(
        error instanceof Error ? error.message : "移入回收站失败",
      );
    } finally {
      setIsTrashing(false);
    }
  };

  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(true);

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

  const fetchPreviousFeedback = useCallback((vId: string) => {
    setPreviousFeedbackLoading(true);
    fetch(`/api/admin/content-feedback-cards/${vId}/previous`)
      .then((res) => res.json())
      .then((data) => {
        setPreviousFeedback(data);
        setPreviousFeedbackLoading(false);
      })
      .catch(() => {
        setPreviousFeedback(null);
        setPreviousFeedbackLoading(false);
      });
  }, []);

  useEffect(() => {
    const videoId = video?.id;
    if (!videoId) return;
    setMainIssues("");
    setFeedback("");
    setAnalysisResult(null);
    setCardDetail(null);
    setDraftSavedAt(null);
    setHighlightedSegmentIndex(null);
    setQuotedIndices(new Set());
    setShowPreviousFeedback(false);
    skipNextSaveRef.current = true;

    fetch(`/api/admin/content-feedback-cards/${videoId}`)
      .then((res) => res.json())
      .then(
        (data: {
          feedback_card?: ContentFeedbackCardDetail;
          error?: string;
        }) => {
          if (data.feedback_card) {
            setCardDetail(data.feedback_card);
            const source =
              data.feedback_card.confirmed ?? data.feedback_card.draft;
            if (source) {
              setMainIssues(
                source.summary.one_line ||
                  source.summary.problem_tags.join(" / ") ||
                  "",
              );
              setFeedback(source.actions.message_for_member || "");
            }
            if (data.feedback_card.latest_draft_at) {
              setDraftSavedAt(new Date(data.feedback_card.latest_draft_at));
            }
          } else if (feedbackCard) {
            setCardDetail({ ...feedbackCard, draft: null, confirmed: null });
          }
        },
      )
      .catch(() => {});

    fetchPreviousFeedback(videoId);
  }, [video?.id, feedbackCard, fetchPreviousFeedback]);

  useEffect(() => {
    const videoId = video?.id;
    if (!videoId) return;
    const controller = new AbortController();
    const activeArr = Array.from(selectedRefs);
    if (activeArr.includes("user") && !selectedRefUserId) {
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

  const isLocked =
    cardDetail?.workflow_status === "sent" ||
    cardDetail?.workflow_status === "viewed";
  const isEditable = !isLocked;

  const feedbackFindings = useMemo(() => {
    const toneRank: Record<AttributionFinding["tone"], number> = {
      bad: 0,
      warn: 1,
      missing: 2,
      good: 3,
    };
    if (!multiAttribution) return [];

    return Array.from(selectedRefs)
      .flatMap((refKey) => {
        const block = multiAttribution.attributions[refKey];
        if (!block || block.sample_status !== "ready") return [];
        return block.findings.map((finding) => ({
          ...finding,
          ref_label: block.ref_label,
        }));
      })
      .sort((a, b) => {
        const toneDiff = toneRank[a.tone] - toneRank[b.tone];
        if (toneDiff !== 0) return toneDiff;
        return Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0);
      });
  }, [multiAttribution, selectedRefs]);

  useEffect(() => {
    if (!video) return;
    if (!isEditable) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(async () => {
      setIsSavingDraft(true);
      try {
        const res = await fetch(
          `/api/admin/content-feedback-cards/${video.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "save_draft",
              summary: {
                one_line: mainIssues.trim() || null,
              },
              actions: {
                message_for_member: feedback.trim() || null,
              },
            }),
          },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          feedback_card?: ContentFeedbackCardDetail;
        };
        if (data.feedback_card) {
          setCardDetail(data.feedback_card);
          onFeedbackCardChanged(video.id, data.feedback_card);
        }
        setDraftSavedAt(new Date());
      } catch {
      } finally {
        setIsSavingDraft(false);
      }
    }, 1500);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [mainIssues, feedback, video, isEditable, onFeedbackCardChanged]);

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

  const funnelChartData = useMemo(() => {
    if (!snapshot) return [];
    const retention2s =
      snapshot.bounce_rate_2s != null
        ? Math.max(0, 100 - snapshot.bounce_rate_2s)
        : null;
    return [
      { name: "0s", rate: 100 },
      { name: "2s", rate: retention2s },
      { name: "5s", rate: snapshot.completion_rate_5s },
      { name: "完播", rate: snapshot.completion_rate },
    ].filter((item) => item.rate != null);
  }, [snapshot]);

  const scriptSegments = useMemo(() => {
    if (!video?.content) return [];
    return video.content
      .split(/[\n]+/)
      .map((seg) => seg.trim())
      .filter(Boolean);
  }, [video?.content]);

  const scriptSections = useMemo(() => {
    if (scriptSegments.length === 0) return [];
    if (scriptSegments.length === 1) {
      return [
        {
          hint: "opening" as const,
          title: "前 3s 钩子",
          items: [{ text: scriptSegments[0], idx: 0 }],
        },
      ];
    }
    if (scriptSegments.length === 2) {
      return [
        {
          hint: "opening" as const,
          title: "前 3s 钩子",
          items: [{ text: scriptSegments[0], idx: 0 }],
        },
        {
          hint: "ending" as const,
          title: "尾部号召",
          items: [{ text: scriptSegments[1], idx: 1 }],
        },
      ];
    }
    const openingCount = Math.max(1, Math.floor(scriptSegments.length * 0.25));
    const endingCount = Math.max(1, Math.floor(scriptSegments.length * 0.25));
    const middleStart = openingCount;
    const middleEnd = scriptSegments.length - endingCount;

    const openingItems = scriptSegments
      .slice(0, middleStart)
      .map((text, i) => ({ text, idx: i }));
    const middleItems = scriptSegments
      .slice(middleStart, middleEnd)
      .map((text, i) => ({ text, idx: middleStart + i }));
    const endingItems = scriptSegments
      .slice(middleEnd)
      .map((text, i) => ({ text, idx: middleEnd + i }));

    return [
      { hint: "opening" as const, title: "前 3s 钩子", items: openingItems },
      { hint: "middle" as const, title: "中段承接", items: middleItems },
      { hint: "ending" as const, title: "尾部号召", items: endingItems },
    ].filter((s) => s.items.length > 0);
  }, [scriptSegments]);

  const feedbackEvidence = useMemo(() => {
    const list: string[] = [];
    for (const f of feedbackFindings) {
      if (f.tone === "bad" || f.tone === "warn") {
        list.push(
          `${f.ref_label} · ${f.metric_label} ${f.value != null ? f.value.toFixed(1) : "缺数据"}${RATE_METRICS.has(f.metric) && f.value != null ? "%" : ""} (${f.delta != null && f.delta !== 0 ? (f.delta > 0 ? "+" : "") + f.delta.toFixed(1) : ""})`,
        );
      }
    }
    if (analysisResult?.data_summary) {
      list.push(`AI：${analysisResult.data_summary}`);
    }
    return list;
  }, [feedbackFindings, analysisResult]);

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
      feedbackToast.success("AI 辅助分析已就绪");
    } catch (error) {
      feedbackToast.error(
        error instanceof Error ? error.message : "生成辅助分析失败",
      );
    } finally {
      setIsGeneratingAnalysis(false);
    }
  }

  function handleQuoteAnalysisToFeedback() {
    if (!analysisResult) return;
    skipNextSaveRef.current = true;
    setMainIssues(analysisResult.feedback_draft.main_issues);
    setFeedback(analysisResult.feedback_draft.improvement_feedback);
    feedbackToast.success("已引用 AI 意见至反馈框，请核对后保存");
  }

  async function handleMarkExperience(
    source: "analysis" | "feedback",
    experienceType: ExperienceType,
  ) {
    if (!video) return;
    setIsMarkingExperience(true);
    try {
      const res = await fetch("/api/admin/content-experience-marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: video.id,
          experience_type: experienceType,
          one_line_summary: mainIssues.trim() || "优质复盘案例",
          detail_note: feedback.trim() || "无具体描述",
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "标记经验失败");
      feedbackToast.success("已成功沉淀经验入库");
    } catch (error) {
      feedbackToast.error(
        error instanceof Error ? error.message : "标记经验失败",
      );
    } finally {
      setIsMarkingExperience(false);
    }
  }

  const handleQuoteSegment = useCallback((text: string, index: number) => {
    setHighlightedSegmentIndex(index);
    setQuotedIndices((prev) => {
      const next = new Set(prev);
      const isQuoted = next.has(index);
      if (isQuoted) {
        next.delete(index);
        setMainIssues((issuesPrev) => {
          const target = ` / 文案：「${text}」`;
          const targetStart = `文案问题：「${text}」`;
          let result = issuesPrev.replace(target, "").trim();
          if (result.startsWith(targetStart)) {
            result = result.replace(targetStart, "").trim();
            if (result.startsWith("/")) {
              result = result.substring(1).trim();
            }
          }
          return result;
        });
        feedbackToast.success("已撤销该句子的引用");
      } else {
        next.add(index);
        setMainIssues((issuesPrev) => {
          const current = issuesPrev.trim();
          if (!current) return `文案问题：「${text}」`;
          if (current.includes(text)) return current;
          return `${current} / 文案：「${text}」`;
        });
        feedbackToast.success("已引用该句子至主要问题");
      }
      return next;
    });
  }, []);

  const handleLocateFinding = useCallback(
    (finding: AttributionFinding) => {
      const locate = finding.locate;
      if (locate.kind !== "segment" || !locate.segment_hint) return;
      const hint = locate.segment_hint;
      setHighlightedHint(hint);

      let targetIdx = -1;
      if (hint === "opening") {
        targetIdx = 0;
      } else if (hint === "middle") {
        targetIdx = Math.floor(scriptSegments.length / 2);
      } else if (hint === "ending") {
        targetIdx = scriptSegments.length - 1;
      }

      if (targetIdx !== -1 && targetIdx < scriptSegments.length) {
        setHighlightedSegmentIndex(targetIdx);
        setTimeout(() => {
          const el =
            document.getElementById(`script-section-${hint}`) ||
            document.getElementById(`script-segment-${targetIdx}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 50);
      }
    },
    [scriptSegments],
  );

  const handleCopyFeedbackText = useCallback(async () => {
    const text = buildContentFeedbackCopyText({
      title: video?.video_title,
      findings: feedbackFindings,
      mainIssue: mainIssues,
      suggestion: feedback,
    });

    try {
      await navigator.clipboard.writeText(text);
      feedbackToast.success("建议已复制，可直接粘贴到飞书");
    } catch {
      feedbackToast.error("复制失败，请检查浏览器剪贴板权限");
    }
  }, [feedbackFindings, feedback, mainIssues, video?.video_title]);

  const showOverlay = previewIndex !== null && screenshotItems[previewIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col h-full bg-zinc-50/70 rounded-2xl border border-zinc-200 overflow-hidden"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="group active:scale-[0.96] rounded-xl hover:bg-zinc-100 gap-1 transition-transform text-[12px] text-zinc-600 font-medium"
          >
            <ChevronLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">返回列表</span>
          </Button>

          <div className="h-4 w-px bg-zinc-200 hidden sm:block" />

          {/* 队列展开/收起开关 */}
          <Button
            size="sm"
            onClick={() => setIsQueueOpen((prev) => !prev)}
            aria-pressed={isQueueOpen}
            className={`h-8 rounded-lg text-[12px] font-medium transition-all gap-1.5 ${
              isQueueOpen
                ? "bg-zinc-900 text-white hover:bg-zinc-800 shadow-2xs"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-950"
            }`}
          >
            <Layers className="size-3.5" />
            <span>{isQueueOpen ? "收起队列" : "展开队列"}</span>
            <span
              className={`text-[11px] tabular-nums font-normal ${isQueueOpen ? "text-zinc-300" : "text-zinc-400"}`}
            >
              ({reviewQueue.length})
            </span>
          </Button>

          {/* 流水线前进后退器 */}
          <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50/80 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!hasPrev}
              title="上一条 (K 或 ↑)"
              className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[12px] font-medium text-zinc-700 transition-colors hover:bg-white hover:text-zinc-950 hover:shadow-2xs disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-700 disabled:hover:shadow-none cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="size-3.5 mr-0.5" />
              <span>上一条</span>
            </button>

            <div className="flex items-center px-2 text-[11.5px] font-medium text-zinc-500 select-none">
              <span className="tabular-nums font-semibold text-zinc-900">
                {currentIndex >= 0 ? currentIndex + 1 : "-"}
              </span>
              <span className="mx-1 text-zinc-300">/</span>
              <span className="tabular-nums font-medium text-zinc-600">
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
              className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[12px] font-medium text-zinc-700 transition-colors hover:bg-white hover:text-zinc-950 hover:shadow-2xs disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-700 disabled:hover:shadow-none cursor-pointer disabled:cursor-not-allowed"
            >
              <span>
                {currentIndex === reviewQueue.length - 1 &&
                reviewQueue.length > 0
                  ? "已到队尾"
                  : "下一条"}
              </span>
              <ChevronRight className="size-3.5 ml-0.5" />
            </button>
          </div>
        </div>

        {/* 视频核心信息与状态 */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="text-right hidden md:block">
            <p
              className="max-w-xs lg:max-w-md truncate text-[13px] font-semibold text-zinc-900 leading-tight"
              title={video?.video_title || "未命名视频"}
            >
              {video?.video_title || "视频复盘归因舱"}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {video?.profiles?.name || "未知"} ·{" "}
              {video?.accounts?.name || "未知"}
            </p>
          </div>

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
        {/* 视口 < 1536px: 悬浮抽屉 + 半透明遮罩 */}
        <AnimatePresence>
          {isQueueOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setIsQueueOpen(false)}
                className="fixed inset-0 z-40 bg-zinc-950/20 backdrop-blur-[1px] 2xl:hidden"
              />

              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 26, stiffness: 280 }}
                className="fixed inset-y-0 left-0 z-50 flex w-84 max-w-[85vw] flex-col border-r border-zinc-200 bg-white shadow-2xl 2xl:hidden"
              >
                <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 bg-zinc-50/80">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-zinc-900">
                      今日待盘队列
                    </span>
                    <span className="rounded-md bg-zinc-200/70 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 tabular-nums">
                      {reviewQueue.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsQueueOpen(false)}
                    className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 p-1.5">
                  {reviewQueue.map((item, idx) => {
                    const isSelected = item.id === video?.id;
                    const snap = snapshotMap.get(item.id);
                    const card = feedbackCards?.[item.id];
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
                            ? "bg-zinc-100 text-zinc-950 font-medium border-l-2 border-zinc-900 shadow-2xs"
                            : "hover:bg-zinc-50 text-zinc-700 border-l-2 border-transparent"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-[11px] tabular-nums font-semibold ${
                            isSelected
                              ? "bg-zinc-900 text-white"
                              : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-[12px] font-medium text-zinc-900">
                              {item.profiles?.name || "未知"} ·{" "}
                              {item.accounts?.name || "未知"}
                            </span>
                            {card?.workflow_status === "draft" ||
                            card?.workflow_status === "confirmed" ? (
                              <span className="shrink-0 rounded bg-[#D99E55]/10 px-1 py-0.2 text-[10px] font-medium text-[#C47A2B]">
                                草稿
                              </span>
                            ) : null}
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
                                className="rounded bg-zinc-100 px-1 py-0.2 text-[10px] text-zinc-500"
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
          )}
        </AnimatePresence>

        {/* 视口 ≥ 1536px: 停靠侧边栏 (push layout) */}
        {isQueueOpen && (
          <aside className="hidden 2xl:flex w-80 shrink-0 flex-col border-r border-zinc-200 bg-white h-full overflow-hidden shadow-2xs">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 bg-zinc-50/80">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-zinc-900">
                  今日待盘队列
                </span>
                <span className="rounded-md bg-zinc-200/70 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 tabular-nums">
                  {reviewQueue.length}
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 font-medium">
                最差优先
              </span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 p-2">
              {reviewQueue.map((item, idx) => {
                const isSelected = item.id === video?.id;
                const snap = snapshotMap.get(item.id);
                const card = feedbackCards?.[item.id];
                const warnings = getMetricWarningReasons(
                  snap,
                  thresholds,
                ).slice(0, 2);
                return (
                  <button
                    key={item.id}
                    type="button"
                    ref={isSelected ? activeItemRef : undefined}
                    onClick={() => onVideoSelect?.(item.id)}
                    className={`group flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition-all min-h-[58px] ${
                      isSelected
                        ? "bg-zinc-100 text-zinc-950 font-medium border-l-2 border-zinc-900 shadow-2xs"
                        : "hover:bg-zinc-50 text-zinc-700 border-l-2 border-transparent"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-[11px] tabular-nums font-semibold ${
                        isSelected
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[12px] font-medium text-zinc-900">
                          {item.profiles?.name || "未知"} ·{" "}
                          {item.accounts?.name || "未知"}
                        </span>
                        {card?.workflow_status === "draft" ||
                        card?.workflow_status === "confirmed" ? (
                          <span className="shrink-0 rounded bg-[#D99E55]/10 px-1 py-0.2 text-[10px] font-medium text-[#C47A2B]">
                            草稿
                          </span>
                        ) : null}
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
                            className="rounded bg-zinc-100 px-1 py-0.2 text-[10px] text-zinc-500"
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
          </aside>
        )}

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-10 overflow-hidden min-h-0 min-w-0">
          <div className="lg:col-span-6 flex flex-col border-r border-zinc-200 bg-white overflow-y-auto p-6 space-y-6">
            {/* 一、归因诊断与多参照系对比 */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                <h2 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.08em] text-zinc-900">
                  <span className="size-2 rounded-full bg-[#5F82A8]" />
                  一、归因诊断与多参照系对比
                </h2>
                {/* 多选 Tag 控制栏 */}
                <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
                  {(
                    [
                      { key: "self", label: "比自己近3条" },
                      { key: "team", label: "比团队均值" },
                      { key: "top", label: "比今日团队最高" },
                      { key: "user", label: "比指定成员" },
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
                            ? "border border-zinc-200 bg-white text-zinc-950 shadow-2xs"
                            : "text-zinc-500 hover:text-zinc-800"
                        }`}
                      >
                        <span
                          className={`size-3 rounded border flex items-center justify-center transition-colors ${
                            active
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-300 bg-white"
                          }`}
                        >
                          {active && <Check className="size-2.5 stroke-[3]" />}
                        </span>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedRefs.has("user") && profiles.length > 0 && (
                <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-150 rounded-xl p-2.5 animate-fade-in">
                  <span className="text-[11px] text-zinc-500 font-medium">
                    选择指定对比人:
                  </span>
                  <Select
                    value={selectedRefUserId || undefined}
                    onValueChange={(val) => setSelectedRefUserId(val)}
                  >
                    <SelectTrigger className="h-7 min-w-36 text-[11px] bg-white border-zinc-200 rounded-md">
                      <SelectValue placeholder="请选择成员" />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-32 w-full rounded-xl" />
                  ))}
                </div>
              ) : attributionError ? (
                <div className="rounded-xl border border-dashed border-[#C9604D]/30 bg-[#C9604D]/5 p-6 text-center text-[12px] text-[#B84C5C]">
                  <p className="font-semibold">归因数据加载失败</p>
                  <p className="mt-1 text-[11px]">{attributionError}</p>
                </div>
              ) : !multiAttribution || !multiAttribution.snapshot_ready ? (
                <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-6 text-center text-[12px] text-zinc-500">
                  <p className="font-semibold text-zinc-800">归因待数据齐</p>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {multiAttribution
                      ? "这条视频暂无 24h 快照数据，请人工核对下方曲线与素材"
                      : "正在加载归因数据..."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {/* 6 大核心卡片 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                    <MultiRefMetricCard
                      metricKey="play_count"
                      label="播放量"
                      unit="count"
                      multiAttribution={multiAttribution}
                      selectedRefs={Array.from(selectedRefs)}
                      onLocate={handleLocateFinding}
                    />
                    <MultiRefMetricCard
                      metricKey="completion_rate"
                      label="完播率"
                      unit="rate"
                      multiAttribution={multiAttribution}
                      selectedRefs={Array.from(selectedRefs)}
                      onLocate={handleLocateFinding}
                    />
                    <MultiRefMetricCard
                      metricKey="bounce_rate_2s"
                      label="2s 跳出率"
                      unit="rate"
                      multiAttribution={multiAttribution}
                      selectedRefs={Array.from(selectedRefs)}
                      onLocate={handleLocateFinding}
                    />
                    <MultiRefMetricCard
                      metricKey="completion_rate_5s"
                      label="5s 完播率"
                      unit="rate"
                      multiAttribution={multiAttribution}
                      selectedRefs={Array.from(selectedRefs)}
                      onLocate={handleLocateFinding}
                    />
                    <MultiRefMetricCard
                      metricKey="avg_play_duration"
                      label="平均播放时长"
                      unit="s"
                      multiAttribution={multiAttribution}
                      selectedRefs={Array.from(selectedRefs)}
                      onLocate={handleLocateFinding}
                    />
                    <MultiRefMetricCard
                      metricKey="follower_gain"
                      label="今日净增粉"
                      unit="count"
                      multiAttribution={multiAttribution}
                      selectedRefs={Array.from(selectedRefs)}
                      onLocate={handleLocateFinding}
                    />
                  </div>

                  {/* 更多归因指标 (4项) */}
                  <div className="border-t border-zinc-100 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowMoreMetrics(!showMoreMetrics)}
                      className="text-[11.5px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors inline-flex items-center gap-1 cursor-pointer select-none"
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-3">
                        <MultiRefMetricCard
                          metricKey="likes"
                          label="点赞数"
                          unit="count"
                          multiAttribution={multiAttribution}
                          selectedRefs={Array.from(selectedRefs)}
                          onLocate={handleLocateFinding}
                        />
                        <MultiRefMetricCard
                          metricKey="comments"
                          label="评论数"
                          unit="count"
                          multiAttribution={multiAttribution}
                          selectedRefs={Array.from(selectedRefs)}
                          onLocate={handleLocateFinding}
                        />
                        <MultiRefMetricCard
                          metricKey="shares"
                          label="分享数"
                          unit="count"
                          multiAttribution={multiAttribution}
                          selectedRefs={Array.from(selectedRefs)}
                          onLocate={handleLocateFinding}
                        />
                        <MultiRefMetricCard
                          metricKey="favorites"
                          label="收藏数"
                          unit="count"
                          multiAttribution={multiAttribution}
                          selectedRefs={Array.from(selectedRefs)}
                          onLocate={handleLocateFinding}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.08em] text-zinc-500">
                <span className="size-1.5 rounded-full bg-[#5F82A8]" />
                三、流量留存曲线漏斗
              </h2>
              {snapshot ? (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 h-[200px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={funnelChartData}
                      margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="colorRate"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#5F82A8"
                            stopOpacity={0.15}
                          />
                          <stop
                            offset="95%"
                            stopColor="#5F82A8"
                            stopOpacity={0.0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#E7E5E4"
                      />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#78716C", fontSize: 11 }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#78716C", fontSize: 11 }}
                      />
                      <ChartTooltip
                        contentStyle={{
                          borderRadius: "12px",
                          border: "1px solid #E7E5E4",
                          boxShadow: "0 4px 12px rgba(28,25,23,0.08)",
                          fontSize: "11px",
                        }}
                        formatter={(val) => {
                          const numericVal =
                            typeof val === "number"
                              ? val
                              : parseFloat(String(val));
                          return [
                            `${isNaN(numericVal) ? "缺数据" : numericVal.toFixed(1)}%`,
                            "留存率",
                          ];
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="rate"
                        stroke="#5F82A8"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorRate)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-center text-[12px] text-zinc-400">
                  暂无 24h 快照留存曲线数据
                </div>
              )}
            </div>

            {screenshotItems.length > 0 && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.08em] text-zinc-500">
                  <span className="size-1.5 rounded-full bg-zinc-400" />
                  四、曲线及留存截图
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {screenshotItems.slice(0, 2).map((item, index) => (
                    <button
                      key={`${item.label}-${item.url}`}
                      type="button"
                      onClick={() => setPreviewIndex(index)}
                      className="group border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50 relative hover:border-zinc-300 transition-colors text-left"
                    >
                      <div className="aspect-[16/9] w-full relative">
                        <Image
                          src={item.url}
                          alt={item.label}
                          fill
                          unoptimized
                          className="object-cover group-hover:scale-[1.01] transition-transform duration-200"
                        />
                      </div>
                      <div className="px-3 py-1.5 text-[11px] text-zinc-500 bg-white border-t border-zinc-100 flex items-center justify-between">
                        <span>{item.label}</span>
                        <span className="text-zinc-600 font-medium group-hover:text-zinc-950 transition-colors">
                          放大
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {screenshotItems.length > 0 && (
              <div className="h-px bg-zinc-200/60 pt-0.5" />
            )}
          </div>

          {/* 右侧 40% 栏：台词引用、AI诊断思路、诊断建议与下发 */}
          <div className="lg:col-span-4 flex flex-col bg-white overflow-y-auto p-6 pb-24 space-y-6 min-w-0">
            {scriptSections.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.08em] text-zinc-500">
                    <span className="size-1.5 rounded-full bg-[#5F82A8]" />
                    台词黄金三段式 (点击句子直接引用)
                  </h3>
                  {video?.video_url && (
                    <a
                      href={video.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-[#D97757] hover:text-[#C46A4D] font-medium hover:underline normal-case"
                    >
                      查看抖音原片
                    </a>
                  )}
                </div>

                <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                  {scriptSections.map((sec) => {
                    const isSectionHighlighted = highlightedHint === sec.hint;
                    return (
                      <div
                        key={sec.hint}
                        id={`script-section-${sec.hint}`}
                        className={`rounded-xl border transition-all ${
                          isSectionHighlighted
                            ? "border-[#5F82A8] bg-[#5F82A8]/[0.02] ring-1 ring-[#5F82A8]/30 shadow-2xs"
                            : "border-zinc-200 bg-white"
                        } overflow-hidden`}
                      >
                        <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/80 px-3.5 py-1.5 text-[11px] font-medium text-zinc-600">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`size-1.5 rounded-full ${
                                sec.hint === "opening"
                                  ? "bg-[#5F82A8]"
                                  : sec.hint === "middle"
                                    ? "bg-zinc-400"
                                    : "bg-[#6FAA7D]"
                              }`}
                            />
                            {sec.title}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-normal">
                            {sec.items.length} 句
                          </span>
                        </div>
                        <div className="divide-y divide-zinc-100">
                          {
                            /* scriptSegments.map */ sec.items.map(
                              ({ text: seg, idx }) => {
                                const isHighlighted =
                                  highlightedSegmentIndex === idx;
                                const isQuoted = quotedIndices.has(idx);
                                return (
                                  <button
                                    type="button"
                                    key={idx}
                                    id={`script-segment-${idx}`}
                                    onClick={() => handleQuoteSegment(seg, idx)}
                                    aria-pressed={isQuoted}
                                    className={`group/seg flex w-full min-w-0 items-start gap-3 px-3.5 py-2.5 cursor-pointer transition-all text-left border-l-2 ${
                                      isQuoted
                                        ? "bg-[#6FAA7D]/[0.04] border-[#6FAA7D]"
                                        : isHighlighted
                                          ? "bg-zinc-100/90 border-[#5F82A8]"
                                          : "hover:bg-zinc-50/70 border-transparent"
                                    }`}
                                  >
                                    <span
                                      className={`mt-0.5 w-4 shrink-0 text-[11px] tabular-nums ${
                                        isQuoted
                                          ? "text-[#6FAA7D] font-medium"
                                          : "text-zinc-400"
                                      }`}
                                    >
                                      {idx + 1}
                                    </span>
                                    <span
                                      className={`text-[12px] leading-relaxed flex-1 min-w-0 break-words whitespace-pre-wrap ${
                                        isQuoted
                                          ? "text-zinc-400 line-through decoration-zinc-300/60"
                                          : isHighlighted
                                            ? "text-zinc-950 font-semibold"
                                            : "text-zinc-700 font-normal"
                                      }`}
                                    >
                                      {seg}
                                    </span>
                                    <span className="opacity-100 sm:opacity-0 sm:group-hover/seg:opacity-100 sm:group-focus-visible/seg:opacity-100 transition-opacity shrink-0 flex items-center gap-1">
                                      <span
                                        title={
                                          isQuoted ? "取消引用" : "引用此句"
                                        }
                                        className={`rounded-md p-1 ${
                                          isQuoted
                                            ? "text-[#6FAA7D]"
                                            : "text-zinc-400 hover:text-zinc-700"
                                        }`}
                                      >
                                        {isQuoted ? (
                                          <Check className="size-3.5" />
                                        ) : (
                                          <Plus className="size-3.5" />
                                        )}
                                      </span>
                                    </span>
                                  </button>
                                );
                              },
                            ) /* activeTab === "analysis" */
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {scriptSections.length > 0 && (
              <div className="h-px bg-zinc-200/60 pt-0.5" />
            )}

            {/* AI 辅助分析（默认折叠为 AI 参考入口） */}
            {analysisResult && (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-zinc-700 font-medium text-[12px]">
                    <Sparkles className="size-3.5 text-zinc-500" />
                    <span>AI 辅助诊断思路（仅供参考）</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAnalysisResult(null)}
                    className="text-zinc-400 hover:text-zinc-600 text-[11px] font-medium transition-colors"
                  >
                    清除
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
                  className="space-y-3 text-[12px] text-zinc-700 leading-relaxed"
                >
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: 6 },
                      visible: { opacity: 1, y: 0 },
                    }}
                  >
                    <span className="font-semibold text-zinc-900 block">
                      数据特征总结：
                    </span>
                    <p className="mt-0.5 text-zinc-600">
                      {analysisResult.data_summary}
                    </p>
                  </motion.div>
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: 6 },
                      visible: { opacity: 1, y: 0 },
                    }}
                  >
                    <span className="font-semibold text-zinc-900 block">
                      改进方向与思路：
                    </span>
                    <p className="mt-0.5 text-zinc-600">
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
                        <span className="font-semibold text-zinc-900 block">
                          异常提示点：
                        </span>
                        <ul className="list-disc pl-4 mt-0.5 space-y-0.5 text-zinc-600">
                          {analysisResult.abnormal_points.map((pt, i) => (
                            <li key={i}>{pt}</li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                </motion.div>
                <div className="flex justify-end gap-2 pt-2.5 border-t border-zinc-100">
                  <Button
                    size="sm"
                    onClick={() => handleMarkExperience("analysis", "hot_case")}
                    disabled={isMarkingExperience}
                    className="h-7 rounded-lg bg-zinc-100 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950 gap-1"
                  >
                    {isMarkingExperience && (
                      <Loader2 className="size-3 animate-spin text-zinc-400" />
                    )}
                    {isMarkingExperience ? "正在保存..." : "沉淀优秀经验"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleQuoteAnalysisToFeedback}
                    className="h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-medium transition-colors"
                  >
                    一键引用至反馈框
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.08em] text-zinc-500">
                  <span className="size-1.5 rounded-full bg-[#D97757]" />
                  四、诊断建议与下发
                </h3>
                <div className="text-[11px] text-zinc-400 min-h-5 flex items-center gap-1">
                  {isSavingDraft ? (
                    <>
                      <Loader2 className="size-3 animate-spin text-[#D99E55]" />
                      <span>草稿自动保存中...</span>
                    </>
                  ) : draftSavedAt ? (
                    <>
                      <span className="size-1.5 rounded-full bg-[#6FAA7D] inline-block" />
                      <span>已自动存为草稿</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5 bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                <span className="text-[11px] font-semibold text-zinc-500 block">
                  诊断证据 (自动汇总偏离/异常指标)：
                </span>
                {feedbackEvidence.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {feedbackEvidence.map((ev, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 text-[#C9604D] border border-zinc-200 text-[11px] font-medium"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[11px] text-zinc-400 italic">
                    暂无指标偏离证据，该视频表现良好。
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-1 text-left">
                  <label className="text-[11.5px] font-medium text-zinc-700">
                    主要问题一句话总结：
                  </label>
                  <input
                    type="text"
                    value={mainIssues}
                    onChange={(e) => setMainIssues(e.target.value)}
                    disabled={!isEditable}
                    placeholder="例如：开头前5s钩子不够吸引人，完播偏低..."
                    className="w-full h-9 rounded-lg border border-zinc-200 px-3 text-[12px] text-zinc-700 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500/10 transition-all"
                  />
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-[11.5px] font-medium text-zinc-700">
                    改进具体建议 (关于台词改写、情绪、节奏的具体方向)：
                  </label>
                  <textarea
                    rows={4}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    disabled={!isEditable}
                    placeholder="输入具体优化台词的话术改写方向或操作建议..."
                    className="w-full rounded-lg border border-zinc-200 p-3 text-[12px] leading-relaxed text-zinc-700 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500/10 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-200/60 pt-3.5">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleGenerateAnalysis}
                    disabled={isGeneratingAnalysis || !isEditable}
                    className="h-8 rounded-lg bg-zinc-100 font-medium text-[12px] gap-1.5 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950"
                  >
                    <Sparkles className="size-3.5 text-zinc-500" />
                    {isGeneratingAnalysis ? "分析中..." : "获取 AI 诊断思路"}
                  </Button>

                  {previousFeedbackLoading ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="h-8 rounded-lg border-zinc-200 text-[12px] font-medium text-zinc-400 gap-1.5"
                    >
                      <Loader2 className="size-3.5 animate-spin" />
                      正在获取上次反馈...
                    </Button>
                  ) : previousFeedback?.has_previous ? (
                    <Button
                      size="sm"
                      onClick={() => setShowPreviousFeedback((prev) => !prev)}
                      className="h-8 rounded-lg bg-zinc-100 text-[12px] font-medium text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950 gap-1.5"
                    >
                      <History className="size-3.5 text-[#5F82A8]" />
                      {showPreviousFeedback
                        ? "关闭上次反馈对比"
                        : "对比上次反馈意见"}
                    </Button>
                  ) : null}
                </div>

                {isEditable ? (
                  <Button
                    size="sm"
                    onClick={handleCopyFeedbackText}
                    disabled={isSavingDraft}
                    className="h-8 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] text-white font-medium text-[12px] px-4 gap-1.5 shadow-2xs transition-all active:scale-[0.97]"
                  >
                    <Copy className="size-3.5" />
                    复制建议
                  </Button>
                ) : (
                  <span className="text-[12px] text-zinc-400 font-medium bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-lg">
                    历史站内记录仅查看
                  </span>
                )}
              </div>

              <p className="text-[11px] text-zinc-400 text-left">
                * 提示：AI
                辅助诊断思路仅供思路参考，复盘的最终判断与改进意见审定权 100%
                在您手中。
              </p>

              {/* 如需网站内留档可展开（折叠降级） */}
              <details className="group rounded-xl border border-zinc-200 bg-white p-3 text-[12px] transition-all">
                <summary className="flex cursor-pointer items-center justify-between font-medium text-zinc-500 hover:text-zinc-800 select-none">
                  <span className="flex items-center gap-1.5 text-[11.5px]">
                    <span className="size-1.5 rounded-full bg-zinc-400" />
                    如需网站内留档可展开
                  </span>
                  <ChevronDown className="size-3.5 text-zinc-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-3 pt-3 border-t border-zinc-100 space-y-2 text-[11px] text-zinc-500">
                  <p className="text-zinc-400">
                    草稿已随输入自动保存。如需在后台标记工作流确认状态，历史记录将自动保留。
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span>
                      当前状态：
                      <span className="font-medium text-zinc-700">
                        {cardDetail?.workflow_status === "confirmed"
                          ? "已确认"
                          : cardDetail?.workflow_status === "sent"
                            ? "已下发"
                            : cardDetail?.workflow_status === "draft"
                              ? "草稿"
                              : "未开始"}
                      </span>
                    </span>
                    {draftSavedAt && (
                      <span className="text-zinc-400">
                        最近保存：
                        {draftSavedAt.toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </details>

              {showPreviousFeedback && previousFeedback?.previous && (
                <div className="border-l-2 border-[#5F82A8]/30 pl-4 space-y-3.5 relative animate-fade-in bg-zinc-50 border border-zinc-200 rounded-xl p-3.5">
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-1.5 text-[#5F82A8]">
                      <History className="size-4" />
                      <span className="text-[11.5px] font-medium tracking-wider uppercase">
                        上次复盘诊断对比
                        {previousFeedback.previous.source === "draft"
                          ? "（草稿）"
                          : "（历史下发）"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPreviousFeedback(false)}
                      className="text-zinc-400 hover:text-zinc-600 text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      收起
                    </button>
                  </div>
                  <div className="space-y-2.5 text-[12px] text-zinc-700">
                    <div>
                      <span className="text-[11px] text-zinc-400 block">
                        上次核心问题：
                      </span>
                      <p className="font-medium text-zinc-900 text-[12.5px]">
                        {previousFeedback.previous.one_line}
                      </p>
                    </div>
                    {previousFeedback.previous.message_for_member && (
                      <div>
                        <span className="text-[11px] text-zinc-400 block">
                          上次改进建议：
                        </span>
                        <p className="leading-relaxed text-zinc-600 bg-white border border-zinc-200/80 p-2.5 rounded-xl shadow-2xs">
                          {previousFeedback.previous.message_for_member}
                        </p>
                      </div>
                    )}
                    {previousFeedback.previous.metrics && (
                      <div>
                        <span className="text-[11px] text-zinc-400 block mb-1.5">
                          上次核心指标快照：
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(
                            previousFeedback.previous.metrics,
                          ).map(([key, val]) => {
                            const entry = METRIC_MAP_INDEX.get(
                              key as MetricKey,
                            );
                            if (!entry) return null;
                            const formatted =
                              val != null
                                ? RATE_METRICS.has(key as MetricKey)
                                  ? `${val.toFixed(1)}%`
                                  : key === "avg_play_duration"
                                    ? `${val.toFixed(1)}s`
                                    : val.toLocaleString()
                                : "—";
                            return (
                              <div
                                key={key}
                                className="flex justify-between border-b border-zinc-200/50 py-1 text-[11px] leading-normal"
                              >
                                <span className="text-zinc-400">
                                  {entry.label}
                                </span>
                                <span className="font-semibold text-zinc-700 tabular-nums">
                                  {formatted}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
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
    </motion.div>
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
  onLocate,
}: {
  metricKey: MetricKey;
  label: string;
  unit: "%" | "pp" | "s" | "count" | "rate";
  multiAttribution: MultiRefAttributionResult | null;
  selectedRefs: RefKey[];
  onLocate?: (finding: AttributionFinding) => void;
}) {
  const currentRow = multiAttribution?.current_row;
  const currentVal = currentRow
    ? (currentRow[metricKey as keyof MetricRow] as number | null)
    : null;

  let activeLocateFinding: AttributionFinding | null = null;
  if (multiAttribution?.attributions) {
    for (const refKey of selectedRefs) {
      const block = multiAttribution.attributions[refKey];
      const f = block?.findings?.find((item) => item.metric === metricKey);
      if (
        f &&
        (f.tone === "bad" || f.tone === "warn") &&
        f.locate.segment_hint
      ) {
        activeLocateFinding = f;
        break;
      }
    }
  }

  const formattedCurrent =
    currentVal == null
      ? "缺数据"
      : unit === "%" || unit === "pp"
        ? `${currentVal.toFixed(1)}%`
        : unit === "s"
          ? `${currentVal.toFixed(1)}s`
          : new Intl.NumberFormat("zh-CN").format(Math.round(currentVal));

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-2xs space-y-2.5 transition-all hover:border-zinc-300 hover:shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-zinc-900 tracking-tight">
          {label}
        </span>
        {activeLocateFinding && onLocate && (
          <button
            type="button"
            onClick={() => onLocate(activeLocateFinding!)}
            className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200/80 border border-zinc-200 px-1.5 py-0.5 rounded-md transition-colors cursor-pointer"
          >
            <span>
              {activeLocateFinding.locate.segment_hint === "opening"
                ? "前3s钩子"
                : activeLocateFinding.locate.segment_hint === "middle"
                  ? "中段承接"
                  : "尾部号召"}
            </span>
            <ChevronRight className="size-3 text-zinc-400" />
          </button>
        )}
      </div>

      <div className="flex items-baseline justify-between border-b border-zinc-100 pb-2">
        <span className="text-[11px] text-zinc-400 font-medium">当前实测</span>
        <span className="text-[18px] font-semibold tabular-nums tracking-tight text-zinc-900">
          {formattedCurrent}
        </span>
      </div>

      <div className="space-y-1.5 pt-0.5">
        {selectedRefs.map((refKey) => {
          const block = multiAttribution?.attributions?.[refKey];
          const refLabel =
            block?.ref_label ??
            (refKey === "self"
              ? "比自己近3条"
              : refKey === "team"
                ? "比团队均值"
                : refKey === "top"
                  ? "比今日团队最高"
                  : "比指定成员");
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
                className="flex items-center justify-between text-[11px] py-0.5"
              >
                <span
                  className="text-zinc-500 truncate max-w-[125px]"
                  title={refLabel}
                >
                  {refLabel}
                </span>
                <span className="text-zinc-400 font-normal">—</span>
              </div>
            );
          }

          if (sampleStatus === "insufficient_sample") {
            return (
              <div
                key={refKey}
                className="flex items-center justify-between text-[11px] py-0.5"
              >
                <span
                  className="text-zinc-500 truncate max-w-[125px]"
                  title={refLabel}
                >
                  {refLabel}
                </span>
                <span className="text-zinc-400 font-medium">
                  样本不足 ({block?.sample_count ?? 0}/
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

          const toneClass =
            tone === "good"
              ? "text-[#3D8B7A] bg-[#3D8B7A]/8 border-[#3D8B7A]/20"
              : tone === "warn"
                ? "text-[#B07228] bg-[#B07228]/8 border-[#B07228]/20"
                : tone === "bad"
                  ? "text-[#B84C5C] bg-[#B84C5C]/8 border-[#B84C5C]/20"
                  : "text-zinc-500 bg-zinc-50 border-zinc-200/60";

          const toneSymbol =
            tone === "good"
              ? "▲ 领先"
              : tone === "bad" || tone === "warn"
                ? "▼ 落后"
                : "持平";

          return (
            <div
              key={refKey}
              className="flex items-center justify-between text-[11px] py-0.5"
            >
              <span
                className="text-zinc-500 truncate max-w-[125px]"
                title={refLabel}
              >
                {refLabel}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold tabular-nums text-zinc-700">
                  {deltaStr}
                </span>
                <span
                  className={`inline-flex items-center rounded border px-1 py-0.2 text-[10px] font-medium ${toneClass}`}
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
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950/60 backdrop-blur-md"
        onClick={onClose}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-white/70 hover:text-white p-2"
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
              className="absolute left-5 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3"
            >
              ←
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
              className="absolute right-5 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3"
            >
              →
            </button>
          </>
        )}

        <div
          className="relative max-h-[85vh] max-w-[85vw]"
          onClick={(e) => e.stopPropagation()}
        >
          <Image
            src={current.url}
            alt={current.label}
            width={1600}
            height={1200}
            unoptimized
            className="rounded-xl border border-white/10 bg-black object-contain max-h-[85vh] max-w-[85vw]"
          />
        </div>
        <p className="mt-4 text-[12px] font-medium text-white/80">
          {current.label}
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
