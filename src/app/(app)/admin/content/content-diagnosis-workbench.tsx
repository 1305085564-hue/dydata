"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  FileCheck,
  HelpCircle,
  Loader2,
  MoreHorizontal,
  Quote,
  Sparkles,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type {
  ContentFeedbackCardDetail,
  ContentFeedbackCardView,
  Video,
  VideoMetricsSnapshot,
} from "@/types";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

interface ContentDiagnosisWorkbenchProps {
  videoId: string;
  video: VideoRow | null;
  snapshot: VideoMetricsSnapshot | null;
  feedbackCard: ContentFeedbackCardView | null;
  onFeedbackCardChanged: (videoId: string, card: ContentFeedbackCardView) => void;
  onClose: () => void;
}

type DetailTab = "analysis" | "feedback";
type ObservationForm = {
  traffic_peak_level: "high" | "medium" | "low" | "unset";
  post_peak_trend: "smooth_decline" | "cliff_drop" | "multiple_peaks" | "unset";
  traffic_retention_quality: "good" | "average" | "poor" | "unset";
  drop_off_stage: "opening" | "middle" | "ending" | "not_obvious" | "unset";
  suspected_problem_stage:
    | "opening"
    | "middle_content"
    | "topic_mismatch"
    | "weak_interaction"
    | "weak_conversion"
    | "unset";
  note: string;
};

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

type ComparisonMetricRow = {
  play_count: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  completion_rate: number | null;
  avg_play_duration: number | null;
  follower_gain: number | null;
};

type AllComparisonData = {
  loading: boolean;
  previous: ComparisonMetricRow | null;
  recent3: ComparisonMetricRow | null;
  error: string | null;
};

type MetricTone = "default" | "amber" | "red" | "halve";

const defaultObservation: ObservationForm = {
  traffic_peak_level: "unset",
  post_peak_trend: "unset",
  traffic_retention_quality: "unset",
  drop_off_stage: "unset",
  suspected_problem_stage: "unset",
  note: "",
};

const observationSelectOptions = {
  traffic_peak_level: [
    ["unset", "未判断"],
    ["high", "高"],
    ["medium", "中"],
    ["low", "低"],
  ],
  post_peak_trend: [
    ["unset", "未判断"],
    ["smooth_decline", "平滑下降"],
    ["cliff_drop", "断崖下跌"],
    ["multiple_peaks", "多次推流"],
  ],
  traffic_retention_quality: [
    ["unset", "未判断"],
    ["good", "好"],
    ["average", "一般"],
    ["poor", "差"],
  ],
} as const;

const dropOffStageOptions = [
  ["unset", "未判断"],
  ["opening", "开头"],
  ["middle", "中段"],
  ["ending", "后段"],
  ["not_obvious", "不明显"],
] as const;

const suspectedStageOptions = [
  ["unset", "未判断"],
  ["opening", "开头问题"],
  ["middle_content", "中段内容"],
  ["topic_mismatch", "题材承接"],
  ["weak_interaction", "互动弱"],
  ["weak_conversion", "转化弱"],
] as const;

function formatNumber(v: number | null | undefined) {
  if (v == null) return "-";
  return new Intl.NumberFormat("zh-CN").format(Math.round(v));
}

function formatRate(v: number | string | null | undefined) {
  if (v == null) return "-";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "-";
  return n.toFixed(1) + "%";
}

function formatSeconds(v: number | null | undefined) {
  if (v == null) return "-";
  return `${v.toFixed(1)}s`;
}

