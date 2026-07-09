"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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

interface ContentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: VideoRow | null;
  snapshot: VideoMetricsSnapshot | null;
  feedbackCard: ContentFeedbackCardView | null;
  onFeedbackCardChanged: (videoId: string, view: ContentFeedbackCardView) => void;
  onNavigateToNext?: () => void;
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
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
};

type AllComparisonData = {
  loading: boolean;
  previous: (ComparisonMetricRow & { title: string | null; published_at: string | null }) | null;
  recent3: (ComparisonMetricRow & { count: number }) | null;
  error: string | null;
};

const statusBadgeClass: Record<Video["anomaly_status"], string> = {
  正常: "border-stone-200 bg-white text-stone-600",
  删稿: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]",
  限流: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]",
  投流: "border-[#D99E55]/30 bg-[#D99E55]/5 text-[#9c7437]",
  活动干预: "border-[#D99E55]/30 bg-[#D99E55]/5 text-[#9c7437]",
  未满24h: "border-stone-200 bg-stone-100 text-stone-500",
};

function formatNumber(v: number | null | undefined) {
  if (v == null) return "-";
  return new Intl.NumberFormat("zh-CN").format(v);
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

function formatDateTime(v: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatRelative(date: Date | null): string {
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 5_000) return "刚刚已保存";
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前已保存`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前已保存`;
  return "已保存";
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

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-[12px] font-medium text-stone-400">
      {children}
    </div>
  );
}

function EmptyBlock({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-4 text-[13px] text-stone-500">
      {children}
    </div>
  );
}