function parseProblemTags(mainIssues: string): string[] {
  const trimmed = mainIssues.trim();
  if (!trimmed) return [];
  const tags = trimmed
    .split(/[/;；\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
  return tags.length > 0 ? tags : [trimmed];
}

const statusBadgeClass: Record<Video["anomaly_status"], string> = {
  normal: "border-stone-200 bg-stone-50 text-[#3F7A4E]",
  abnormal: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#B24E3E]",
  正常: "border-stone-200 bg-stone-50 text-[#3F7A4E]",
  删稿: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#B24E3E]",
  限流: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#B24E3E]",
  投流: "border-[#D99E55]/30 bg-[#D99E55]/5 text-[#C47A2B]",
  活动干预: "border-[#D99E55]/30 bg-[#D99E55]/5 text-[#C47A2B]",
  "未满24h": "border-stone-200 bg-stone-100 text-stone-500",
};

export function ContentDiagnosisWorkbench({
  videoId,
  video,
  snapshot,
  feedbackCard,
  onFeedbackCardChanged,
  onClose,
}: ContentDiagnosisWorkbenchProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("analysis");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [comparison, setComparison] = useState<AllComparisonData>({
    loading: false,
    previous: null,
    recent3: null,
    error: null,
  });
  const [cardDetail, setCardDetail] = useState<ContentFeedbackCardDetail | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [mainIssues, setMainIssues] = useState("");
  const [feedback, setFeedback] = useState("");
  const [observation, setObservation] = useState<ObservationForm>(defaultObservation);
  const [analysisResult, setAnalysisResult] = useState<ContentAnalysisResult | null>(null);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [isMarkingExperience, setIsMarkingExperience] = useState(false);
  const [reusableOpen, setReusableOpen] = useState(false);
  const [highlightedSegmentIndex, setHighlightedSegmentIndex] = useState<number | null>(null);
  const [isFlashMainIssues, setIsFlashMainIssues] = useState(false);
  const [quotedIndices, setQuotedIndices] = useState<Set<number>>(new Set());
  const [showSendConfirm, setShowSendConfirm] = useState(false);

  // 自动保存草稿状态
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(true);

  // Fetch comparison metrics
  const fetchComparison = useCallback((vId: string) => {
    setComparison({ loading: true, previous: null, recent3: null, error: null });
    fetch(`/api/admin/content-comparison/${vId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setComparison({ loading: false, previous: null, recent3: null, error: data.error });
          return;
        }
        setComparison({
          loading: false,
          previous: data.previous ?? null,
          recent3: data.recent3 ?? null,
          error: null,
        });
      })
      .catch(() => {
        setComparison({ loading: false, previous: null, recent3: null, error: "对比数据加载失败" });
      });
  }, []);

  useEffect(() => {
    if (!video) return;
    setActiveTab("analysis");
    setMainIssues("");
    setFeedback("");
    setObservation(defaultObservation);
    setAnalysisResult(null);
    setReusableOpen(false);
    setCardDetail(null);
    setDraftSavedAt(null);
    setHighlightedSegmentIndex(null);
    setQuotedIndices(new Set());
    setShowSendConfirm(false);
    skipNextSaveRef.current = true;

    // Load feedback card details
    fetch(`/api/admin/content-feedback-cards/${video.id}`)
      .then((res) => res.json())
      .then((data: { feedback_card?: ContentFeedbackCardDetail; error?: string }) => {
        if (data.feedback_card) {
          setCardDetail(data.feedback_card);
          const source = data.feedback_card.confirmed ?? data.feedback_card.draft;
          if (source) {
            setMainIssues(source.summary.one_line || source.summary.problem_tags.join(" / ") || "");
            setFeedback(source.actions.message_for_member || "");
          }
          if (data.feedback_card.latest_draft_at) {
            setDraftSavedAt(new Date(data.feedback_card.latest_draft_at));
          }
        } else if (feedbackCard) {
          setCardDetail({ ...feedbackCard, draft: null, confirmed: null });
        }
      })
      .catch(() => {});

    // Load observation
    fetch(`/api/admin/content-observations?videoId=${video.id}`)
      .then((res) => res.json())
      .then((data: { observation?: Partial<ObservationForm> | null }) => {
        if (!data.observation) return;
        setObservation({
          ...defaultObservation,
          ...data.observation,
          traffic_peak_level: data.observation.traffic_peak_level ?? "unset",
          post_peak_trend: data.observation.post_peak_trend ?? "unset",
          traffic_retention_quality: data.observation.traffic_retention_quality ?? "unset",
          drop_off_stage: data.observation.drop_off_stage ?? "unset",
          suspected_problem_stage: data.observation.suspected_problem_stage ?? "unset",
          note: data.observation.note ?? "",
        } as ObservationForm);
      })
      .catch(() => {});

    fetchComparison(video.id);
  }, [video?.id, feedbackCard, fetchComparison]);

  const isLocked =
    cardDetail?.workflow_status === "sent" || cardDetail?.workflow_status === "viewed";
  const isEditable = !isLocked;

  // Auto save draft logic
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
        const res = await fetch(`/api/admin/content-feedback-cards/${video.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_draft",
            summary: {
              one_line: mainIssues.trim() || null,
              problem_tags: parseProblemTags(mainIssues),
            },
            actions: {
              instructions: [],
              message_for_member: feedback.trim() || null,
            },
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { feedback_card?: ContentFeedbackCardDetail };
        if (data.feedback_card) {
          setCardDetail(data.feedback_card);
          // Sync state back to parent container
          onFeedbackCardChanged(video.id, data.feedback_card);
        }
        setDraftSavedAt(new Date());
      } catch {
        // Silent failure
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

  const anomalyChips = useMemo(() => {
    if (!video || !snapshot) return [] as { label: string; value: string; tone: MetricTone }[];
    const chips: { label: string; value: string; tone: MetricTone }[] = [];
    if (video.play_change_signal === "surge" && video.play_count_change_pct != null) {
      chips.push({
        label: "播放暴涨",
        value: formatRate(video.play_count_change_pct),
        tone: "amber",
      });
    } else if (video.play_change_signal === "halve" && video.play_count_change_pct != null) {
      chips.push({
        label: "播放腰斩",
        value: formatRate(Math.abs(video.play_count_change_pct)),
        tone: "halve",
      });
    }
    if (snapshot.bounce_rate_2s != null && snapshot.bounce_rate_2s >= 45) {
      chips.push({
        label: "2s跳出",
        value: formatRate(snapshot.bounce_rate_2s),
        tone: "red",
      });
    }
    if (snapshot.completion_rate_5s != null && snapshot.completion_rate_5s < 35) {
      chips.push({
        label: "5s完播",
        value: formatRate(snapshot.completion_rate_5s),
        tone: "red",
      });
    }
    return chips;
  }, [video, snapshot]);

  // Attribution Funnel Chart Data
  const funnelChartData = useMemo(() => {
    if (!snapshot) return [];
    const retention2s = snapshot.bounce_rate_2s != null ? Math.max(0, 100 - snapshot.bounce_rate_2s) : null;
    return [
      { name: "0s 起点", rate: 100 },
      { name: "2s 开头", rate: retention2s },
      { name: "5s 中段", rate: snapshot.completion_rate_5s },
      { name: "整片完播", rate: snapshot.completion_rate },
    ].filter((item) => item.rate != null);
  }, [snapshot]);

  // Script text segmented
  const scriptSegments = useMemo(() => {
    if (!video?.content) return [];
    // Split by newlines or punctuation
    return video.content
      .split(/[\n]+/)
      .map((seg) => seg.trim())
      .filter(Boolean);
  }, [video?.content]);

  // Evidence list
  const feedbackEvidence = useMemo(() => {
    const list: string[] = [];
    if (snapshot?.completion_rate_5s != null && snapshot.completion_rate_5s < 35) {
      list.push(`5s 完播 ${formatRate(snapshot.completion_rate_5s)}（偏低）`);
    }
    if (snapshot?.bounce_rate_2s != null && snapshot.bounce_rate_2s >= 45) {
      list.push(`2s 跳出 ${formatRate(snapshot.bounce_rate_2s)}（偏高）`);
    }
    if (snapshot?.completion_rate != null && snapshot.completion_rate < 18) {
      list.push(`完播 ${formatRate(snapshot.completion_rate)}（偏低）`);
    }
    if (analysisResult?.data_summary) {
      list.push(`AI：${analysisResult.data_summary}`);
    }
    return list;
  }, [snapshot, analysisResult]);

  async function handleConfirmAndSend() {
    if (!video) return;
    setIsConfirming(true);
    try {
      const action =
        !cardDetail || cardDetail.workflow_status === "not_started"
          ? "create_confirm_send"
          : "confirm_and_send";
      const res = await fetch(`/api/admin/content-feedback-cards/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          manager_note: feedback.trim() || null,
          summary: {
            one_line: mainIssues.trim() || null,
            problem_tags: parseProblemTags(mainIssues),
          },
          actions: {
            instructions: [],
            message_for_member: feedback.trim() || null,
          },
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        feedback_card?: ContentFeedbackCardDetail;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "确认下发失败");
      }
      if (data.feedback_card) {
        setCardDetail(data.feedback_card);
        onFeedbackCardChanged(video.id, data.feedback_card);
      }
      feedbackToast.success("已成功确认并下发给员工");
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "确认下发失败");
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleManualSaveDraft() {
    if (!video || !isEditable) return;
    try {
      const res = await fetch(`/api/admin/content-feedback-cards/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_draft",
          summary: {
            one_line: mainIssues.trim() || null,
            problem_tags: parseProblemTags(mainIssues),
          },
          actions: {
            instructions: [],
            message_for_member: feedback.trim() || null,
          },
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        feedback_card?: ContentFeedbackCardDetail;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "保存失败");
      if (data.feedback_card) {
        setCardDetail(data.feedback_card);
        onFeedbackCardChanged(video.id, data.feedback_card);
      }
      setDraftSavedAt(new Date());
      feedbackToast.success("草稿保存成功");
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function handleSaveObservation(silent = false) {
    if (!video) return;
    try {
      const res = await fetch("/api/admin/content-observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id, ...observation }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "保存观察失败");
      if (!silent) feedbackToast.success("观察维度已保存");
    } catch (error) {
      if (!silent) feedbackToast.error(error instanceof Error ? error.message : "保存观察失败");
    }
  }

  async function handleGenerateAnalysis() {
    if (!video) return;
    setIsGeneratingAnalysis(true);
    try {
      await handleSaveObservation(true);
      const res = await fetch("/api/admin/content-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: video.id }),
      });
      const data = (await res.json()) as ContentAnalysisResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "生成分析失败");
      setAnalysisResult(data);
      feedbackToast.success("AI 辅助分析已就绪");
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "生成辅助分析失败");
    } finally {
      setIsGeneratingAnalysis(false);
    }
  }

  function handleQuoteAnalysisToFeedback() {
    if (!analysisResult) return;
    skipNextSaveRef.current = true;
    setMainIssues(analysisResult.feedback_draft.main_issues);
    setFeedback(analysisResult.feedback_draft.improvement_feedback);
    setActiveTab("feedback");
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
          videoId: video.id,
          experienceType,
          visibilityScope: "team",
          note: "",
          aiInsightResultId:
            source === "analysis" ? analysisResult?.insight_result_id : undefined,
          feedbackCardId: source === "feedback" ? cardDetail?.card_id : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "标记经验失败");
      feedbackToast.success("已成功沉淀经验入库");
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "标记经验失败");
    } finally {
      setIsMarkingExperience(false);
    }
  }

  // Segment quoting helper
  const handleQuoteSegment = useCallback((text: string, index: number) => {
    setHighlightedSegmentIndex(index);
    
    setQuotedIndices((prev) => {
      const next = new Set(prev);
      const isQuoted = next.has(index);
      
      if (isQuoted) {
        // 撤销引用
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
        // 添加引用
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

    setActiveTab("feedback");
    setIsFlashMainIssues(true);
    setTimeout(() => setIsFlashMainIssues(false), 850);
  }, []);

  const canConfirm = (mainIssues.trim().length > 0 || feedback.trim().length > 0) && !isConfirming;
  const showOverlay = previewIndex !== null && screenshotItems[previewIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col h-full bg-stone-50/70 rounded-2xl border border-stone-200 overflow-hidden"
    >
      {/* Workbench Header */}
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="group active:scale-[0.96] rounded-xl hover:bg-stone-100 gap-1.5 transition-transform"
          >
            <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
            返回列表
          </Button>
          <div className="h-4 w-px bg-stone-200" />
          <div className="min-w-0">
            <h1 className="max-w-md truncate text-[18px] font-medium text-stone-900">
              {video?.video_title || "诊断舱"}
            </h1>
            <p className="mt-0.5 text-[12px] text-stone-500">
              成员：{video?.profiles?.name || "未知"} · 账号：{video?.accounts?.name || "未知"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {anomalyChips.length > 0 && (
            <div className="flex items-center gap-1">
              {anomalyChips.map((chip) => (
                <span
                  key={chip.label}
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-medium tabular-nums ${
                    chip.tone === "red" && "border-red-200 bg-red-50 text-[#B24E3E]"
                  } ${chip.tone === "amber" && "border-amber-200 bg-amber-50 text-[#C47A2B]"} ${
                    chip.tone === "halve" && "border-green-200 bg-green-50 text-[#3F7A4E]"
                  }`}
                >
                  {chip.label} {chip.value}
                </span>
              ))}
            </div>
          )}

          {video && (
            <Badge variant="outline" className={`h-6 text-[12px] ${statusBadgeClass[video.anomaly_status]}`}>
              {video.anomaly_status}
            </Badge>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden min-h-0">
        
        {/* Left Screen: Data Cockpit */}
        <div className="flex flex-col border-r border-stone-200 bg-white overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="flex items-center gap-1.5 text-[12px] font-normal tracking-[0.12em] text-stone-500">
              <span className="size-1.5 rounded-full bg-[#D97757]" />
              数据对比大盘
            </h2>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Metric Comparison Cards */}
              <MetricBarCard
                label="播放量"
                current={snapshot?.play_count}
                history={comparison.previous?.play_count}
                team={comparison.recent3?.play_count}
                formatter={formatNumber}
              />
              <MetricBarCard
                label="2s跳出率"
                current={snapshot?.bounce_rate_2s}
                history={comparison.previous?.bounce_rate_2s}
                team={comparison.recent3?.bounce_rate_2s}
                formatter={formatRate}
                lowerIsBetter
              />
              <MetricBarCard
                label="5s完播率"
                current={snapshot?.completion_rate_5s}
                history={comparison.previous?.completion_rate_5s}
                team={comparison.recent3?.completion_rate_5s}
                formatter={formatRate}
              />
              <MetricBarCard
                label="完播率"
                current={snapshot?.completion_rate}
                history={comparison.previous?.completion_rate}
                team={comparison.recent3?.completion_rate}
                formatter={formatRate}
              />
              <MetricBarCard
                label="均播时长"
                current={snapshot?.avg_play_duration}
                history={comparison.previous?.avg_play_duration}
                team={comparison.recent3?.avg_play_duration}
                formatter={formatSeconds}
              />
              <MetricBarCard
                label="今日涨粉"
                current={snapshot?.follower_gain}
                history={comparison.previous?.follower_gain}
                team={comparison.recent3?.follower_gain}
                formatter={formatNumber}
              />
            </div>
          </div>

          {/* Attribution Funnel View */}
          <div>
            <h2 className="flex items-center gap-1.5 text-[12px] font-normal tracking-[0.12em] text-stone-500">
              <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
              流量归因留存漏斗
            </h2>
            {snapshot ? (
              <div className="mt-3 bg-stone-50 border border-stone-200 rounded-2xl p-4 h-[220px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={funnelChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#D97757" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#D97757" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E5E4" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#78716C", fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "#78716C", fontSize: 12 }} />
                    <ChartTooltip
                      contentStyle={{ borderRadius: "12px", border: "1px solid #E7E5E4", boxShadow: "0 4px 12px rgba(28,25,23,0.08)" }}
                      formatter={(val) => {
                        const numericVal = typeof val === "number" ? val : parseFloat(String(val));
                        return [`${isNaN(numericVal) ? "-" : numericVal.toFixed(1)}%`, "留存率"];
                      }}
                    />
                    <Area type="monotone" dataKey="rate" stroke="#D97757" strokeWidth={2} fillOpacity={1} fill="url(#colorRate)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-stone-200 p-8 text-center text-[12px] text-stone-500">
                暂无 24h 快照留存曲线数据
              </div>
            )}
          </div>

          {/* Screenshot Wall */}
          {screenshotItems.length > 0 && (
            <div>
              <h2 className="flex items-center gap-1.5 text-[12px] font-normal tracking-[0.12em] text-stone-500">
                <span className="size-1.5 rounded-full bg-stone-400" />
                曲线及留存截图
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {screenshotItems.slice(0, 2).map((item, index) => (
                  <button
                    key={`${item.label}-${item.url}`}
                    type="button"
                    onClick={() => setPreviewIndex(index)}
                    className="group border border-stone-200 rounded-2xl overflow-hidden bg-stone-50 relative hover:border-stone-300 transition-colors text-left"
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
                    <div className="px-3 py-2 text-[12px] text-stone-500 bg-white border-t border-stone-100 flex items-center justify-between">
                      <span>{item.label}</span>
                      <span className="text-[#B4532F] font-medium opacity-0 group-hover:opacity-100 transition-opacity">查看大图</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Screen: Script & Diagnostics Panel */}
        <div className="flex flex-col bg-stone-50/50 overflow-hidden min-h-0">
          
          {/* Sub Navigation */}
          <div className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-2">
            <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("analysis")}
                className={`rounded-md px-3.5 py-1.5 text-[12px] font-medium transition-all ${
                  activeTab === "analysis"
                    ? "border border-stone-200 bg-white text-stone-900"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                1. 深度分析
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("feedback")}
                className={`rounded-md px-3.5 py-1.5 text-[12px] font-medium transition-all ${
                  activeTab === "feedback"
                    ? "border border-stone-200 bg-white text-stone-900"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                2. 反馈下发
              </button>
            </div>
            
            {/* Save Status */}
            <div className="flex items-center gap-1.5 text-[12px] text-stone-500 min-h-5 overflow-hidden">
              <AnimatePresence mode="wait">
                {isSavingDraft ? (
                  <motion.div
                    key="saving"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-1.5"
                  >
                    <Loader2 className="size-3 animate-spin text-[#8F641B]" />
                    <span>正在保存草稿...</span>
                  </motion.div>
                ) : draftSavedAt ? (
                  <motion.div
                    key="saved"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-1.5 text-stone-400"
                  >
                    <span className="relative flex size-1.5">
                      <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6FAA7D] opacity-75"></span>
                      <span className="relative inline-flex rounded-full size-1.5 bg-[#6FAA7D]"></span>
                    </span>
                    <span>已自动保存</span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          {/* Workbench Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Segmented Script (Visible in both tabs for context) */}
            {scriptSegments.length > 0 && (
              <div>
                <h3 className="mb-3 flex items-center justify-between text-[12px] font-normal tracking-[0.12em] text-stone-500">
                  <span>分段脚本 (点击句子可一键引用至反馈)</span>
                  {video?.video_url && (
                    <a
                      href={video.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-[#B4532F] font-normal hover:underline normal-case"
                    >
                      查看抖音原片
                    </a>
                  )}
                </h3>
                <div className="max-h-[220px] overflow-y-auto divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                  {scriptSegments.map((seg, idx) => {
                    const isHighlighted = highlightedSegmentIndex === idx;
                    const isQuoted = quotedIndices.has(idx);
                    return (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => handleQuoteSegment(seg, idx)}
                        aria-pressed={isQuoted}
                        className={`group/seg flex w-full items-start gap-3 px-4 py-3 cursor-pointer transition-all text-left ${
                          isQuoted 
                            ? "bg-[#6FAA7D]/5 hover:bg-[#6FAA7D]/10 border-l-2 border-[#6FAA7D]" 
                            : isHighlighted 
                              ? "bg-amber-50/50 border-l-2 border-amber-300" 
                              : "hover:bg-stone-50 border-l-2 border-transparent"
                        }`}
                      >
                        <span className={`mt-1 w-4 shrink-0 text-[12px] tabular-nums ${isQuoted ? "text-[#3F7A4E] font-medium" : "text-stone-500"}`}>
                          {idx + 1}
                        </span>
                        <span className={`text-[12px] leading-relaxed flex-1 ${
                          isQuoted 
                            ? "text-stone-500 line-through decoration-stone-300/60" 
                            : isHighlighted 
                              ? "text-amber-900 font-medium" 
                              : "text-stone-700"
                        }`}>
                          {seg}
                        </span>
                        <span className="opacity-100 sm:opacity-0 sm:group-hover/seg:opacity-100 sm:group-focus-visible/seg:opacity-100 transition-opacity shrink-0 flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            title={isQuoted ? "取消引用" : "引用此句"}
                            className={`rounded-md p-1 ${isQuoted ? "text-[#3F7A4E] hover:bg-[#6FAA7D]/10" : "text-stone-500 hover:bg-stone-100 hover:text-[#B4532F]"}`}
                          >
                            {isQuoted ? <FileCheck className="size-3.5" /> : <Quote className="size-3" />}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "analysis" ? (
              <>
                {/* Section: Curve observations */}
                <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
                  <h3 className="text-[18px] font-medium text-stone-900">1.1 走势维度诊断</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label id="diagnosis-traffic-peak-label" className="text-[12px] font-normal text-stone-500">推流峰值</label>
                      <Select
                        value={observation.traffic_peak_level}
                        onValueChange={(v) =>
                          setObservation((prev) => ({
                            ...prev,
                            traffic_peak_level: v as ObservationForm["traffic_peak_level"],
                          }))
                        }
                      >
                        <SelectTrigger aria-labelledby="diagnosis-traffic-peak-label" className="h-8 text-[12px] rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {observationSelectOptions.traffic_peak_level.map(([k, l]) => (
                            <SelectItem key={k} value={k}>
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <label id="diagnosis-post-peak-trend-label" className="text-[12px] font-normal text-stone-500">峰值后走势</label>
                      <Select
                        value={observation.post_peak_trend}
                        onValueChange={(v) =>
                          setObservation((prev) => ({
                            ...prev,
                            post_peak_trend: v as ObservationForm["post_peak_trend"],
                          }))
                        }
                      >
                        <SelectTrigger aria-labelledby="diagnosis-post-peak-trend-label" className="h-8 text-[12px] rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {observationSelectOptions.post_peak_trend.map(([k, l]) => (
                            <SelectItem key={k} value={k}>
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <label id="diagnosis-traffic-retention-label" className="text-[12px] font-normal text-stone-500">流量承接</label>
                      <Select
                        value={observation.traffic_retention_quality}
                        onValueChange={(v) =>
                          setObservation((prev) => ({
                            ...prev,
                            traffic_retention_quality: v as ObservationForm["traffic_retention_quality"],
                          }))
                        }
                      >
                        <SelectTrigger aria-labelledby="diagnosis-traffic-retention-label" className="h-8 text-[12px] rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {observationSelectOptions.traffic_retention_quality.map(([k, l]) => (
                            <SelectItem key={k} value={k}>
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-normal text-stone-500">跳出集中阶段</label>
                    <SegmentedControl
                      value={observation.drop_off_stage}
                      options={dropOffStageOptions}
                      onChange={(v) => setObservation((prev) => ({ ...prev, drop_off_stage: v }))}
                      ariaLabel="跳出集中阶段"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-normal text-stone-500">疑似问题阶段</label>
                    <SegmentedControl
                      value={observation.suspected_problem_stage}
                      options={suspectedStageOptions}
                      onChange={(v) => setObservation((prev) => ({ ...prev, suspected_problem_stage: v }))}
                      ariaLabel="疑似问题阶段"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="diagnosis-observation-note" className="text-[12px] font-normal text-stone-500">观察备注</label>
                    <textarea
                      id="diagnosis-observation-note"
                      value={observation.note}
                      onChange={(e) => setObservation((prev) => ({ ...prev, note: e.target.value }))}
                      className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 p-3 text-[12px] leading-[1.7] text-stone-700 placeholder:text-stone-500 focus:border-stone-500 focus:bg-white focus:shadow-sm focus:outline-none focus:ring-1 focus:ring-stone-900/5"
                      rows={2}
                      placeholder="录入曲线的观察点与漏斗诊断意见（自动保存）"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 rounded-xl border-stone-200 bg-white text-[12px] text-stone-700 transition-all duration-150 hover:bg-stone-50 hover:text-stone-900 active:scale-[0.98]"
                      onClick={handleGenerateAnalysis}
                      disabled={isGeneratingAnalysis}
                    >
                      <Sparkles className="size-3.5" />
                      {isGeneratingAnalysis ? "AI 分析中..." : "生成 AI 辅助分析意见"}
                    </Button>
                  </div>
                </div>

                {/* Section: AI Analysis Results */}
                {(isGeneratingAnalysis || analysisResult) && (
                  <div className="space-y-4 rounded-2xl border border-stone-200 border-l-2 border-l-[#D97757] bg-stone-100/50 p-5">
                    <div className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.12em] text-[#B4532F]">
                      <Sparkles className="size-4" />
                      AI 智能诊断
                    </div>

                    {isGeneratingAnalysis && !analysisResult ? (
                      <div className="space-y-3">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                      </div>
                    ) : analysisResult ? (
                      <div className="space-y-4">
                        <p className="text-[18px] font-medium leading-[1.6] text-stone-900">
                          {analysisResult.data_summary}
                        </p>

                        <div className="flex flex-wrap gap-1.5">
                          {analysisResult.suspected_stage.map((stage) => (
                            <span
                              key={stage}
                              className="inline-flex items-center rounded-full border border-stone-200 bg-white/90 px-2.5 py-0.5 text-[12px] font-medium text-stone-700"
                            >
                              疑似 · {stage}
                            </span>
                          ))}
                          {analysisResult.key_metric_evidence.slice(0, 3).map((ev) => (
                            <span
                              key={ev}
                              className="inline-flex items-center rounded-full border border-stone-200 bg-white/90 px-2.5 py-0.5 text-[12px] font-normal text-stone-500"
                            >
                              {ev}
                            </span>
                          ))}
                        </div>

                        {analysisResult.copywriting_reason && (
                          <p className="text-[12px] leading-[1.7] text-stone-700">
                            <span className="font-normal text-stone-500">文案诊断：</span>
                            {analysisResult.copywriting_reason}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 pt-2">
                          <Button
                            size="sm"
                            className="h-8 rounded-lg bg-[#B4532F] px-3.5 text-[12px] text-white hover:bg-[#A84D2B]"
                            onClick={handleQuoteAnalysisToFeedback}
                          >
                            应用到反馈草稿
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg border-stone-200 bg-white text-[12px] text-stone-700"
                            onClick={() => handleMarkExperience("analysis", "hot_case")}
                            disabled={isMarkingExperience}
                          >
                            沉淀优秀经验
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
                <h3 className="text-[18px] font-medium text-stone-900">2.1 反馈内容录入</h3>
                
                {/* Evidence overview */}
                {feedbackEvidence.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-xl border border-stone-200/60 bg-stone-50 px-3.5 py-2.5 text-[12px] leading-[1.7] text-stone-700">
                    <span className="font-normal text-stone-500">诊断依据：</span>
                    {feedbackEvidence.map((line, i) => (
                      <span key={line} className="flex items-center gap-1.5">
                        {i > 0 && <span className="text-stone-500">·</span>}
                        <span className="text-stone-700">{line}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="diagnosis-main-issues" className="text-[12px] font-normal text-stone-500">主要问题诊断</label>
                  <textarea
                    id="diagnosis-main-issues"
                    value={mainIssues}
                    onChange={(e) => setMainIssues(e.target.value)}
                    className={`w-full resize-none rounded-xl border p-3 text-[12px] leading-[1.7] text-stone-700 placeholder:text-stone-500 focus:border-stone-500 focus:bg-white focus:shadow-sm focus:outline-none focus:ring-1 focus:ring-stone-900/5 transition-all duration-300 ${
                      isFlashMainIssues
                        ? "border-[#D97757] ring-2 ring-[#D97757]/15 bg-amber-50/20 scale-[1.005]"
                        : "border-stone-200 bg-stone-50"
                    }`}
                    rows={2}
                    placeholder="例如：开头留人弱 / 选题不清 / 互动性差"
                    disabled={!isEditable}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="diagnosis-feedback" className="text-[12px] font-normal text-stone-500">建议及改进反馈</label>
                  <textarea
                    id="diagnosis-feedback"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 p-3 text-[12px] leading-[1.7] text-stone-700 placeholder:text-stone-500 focus:border-stone-500 focus:bg-white focus:shadow-sm focus:outline-none focus:ring-1 focus:ring-stone-900/5"
                    rows={6}
                    placeholder="请输入针对该视频的具体文案改进、口语演绎或视觉剪辑优化意见"
                    disabled={!isEditable}
                  />
                </div>

                {/* Employee reply show */}
                {cardDetail?.employee_reply_status && cardDetail.employee_reply_status !== "pending" && (
                  <div className={`rounded-xl border p-4 space-y-2 ${
                    cardDetail.employee_reply_status === "acknowledged" 
                      ? "border-green-200 bg-green-50/30 text-green-900" 
                      : "border-amber-200 bg-amber-50/30 text-amber-900"
                  }`}>
                    <div className="flex items-center gap-1.5 text-[12px] font-medium">
                      <span className={`size-1.5 rounded-full ${
                        cardDetail.employee_reply_status === "acknowledged" ? "bg-green-500" : "bg-amber-500"
                      }`} />
                      员工复盘：{cardDetail.employee_reply_status === "acknowledged" ? "认可并采纳" : "提出申诉/解释"}
                    </div>
                    {cardDetail.employee_reply_text && (
                      <p className="text-[12px] leading-relaxed text-stone-700 pl-3 border-l-2 border-stone-300">
                        {cardDetail.employee_reply_text}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Footer Actions */}
          <footer className="border-t border-stone-200 bg-white px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] text-stone-500">
              {cardDetail && cardDetail.workflow_status !== "not_started" ? (
                <Badge
                  variant="outline"
                  className={`h-6 rounded-md px-2 text-[12px] font-medium gap-1 ${
                    cardDetail.workflow_status === "sent" || cardDetail.workflow_status === "viewed"
                      ? "border-green-200 bg-green-50 text-[#3f6f4d]"
                      : "border-stone-200 bg-stone-50 text-stone-700"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      cardDetail.workflow_status === "sent" || cardDetail.workflow_status === "viewed"
                        ? "bg-green-500"
                        : "bg-[#D99E55]"
                    }`}
                  />
                  {cardDetail.workflow_label}
                </Badge>
              ) : (
                <span className="text-stone-500">未开始</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isLocked ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg text-[12px]"
                    onClick={handleManualSaveDraft}
                  >
                    保存草稿
                  </Button>
                  <Button
                    size="sm"
                    className={`h-8 rounded-lg px-4 text-[12px] text-white transition-all duration-150 active:scale-[0.98] ${
                      showSendConfirm
                        ? "bg-[#B24E3E] hover:bg-[#B54D3C] animate-shake"
                        : "bg-[#B4532F] hover:bg-[#A84D2B]"
                    }`}
                    onClick={() => {
                      if (!showSendConfirm) {
                        setShowSendConfirm(true);
                        setTimeout(() => setShowSendConfirm(false), 5000);
                      } else {
                        handleConfirmAndSend();
                        setShowSendConfirm(false);
                      }
                    }}
                    disabled={!canConfirm}
                  >
                    {isConfirming ? "下发中..." : showSendConfirm ? "再次点击下发给员工" : "确认并下发"}
                  </Button>
                </>
              ) : (
                <span className="text-[12px] font-normal text-stone-500">已下发（不可编辑）</span>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-8 rounded-lg"
                      aria-label="更多操作"
                    />
                  }
                >
                  <MoreHorizontal className="size-4 text-stone-500" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} className="rounded-xl">
                  <DropdownMenuItem
                    onClick={() => handleMarkExperience("feedback", "hot_case")}
                    disabled={isMarkingExperience}
                    className="text-[12px]"
                  >
                    沉淀为爆款案例
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleMarkExperience("feedback", "fail_case")}
                    disabled={isMarkingExperience}
                    className="text-[12px]"
                  >
                    沉淀为失败案例
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </footer>
        </div>
      </div>

      {/* Fullscreen Overlay Preview */}
      {showOverlay && createPortal(
        <ScreenshotPreview
          items={screenshotItems}
          index={previewIndex!}
          onClose={() => setPreviewIndex(null)}
          onPrev={() => setPreviewIndex((i) => i === null ? null : (i - 1 + screenshotItems.length) % screenshotItems.length)}
          onNext={() => setPreviewIndex((i) => i === null ? null : (i + 1) % screenshotItems.length)}
        />,
        document.body,
      )}
    </motion.div>
  );
}

// ─── MetricBarCard ───
interface MetricBarCardProps {
  label: string;
  current: number | null | undefined;
  history: number | null | undefined;
  team: number | null | undefined;
  formatter: (v: number | null | undefined) => string;
  lowerIsBetter?: boolean;
}

function MetricBarCard({ label, current, history, team, formatter, lowerIsBetter = false }: MetricBarCardProps) {
  const currentVal = current ?? 0;
  const historyVal = history ?? 0;
  const teamVal = team ?? 0;
  
  const max = Math.max(currentVal, historyVal, teamVal, 1);
  const currentPct = (currentVal / max) * 100;
  const historyPct = (historyVal / max) * 100;
  const teamPct = (teamVal / max) * 100;

  // Determine comparison highlight
  const diffFromHistory = current != null && history != null && history !== 0 ? ((current - history) / Math.abs(history)) * 100 : null;
  const showWarning = diffFromHistory != null && (lowerIsBetter ? diffFromHistory > 8 : diffFromHistory < -8);
  const showSuccess = diffFromHistory != null && (lowerIsBetter ? diffFromHistory < -8 : diffFromHistory > 8);

  return (
    <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3 text-left">
      <div className="flex justify-between items-baseline">
        <span className="text-[12px] font-normal text-stone-500">{label}</span>
        <span className={`text-[12px] font-medium ${
          showWarning ? "text-[#B24E3E]" : showSuccess ? "text-[#3F7A4E]" : "text-stone-700"
        }`}>
          {formatter(current)}
        </span>
      </div>
      
      {/* Custom Flex Mini Bar chart */}
      <div className="space-y-1 pt-1">
        <MiniBar label="本条" pct={currentPct} color={showWarning ? "bg-[#C9604D]" : showSuccess ? "bg-[#6FAA7D]" : "bg-[#D97757]"} />
        <MiniBar label="历史" pct={historyPct} color="bg-stone-400" />
        <MiniBar label="团队" pct={teamPct} color="bg-stone-300" />
      </div>
    </div>
  );
}

function MiniBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[12px] leading-none text-stone-500">
      <span className="w-6 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-[width] duration-500 ease-out`} style={{ width: `${Math.max(5, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

// ─── SegmentedControl ───
function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-1 rounded-xl bg-stone-100/80 p-0.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map(([key, label]) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(key)}
            className={`active:scale-[0.98] rounded-lg py-1.5 text-[12px] font-medium transition-all ${
              active
                ? "border border-stone-200 bg-white text-[#B4532F]"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── ScreenshotPreview ───
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
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-stone-950/60 backdrop-blur-md"
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
              onClick={(e) => { e.stopPropagation(); onPrev(); }}
              className="absolute left-5 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3"
            >
              ←
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onNext(); }}
              className="absolute right-5 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3"
            >
              →
            </button>
          </>
        )}

        <div className="relative max-h-[85vh] max-w-[85vw]" onClick={(e) => e.stopPropagation()}>
          <Image
            src={current.url}
            alt={current.label}
            width={1600}
            height={1200}
            unoptimized
            className="rounded-xl border border-white/10 bg-black object-contain max-h-[85vh] max-w-[85vw]"
          />
        </div>
        <p className="mt-4 text-[12px] font-medium text-white/80">{current.label}</p>
      </motion.div>
    </AnimatePresence>
  );
}