function ComparisonTableRow({
  label,
  snapshot,
  metricRow,
  baseSnapshot,
  isCurrent,
}: {
  label: string;
  snapshot?: VideoMetricsSnapshot | null;
  metricRow?: ComparisonMetricRow | null;
  baseSnapshot: VideoMetricsSnapshot | null;
  isCurrent?: boolean;
}) {
  return (
    <tr className={cn("border-b border-stone-100", isCurrent && "bg-stone-50/50")}>
      <td className="sticky left-0 bg-white py-2 pl-3 pr-2 text-[12px] font-medium text-stone-500 whitespace-nowrap">
        {label}
      </td>
      {comparisonMetrics.map((metric) => {
        const rawValue = snapshot ? metric.read(snapshot) : metricRow ? (metricRow as unknown as Record<string, number | null>)[metric.key] : null;
        const value = rawValue != null && metric.key !== "bounce_rate_2s" && metric.key !== "completion_rate_5s" && metric.key !== "completion_rate" && metric.key !== "avg_play_duration"
          ? Math.round(rawValue)
          : rawValue;
        const formatted = metric.format(value);
        let diffStr = "";
        let diffColor = "";
        if (!isCurrent && baseSnapshot && value != null && value !== 0) {
          const base = metric.read(baseSnapshot);
          if (base != null) {
            const pct = ((base - value) / Math.abs(value)) * 100;
            if (Number.isFinite(pct) && Math.abs(pct) >= 3) {
              diffStr = `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
              const better = metric.higherIsBetter ? pct > 0 : pct < 0;
              diffColor = better ? "text-[#C9604D]" : "text-[#6FAA7D]";
            }
          }
        }
        return (
          <td key={metric.key} className="whitespace-nowrap py-2 px-1.5 text-left tabular-nums text-[12px]">
            <span className={cn("font-semibold", isCurrent ? "text-stone-900" : "text-stone-700")}>{formatted}</span>
            {diffStr && (
              <span className={cn("ml-1 text-[12px] font-medium", diffColor)}>{diffStr}</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

type MetricTone = "default" | "amber" | "red" | "halve";

type RuleHintLevel = "high" | "low" | "weak" | "healthy";
type RuleHintChip = { metric: string; status: string; level: RuleHintLevel };

function buildRuleHints(snapshot: VideoMetricsSnapshot | null): RuleHintChip[] {
  if (!snapshot) return [];

  const chips: RuleHintChip[] = [];
  if (snapshot.bounce_rate_2s != null) {
    chips.push(
      snapshot.bounce_rate_2s >= 45
        ? { metric: "2s跳出", status: "偏高", level: "high" }
        : { metric: "2s跳出", status: "健康", level: "healthy" },
    );
  }
  if (snapshot.completion_rate_5s != null) {
    chips.push(
      snapshot.completion_rate_5s < 35
        ? { metric: "5s完播", status: "偏低", level: "low" }
        : { metric: "5s完播", status: "健康", level: "healthy" },
    );
  }
  if (snapshot.completion_rate != null) {
    chips.push(
      snapshot.completion_rate < 18
        ? { metric: "完播", status: "偏低", level: "low" }
        : { metric: "完播", status: "健康", level: "healthy" },
    );
  }
  if (snapshot.follower_gain != null && snapshot.play_count > 0) {
    const followRate = (snapshot.follower_gain / snapshot.play_count) * 100;
    chips.push(
      followRate < 0.05
        ? { metric: "涨粉", status: "偏弱", level: "weak" }
        : { metric: "涨粉", status: "健康", level: "healthy" },
    );
  }
  return chips;
}

const comparisonMetrics: Array<{
  label: string;
  key: string;
  read: (snapshot: VideoMetricsSnapshot) => number | null;
  format: (value: number | null | undefined) => string;
  higherIsBetter: boolean;
}> = [
  { label: "播放", key: "play_count", read: (s) => s.play_count, format: formatNumber, higherIsBetter: true },
  { label: "2s跳出", key: "bounce_rate_2s", read: (s) => s.bounce_rate_2s, format: formatRate, higherIsBetter: false },
  { label: "5s完播", key: "completion_rate_5s", read: (s) => s.completion_rate_5s, format: formatRate, higherIsBetter: true },
  { label: "完播", key: "completion_rate", read: (s) => s.completion_rate, format: formatRate, higherIsBetter: true },
  { label: "均播", key: "avg_play_duration", read: (s) => s.avg_play_duration, format: formatSeconds, higherIsBetter: true },
  { label: "赞", key: "likes", read: (s) => s.likes, format: formatNumber, higherIsBetter: true },
  { label: "评论", key: "comments", read: (s) => s.comments, format: formatNumber, higherIsBetter: true },
  { label: "转发", key: "shares", read: (s) => s.shares, format: formatNumber, higherIsBetter: true },
  { label: "藏", key: "favorites", read: (s) => s.favorites, format: formatNumber, higherIsBetter: true },
  { label: "粉", key: "follower_gain", read: (s) => s.follower_gain, format: formatNumber, higherIsBetter: true },
];

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
      className={cn(
        "grid gap-1 rounded-lg bg-stone-100/70 p-1",
        `grid-cols-${options.length}`,
      )}
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
            className={cn(
              "active:translate-y-0 rounded-md px-3 py-1.5 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
              active
                ? "bg-white text-[#D97757] shadow-sm"
                : "text-stone-500 hover:text-stone-800",
            )}
          >
            {label}
          </button>
        );
      })}
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
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrev();
      if (event.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext]);

  const current = items[index];
  if (!current) return null;
  const total = items.length;

  return (
    <AnimatePresence>
      <motion.div
        key="screenshot-overlay"
        className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-stone-950/80 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
      >
        <button
          type="button"
          aria-label="关闭预览"
          className="active:translate-y-0 absolute top-5 right-5 inline-flex size-9 items-center justify-center rounded-lg bg-white/10 text-white transition-[background-color] duration-150 hover:bg-white/20"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <XIcon className="size-4 stroke-[1.5]" />
        </button>
        {total > 1 && (
          <>
            <button
              type="button"
              aria-label="上一张"
              className="active:translate-y-0 absolute left-5 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-lg bg-white/10 text-white transition-[background-color] duration-150 hover:bg-white/20"
              onClick={(event) => {
                event.stopPropagation();
                onPrev();
              }}
            >
              <ChevronLeftIcon className="size-5 stroke-[1.5]" />
            </button>
            <button
              type="button"
              aria-label="下一张"
              className="active:translate-y-0 absolute right-5 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-lg bg-white/10 text-white transition-[background-color] duration-150 hover:bg-white/20"
              onClick={(event) => {
                event.stopPropagation();
                onNext();
              }}
            >
              <ChevronRightIcon className="size-5 stroke-[1.5]" />
            </button>
          </>
        )}
        <motion.div
          key={current.url}
          className="relative max-h-[88vh] max-w-[88vw]"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          onClick={(event) => event.stopPropagation()}
        >
          <Image
            src={current.url}
            alt={current.label}
            width={1600}
            height={1200}
            unoptimized
            className="max-h-[88vh] max-w-[88vw] rounded-xl bg-white object-contain"
          />
        </motion.div>
        <div className="mt-4 flex items-center gap-3 text-[12px] text-white/80">
          <span>{current.label}</span>
          {total > 1 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 tabular-nums">
              {index + 1} / {total}
            </span>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export function ContentDetailDialog({
  open,
  onOpenChange,
  video,
  snapshot,
  feedbackCard: feedbackCardProp,
  onFeedbackCardChanged,
  onNavigateToNext,
}: ContentDetailDialogProps) {
  const reduceMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<DetailTab>("analysis");
  const [contentExpanded, setContentExpanded] = useState(false);
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

  // 自动保存草稿状态
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [, setDraftTick] = useState(0);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(true);

  const fetchComparison = useCallback((videoId: string) => {
    setComparison({ loading: true, previous: null, recent3: null, error: null });
    fetch(`/api/admin/content-comparison/${videoId}`)
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
    if (!open || !video) {
      setCardDetail(null);
      setPreviewIndex(null);
      return;
    }
    setActiveTab("analysis");
    setContentExpanded(false);
    setComparison({ loading: true, previous: null, recent3: null, error: null });
    setMainIssues("");
    setFeedback("");
    setObservation(defaultObservation);
    setAnalysisResult(null);
    setReusableOpen(false);
    setCardDetail(null);
    setDraftSavedAt(null);
    skipNextSaveRef.current = true;

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
        } else if (feedbackCardProp) {
          setCardDetail({ ...feedbackCardProp, draft: null, confirmed: null });
        }
      })
      .catch(() => {});

    fetchComparison(video.id);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, video?.id]);

  // 已下发 / 已查看后禁用编辑
  const isLocked =
    cardDetail?.workflow_status === "sent" || cardDetail?.workflow_status === "viewed";
  const isEditable = !isLocked;

  // 自动保存：mainIssues / feedback 任一变更，防抖 1.5s 写 save_draft
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
        }
        setDraftSavedAt(new Date());
      } catch {
        // 自动保存静默失败，不打扰用户
      } finally {
        setIsSavingDraft(false);
      }
    }, 1500);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainIssues, feedback]);

  // 相对时间 tick
  useEffect(() => {
    if (!draftSavedAt) return;
    const id = setInterval(() => setDraftTick((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, [draftSavedAt]);

  const ruleHints = useMemo(() => buildRuleHints(snapshot), [snapshot]);
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

  // 异常摘要带数据
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

  // 对比表差值与最大差异行
  const maxPrevDiff = useMemo(() => {
    if (!snapshot || !comparison.previous) return null;
    let max = 0;
    let result: { label: string; diffPct: number } | null = null;
    for (const metric of comparisonMetrics) {
      const cur = metric.read(snapshot);
      const prev = (comparison.previous as unknown as Record<string, number | null>)[metric.key];
      if (cur != null && prev != null && prev !== 0) {
        const pct = ((cur - prev) / Math.abs(prev)) * 100;
        if (Math.abs(pct) > max) {
          max = Math.abs(pct);
          result = { label: metric.label, diffPct: pct };
        }
      }
    }
    return max >= 10 ? result : null;
  }, [snapshot, comparison.previous]);

  const feedbackEvidence = useMemo(() => {
    const list: string[] = [];
    if (snapshot?.completion_rate_5s != null && snapshot.completion_rate_5s < 35) {
      list.push(`5s 完播 ${formatRate(snapshot.completion_rate_5s)}（低于阈值）`);
    }
    if (snapshot?.bounce_rate_2s != null && snapshot.bounce_rate_2s >= 45) {
      list.push(`2s 跳出 ${formatRate(snapshot.bounce_rate_2s)}（高于阈值）`);
    }
    if (snapshot?.completion_rate != null && snapshot.completion_rate < 18) {
      list.push(`完播 ${formatRate(snapshot.completion_rate)}（低于阈值）`);
    }
    if (maxPrevDiff) {
      const sign = maxPrevDiff.diffPct > 0 ? "+" : "";
      list.push(`${maxPrevDiff.label} 较上一条 ${sign}${maxPrevDiff.diffPct.toFixed(1)}%`);
    }
    if (analysisResult?.data_summary) {
      list.push(`AI 判断：${analysisResult.data_summary}`);
    }
    return list;
  }, [snapshot, maxPrevDiff, analysisResult]);

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
      feedbackToast.success("已确认并下发给员工");
      if (onNavigateToNext) {
        setTimeout(() => {
          onNavigateToNext();
        }, 500);
      }
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
      if (data.feedback_card) setCardDetail(data.feedback_card);
      setDraftSavedAt(new Date());
      feedbackToast.success("已保存草稿");
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
      if (!silent) feedbackToast.success("观察已保存");
    } catch (error) {
      if (!silent) feedbackToast.error(error instanceof Error ? error.message : "保存观察失败");
    }
  }

  async function handleGenerateAnalysis() {
    if (!video) return;
    setIsGeneratingAnalysis(true);
    try {
      // 生成前先静默保存观察，避免观察数据丢失
      await handleSaveObservation(true);
      const res = await fetch("/api/admin/content-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: video.id }),
      });
      const data = (await res.json()) as ContentAnalysisResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "生成辅助分析失败");
      setAnalysisResult(data);
      feedbackToast.success("辅助分析已生成");
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
    feedbackToast.success("已引用到反馈，尚未保存或下发");
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
      feedbackToast.success(
        experienceType === "hot_case"
          ? "已标记为爆款"
          : experienceType === "fail_case"
            ? "已标记为失败案例"
            : "已标记为经验",
      );
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "标记经验失败");
    } finally {
      setIsMarkingExperience(false);
    }
  }

  const handleClosePreview = useCallback(() => setPreviewIndex(null), []);
  const handlePrevPreview = useCallback(() => {
    setPreviewIndex((i) =>
      i == null ? i : (i - 1 + screenshotItems.length) % screenshotItems.length,
    );
  }, [screenshotItems.length]);
  const handleNextPreview = useCallback(() => {
    setPreviewIndex((i) => (i == null ? i : (i + 1) % screenshotItems.length));
  }, [screenshotItems.length]);

  const canConfirm = (mainIssues.trim().length > 0 || feedback.trim().length > 0) && !isConfirming;
  const submittedDraft = cardDetail?.workflow_status === "draft" || draftSavedAt != null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-4xl gap-0 sm:max-w-4xl"
      >
        <SheetHeader className="gap-3 px-6 pt-6 pb-4">
          <div className="pr-10">
            <SheetTitle className="text-[18px] font-medium tracking-tight">
              {video?.video_title || "内容详情"}
            </SheetTitle>
            {video && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-stone-500">
                <span className="text-stone-700">{video.profiles.name}</span>
                <span className="text-stone-300">·</span>
                <span>{video.accounts.name}</span>
                <span className="text-stone-300">·</span>
                <span>发布 {formatDateTime(video.published_at)}</span>
                <span className="text-stone-300">·</span>
                <span>上传 {formatDateTime(video.uploaded_at ?? video.created_at)}</span>
                {video.video_url && (
                  <>
                    <span className="text-stone-300">·</span>
                    <a
                      href={video.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#D97757] underline-offset-4 hover:underline"
                    >
                      抖音原片
                    </a>
                  </>
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    "h-5 rounded-md border px-1.5 text-[12px] font-medium",
                    statusBadgeClass[video.anomaly_status],
                  )}
                >
                  {video.anomaly_status}
                </Badge>
              </div>
            )}
          </div>

          {anomalyChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-100/50 px-3 py-2">
              <Eyebrow>异常摘要</Eyebrow>
              <div className="flex flex-wrap items-center gap-1.5">
                {anomalyChips.map((chip) => (
                  <span
                    key={chip.label}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium tabular-nums",
                      chip.tone === "red" &&
                        "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]",
                      chip.tone === "amber" &&
                        "border-[#B5651D]/30 bg-[#B5651D]/5 text-[#B5651D]",
                      chip.tone === "halve" &&
                        "border-[#2E7D32]/30 bg-[#2E7D32]/5 text-[#2E7D32]",
                    )}
                  >
                    <span className="text-stone-500">{chip.label}</span>
                    <span>{chip.value}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </SheetHeader>

        <SheetBody className="px-6 py-4">
          {video && (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as DetailTab)}
              className="gap-5"
            >
              <TabsList variant="line" className="w-full justify-start">
                <TabsTrigger value="analysis" className="px-4">
                  分析
                </TabsTrigger>
                <TabsTrigger value="feedback" className="px-4">
                  反馈
                </TabsTrigger>
              </TabsList>

              <TabsContent value="analysis" className="space-y-5">
                {/* 文案原文（默认 inline truncate，展开后才出盆地） */}
                {video.content && (
                  <section className="space-y-2">
                    {contentExpanded ? (
                      <>
                        <div className="flex items-baseline justify-between">
                          <Eyebrow>文案原文</Eyebrow>
                          <button
                            type="button"
                            className="text-[12px] text-stone-500 hover:text-stone-800"
                            onClick={() => setContentExpanded(false)}
                          >
                            收起
                          </button>
                        </div>
                        <div className="rounded-xl bg-stone-100/50 p-4">
                          <div className="whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-stone-700">
                            {video.content}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-baseline gap-3">
                        <span className="shrink-0 text-[12px] font-medium text-stone-400">
                          文案
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-stone-600">
                          {video.content}
                        </span>
                        {video.content.length > 80 && (
                          <button
                            type="button"
                            className="shrink-0 text-[12px] text-[#D97757] hover:underline underline-offset-4"
                            onClick={() => setContentExpanded(true)}
                          >
                            展开
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* 数据对比表 */}
                <section className="space-y-3">
                  <Eyebrow>数据对比</Eyebrow>
                  {snapshot ? (
                    <div className="overflow-x-auto rounded-lg border border-stone-200">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-stone-200 bg-stone-50">
                            <th className="sticky left-0 bg-stone-50 py-1.5 pl-3 pr-2 text-left font-medium text-stone-400 text-[12px]"></th>
                            {comparisonMetrics.map((m) => (
                              <th key={m.key} className="whitespace-nowrap py-1.5 px-1.5 text-left font-medium text-stone-400 text-[12px]">
                                {m.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <ComparisonTableRow
                            label="本条"
                            snapshot={snapshot}
                            baseSnapshot={null}
                            isCurrent
                          />
                          {comparison.loading ? (
                            <tr><td colSpan={11} className="py-3 text-center text-stone-400">加载中...</td></tr>
                          ) : comparison.error ? (
                            <tr><td colSpan={11} className="py-3 text-center text-stone-400">{comparison.error}</td></tr>
                          ) : (
                            <>
                              {comparison.previous && (
                                <ComparisonTableRow
                                  label="上一条"
                                  metricRow={comparison.previous}
                                  baseSnapshot={snapshot}
                                />
                              )}
                              {comparison.recent3 && (
                                <ComparisonTableRow
                                  label={`近3条`}
                                  metricRow={comparison.recent3}
                                  baseSnapshot={snapshot}
                                />
                              )}
                              {!comparison.previous && !comparison.recent3 && (
                                <tr><td colSpan={11} className="py-3 text-center text-stone-400">暂无对比数据</td></tr>
                              )}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyBlock>暂无 24h 快照数据</EmptyBlock>
                  )}
                </section>

                {/* 截图左右对比 */}
                {screenshotItems.length > 0 && (
                  <section className="space-y-2">
                    <Eyebrow>截图</Eyebrow>
                    <div className="grid grid-cols-2 gap-3">
                      {screenshotItems.slice(0, 2).map((item, index) => (
                        <button
                          key={`${item.label}-${item.url}`}
                          type="button"
                          className="group overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition-[box-shadow,border-color] duration-150 hover:border-stone-300 hover:shadow-sm active:translate-y-0"
                          onClick={() => setPreviewIndex(index)}
                        >
                          <Image
                            src={item.url}
                            alt={item.label}
                            width={720}
                            height={360}
                            unoptimized
                            className="w-full object-cover transition-transform duration-200 group-hover:scale-[1.01] h-48"
                          />
                          <div className="px-3 py-2 text-[12px] text-stone-500">{item.label}</div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* 规则提示 inline chip */}
                {ruleHints.length > 0 && (
                  <section className="space-y-2">
                    <Eyebrow>规则指标提示</Eyebrow>
                    <div className="flex flex-wrap gap-2">
                      {ruleHints.map((chip) => {
                        const statusTone =
                          chip.level === "high" || chip.level === "low"
                            ? "text-[#C9604D]"
                            : chip.level === "weak"
                              ? "text-[#9c7437]"
                              : "text-[#3f6f4d]";
                        return (
                          <span
                            key={chip.metric}
                            className="inline-flex items-center gap-1.5 rounded-md bg-stone-100/60 px-2 py-1 text-[12px]"
                          >
                            <span className="text-stone-600">{chip.metric}</span>
                            <span className={cn("font-medium", statusTone)}>
                              {chip.status}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* 曲线观察（裸排紧凑） */}
                <section className="space-y-3">
                  <Eyebrow>曲线观察</Eyebrow>
                  <div className="space-y-2.5">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-[12px] text-stone-500">推流峰值</label>
                        <Select
                          value={observation.traffic_peak_level}
                          onValueChange={(v) =>
                            setObservation((prev) => ({
                              ...prev,
                              traffic_peak_level: v as ObservationForm["traffic_peak_level"],
                            }))
                          }
                        >
                          <SelectTrigger className="h-8 w-full text-[12px]">
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
                        <label className="text-[12px] text-stone-500">峰值后走势</label>
                        <Select
                          value={observation.post_peak_trend}
                          onValueChange={(v) =>
                            setObservation((prev) => ({
                              ...prev,
                              post_peak_trend: v as ObservationForm["post_peak_trend"],
                            }))
                          }
                        >
                          <SelectTrigger className="h-8 w-full text-[12px]">
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
                        <label className="text-[12px] text-stone-500">流量承接</label>
                        <Select
                          value={observation.traffic_retention_quality}
                          onValueChange={(v) =>
                            setObservation((prev) => ({
                              ...prev,
                              traffic_retention_quality: v as ObservationForm["traffic_retention_quality"],
                            }))
                          }
                        >
                          <SelectTrigger className="h-8 w-full text-[12px]">
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

                    <div className="space-y-1">
                      <label className="text-[12px] text-stone-500">跳出集中阶段</label>
                      <SegmentedControl
                        value={observation.drop_off_stage}
                        options={dropOffStageOptions}
                        onChange={(v) =>
                          setObservation((prev) => ({ ...prev, drop_off_stage: v }))
                        }
                        ariaLabel="跳出集中阶段"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[12px] text-stone-500">疑似问题阶段</label>
                      <SegmentedControl
                        value={observation.suspected_problem_stage}
                        options={suspectedStageOptions}
                        onChange={(v) =>
                          setObservation((prev) => ({ ...prev, suspected_problem_stage: v }))
                        }
                        ariaLabel="疑似问题阶段"
                      />
                    </div>

                    <textarea
                      value={observation.note}
                      onChange={(event) =>
                        setObservation((prev) => ({ ...prev, note: event.target.value }))
                      }
                      className="w-full resize-none rounded-lg border border-transparent bg-stone-100/70 p-2.5 text-[12px] leading-[1.7] text-stone-800 placeholder:text-stone-400 transition-[background-color,border-color,box-shadow] duration-150 focus:border-stone-200 focus:bg-white focus:shadow-sm focus:outline-none focus:ring-1 focus:ring-stone-950/5"
                      rows={2}
                      placeholder="观察备注（自动保存）"
                    />

                    <div className="flex justify-end pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 rounded-lg border-stone-200 bg-white text-[12px] text-stone-700 hover:bg-stone-50 hover:text-stone-900 active:scale-[0.98] transition-all duration-150"
                        onClick={handleGenerateAnalysis}
                        disabled={isGeneratingAnalysis}
                      >
                        <SparklesIcon className="size-3.5 stroke-[1.5]" />
                        {isGeneratingAnalysis ? "AI 分析中..." : "生成 AI 辅助分析"}
                      </Button>
                    </div>
                  </div>
                </section>

                {/* AI 辅助分析（破格主角：次级盆地 + 2px左导轨） */}
                {(isGeneratingAnalysis || analysisResult) && (
                  <section className="space-y-2">
                    <div className="rounded-xl border border-stone-200 border-l-2 border-l-[#D97757] bg-stone-100/50 p-5">
                      <div className="flex items-center gap-1.5">
                        <SparklesIcon className="size-3.5 stroke-[1.5] text-[#D97757]" />
                        <Eyebrow>AI 辅助分析</Eyebrow>
                      </div>

                      {isGeneratingAnalysis && !analysisResult ? (
                        <div className="mt-4 space-y-3">
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-5/6" />
                          <div className="flex gap-2 pt-1">
                            <Skeleton className="h-6 w-20 rounded-full" />
                            <Skeleton className="h-6 w-24 rounded-full" />
                            <Skeleton className="h-6 w-16 rounded-full" />
                          </div>
                        </div>
                      ) : analysisResult ? (
                        <motion.div
                          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                          className="mt-3 space-y-4"
                        >
                          <p className="text-[18px] font-bold leading-[1.55] text-stone-900">
                            {analysisResult.data_summary}
                          </p>

                          <div className="flex flex-wrap gap-1.5">
                            {analysisResult.suspected_stage.map((stage) => (
                              <span
                                key={stage}
                                className="inline-flex items-center rounded-full border border-stone-200 bg-white/80 px-2.5 py-0.5 text-[12px] font-medium text-stone-700"
                              >
                                疑似 · {stage}
                              </span>
                            ))}
                            {analysisResult.key_metric_evidence.slice(0, 3).map((ev) => (
                              <span
                                key={ev}
                                className="inline-flex items-center rounded-full border border-stone-200 bg-white/80 px-2.5 py-0.5 text-[12px] font-medium tabular-nums text-stone-600"
                              >
                                {ev}
                              </span>
                            ))}
                          </div>

                          {analysisResult.copywriting_reason && (
                            <p className="text-[13px] leading-[1.7] text-stone-600">
                              <span className="text-stone-400">文案：</span>
                              {analysisResult.copywriting_reason}
                            </p>
                          )}

                          {analysisResult.reusable_experience && (
                            <Collapsible open={reusableOpen} onOpenChange={setReusableOpen}>
                              <CollapsibleTrigger
                                render={
                                  <button
                                    type="button"
                                    className="active:translate-y-0 inline-flex items-center gap-1 text-[12px] font-medium text-stone-500 hover:text-stone-800"
                                  >
                                    <ChevronRightIcon
                                      className={cn(
                                        "size-3.5 stroke-[1.5] transition-transform duration-150",
                                        reusableOpen && "rotate-90",
                                      )}
                                    />
                                    可复用经验
                                  </button>
                                }
                              />
                              <CollapsibleContent className="data-[ending-style]:fade-out-0 data-[starting-style]:fade-in-0">
                                <div className="mt-2 rounded-lg bg-white/70 border border-stone-200 p-3 text-[13px] leading-[1.7] text-stone-700">
                                  {analysisResult.reusable_experience}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          )}

                          <div className="space-y-2 pt-2">
                            <p className="text-[12px] text-stone-400">
                              引用后仅填入反馈字段，不会自动保存或下发
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                className="h-9 rounded-lg bg-[#D97757] px-4 text-[12px] text-white hover:bg-[#C96442]"
                                onClick={handleQuoteAnalysisToFeedback}
                              >
                                引用到反馈
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 rounded-lg border-stone-200 bg-white/80 text-[12px]"
                                onClick={() => handleMarkExperience("analysis", "hot_case")}
                                disabled={isMarkingExperience}
                              >
                                沉淀为爆款案例
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      ) : null}
                    </div>
                  </section>
                )}
              </TabsContent>

              <TabsContent value="feedback" className="space-y-4">
                {/* 复盘依据 inline */}
                {feedbackEvidence.length > 0 && (
                  <div className="rounded-lg bg-stone-100/50 px-3 py-2.5 text-[12px] leading-[1.7] text-stone-600">
                    <span className="text-stone-400">依据 · </span>
                    {feedbackEvidence.map((line, i) => (
                      <span key={line}>
                        {i > 0 && <span className="text-stone-300"> · </span>}
                        <span className="text-stone-700">{line}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-stone-700">主要问题</label>
                  <textarea
                    value={mainIssues}
                    onChange={(e) => setMainIssues(e.target.value)}
                    className="w-full resize-none rounded-xl border border-transparent bg-stone-100/70 p-3 text-[13px] leading-[1.7] text-stone-800 placeholder:text-stone-400 transition-[background-color,border-color,box-shadow] duration-150 focus:border-stone-200 focus:bg-white focus:shadow-sm focus:outline-none focus:ring-1 focus:ring-stone-950/5"
                    rows={2}
                    placeholder="例如：开头留人弱 / 选题不清 / 文案承接差"
                    disabled={!isEditable}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-stone-700">改进反馈</label>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="w-full resize-none rounded-xl border border-transparent bg-stone-100/70 p-3 text-[13px] leading-[1.7] text-stone-800 placeholder:text-stone-400 transition-[background-color,border-color,box-shadow] duration-150 focus:border-stone-200 focus:bg-white focus:shadow-sm focus:outline-none focus:ring-1 focus:ring-stone-950/5"
                    rows={5}
                    placeholder="写给员工的具体改进建议"
                    disabled={!isEditable}
                  />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </SheetBody>

        <SheetFooter className="flex-row items-center justify-between gap-3 border-t border-stone-200 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[12px] text-stone-500">
            {cardDetail && cardDetail.workflow_status !== "not_started" ? (
              <Badge
                variant="outline"
                className={cn(
                  "h-6 gap-1.5 rounded-md border px-2 text-[12px] font-medium",
                  cardDetail.workflow_status === "sent" || cardDetail.workflow_status === "viewed"
                    ? "border-[#6FAA7D]/30 bg-[#6FAA7D]/5 text-[#3f6f4d]"
                    : "border-stone-200 bg-white text-stone-600",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    cardDetail.workflow_status === "sent" ||
                      cardDetail.workflow_status === "viewed"
                      ? "bg-[#6FAA7D]"
                      : cardDetail.workflow_status === "draft"
                        ? "bg-[#D99E55]"
                        : "bg-stone-300",
                  )}
                />
                {cardDetail.workflow_label}
              </Badge>
            ) : (
              <span className="text-stone-400">未开始</span>
            )}
            {!isLocked &&
              (isSavingDraft ? (
                <span className="inline-flex items-center gap-1.5 text-stone-400">
                  <span className="size-1 rounded-full bg-[#D99E55]" />
                  保存中
                </span>
              ) : submittedDraft && draftSavedAt ? (
                <span className="text-stone-400">{formatRelative(draftSavedAt)}</span>
              ) : null)}
          </div>

          <div className="flex items-center gap-2">
            {!isLocked && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-lg text-[12px]"
                onClick={handleManualSaveDraft}
              >
                保存草稿
              </Button>
            )}
            {!isLocked && (
              <Button
                size="sm"
                className="h-9 rounded-lg bg-[#D97757] px-4 text-[12px] text-white hover:bg-[#C96442]"
                onClick={handleConfirmAndSend}
                disabled={!canConfirm}
              >
                {isConfirming ? "下发中..." : "确认并下发"}
              </Button>
            )}
            {isLocked && (
              <span className="text-[12px] text-stone-500">已下发，不可编辑</span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-9"
                    aria-label="更多操作"
                  />
                }
              >
                <MoreHorizontalIcon className="size-4 stroke-[1.5]" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6}>
                <DropdownMenuItem
                  onClick={() => handleMarkExperience("feedback", "hot_case")}
                  disabled={isMarkingExperience}
                >
                  沉淀为爆款案例
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleMarkExperience("feedback", "fail_case")}
                  disabled={isMarkingExperience}
                >
                  沉淀为失败案例
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SheetFooter>
      </SheetContent>

      {previewIndex !== null && screenshotItems[previewIndex] && createPortal(
        <ScreenshotPreview
          items={screenshotItems}
          index={previewIndex}
          onClose={handleClosePreview}
          onPrev={handlePrevPreview}
          onNext={handleNextPreview}
        />,
        document.body,
      )}
    </Sheet>
  );
}
