"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  Sparkles,
  ChevronLeft,
  Check,
  Plus,
  History,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { AttributionFinding, AttributionResult } from "@/lib/content-attribution";
import { METRIC_MAP_INDEX, RATE_METRICS, type MetricKey } from "@/lib/content-attribution-map";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

interface ContentDiagnosisWorkbenchProps {
  video: VideoRow | null;
  snapshot: VideoMetricsSnapshot | null;
  feedbackCard: ContentFeedbackCardView | null;
  onFeedbackCardChanged: (videoId: string, card: ContentFeedbackCardView) => void;
  onClose: () => void;
  anomalyVideos?: VideoRow[];
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


const statusBadgeClass: Record<Video["anomaly_status"], string> = {
  normal: "border-stone-200 bg-stone-50 text-[#6FAA7D]",
  abnormal: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]",
  正常: "border-stone-200 bg-stone-50 text-[#6FAA7D]",
  删稿: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]",
  限流: "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]",
  投流: "border-[#D99E55]/30 bg-[#D99E55]/5 text-[#C47A2B]",
  活动干预: "border-[#D99E55]/30 bg-[#D99E55]/5 text-[#C47A2B]",
  "未满24h": "border-stone-200 bg-stone-100 text-stone-500",
};

export function ContentDiagnosisWorkbench({
  video,
  snapshot,
  feedbackCard,
  onFeedbackCardChanged,
  onClose,
  profiles = [],
  onGoToNextVideo,
  anomalyVideos = [],
  onVideoSelect,
}: ContentDiagnosisWorkbenchProps & {
  profiles?: Array<{ id: string; name: string }>;
  onGoToNextVideo?: (videoId: string) => void;
}) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const currentIndex = useMemo(() => {
    if (!anomalyVideos || !video) return -1;
    return anomalyVideos.findIndex((v) => v.id === video.id);
  }, [anomalyVideos, video]);
  const [comparison, setComparison] = useState<AllComparisonData & {
    current?: ComparisonMetricRow | null;
    reference?: ComparisonMetricRow | null;
    ref_label?: string;
    ref_count?: number;
  }>({
    loading: false,
    previous: null,
    recent3: null,
    current: null,
    reference: null,
    ref_label: "对比自己近3条",
    ref_count: 0,
    error: null,
  });
  const [cardDetail, setCardDetail] = useState<ContentFeedbackCardDetail | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [mainIssues, setMainIssues] = useState("");
  const [feedback, setFeedback] = useState("");
  const [analysisResult, setAnalysisResult] = useState<ContentAnalysisResult | null>(null);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);

  const [isMarkingExperience, setIsMarkingExperience] = useState(false);
  const [highlightedSegmentIndex, setHighlightedSegmentIndex] = useState<number | null>(null);
  const [quotedIndices, setQuotedIndices] = useState<Set<number>>(new Set());
  const [showSendConfirm, setShowSendConfirm] = useState(false);

  type RefKey = "self" | "team" | "top" | "user";
  const [selectedRef, setSelectedRef] = useState<RefKey>("self");
  const [selectedRefUserId, setSelectedRefUserId] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<AttributionResult | null>(null);
  const [attributionLoading, setAttributionLoading] = useState(false);

  const [previousFeedback, setPreviousFeedback] = useState<{
    has_previous: boolean;
    previous?: {
      card_id: string;
      one_line: string;
      sent_at: string;
      message_for_member?: string;
      metrics?: Record<string, number | null>;
    };
  } | null>(null);
  const [previousFeedbackLoading, setPreviousFeedbackLoading] = useState(false);
  const [showPreviousFeedback, setShowPreviousFeedback] = useState(false);

  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(true);

  const fetchAttribution = useCallback((vId: string, ref: RefKey, refUserId?: string | null) => {
    setAttributionLoading(true);
    let url = `/api/admin/content-attribution/${vId}?ref=${ref}`;
    if (ref === "user" && refUserId) {
      url += `&refUserId=${refUserId}`;
    }
    fetch(url)
      .then((res) => res.json())
      .then((data: AttributionResult) => {
        setAttribution(data);
        setAttributionLoading(false);
      })
      .catch(() => setAttributionLoading(false));
  }, []);

  const fetchComparison = useCallback((vId: string, ref: RefKey, refUserId?: string | null) => {
    setComparison((prev) => ({ ...prev, loading: true }));
    let url = `/api/admin/content-comparison/${vId}?ref=${ref}`;
    if (ref === "user" && refUserId) {
      url += `&refUserId=${refUserId}`;
    }
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setComparison({ loading: false, previous: null, recent3: null, error: data.error, reference: null, ref_label: data.ref_label, ref_count: 0 });
          return;
        }
        setComparison({
          loading: false,
          current: data.current ?? null,
          previous: data.previous ?? null,
          recent3: data.recent3 ?? null,
          reference: data.reference ?? null,
          ref_label: data.ref_label,
          ref_count: data.ref_count ?? 0,
          error: null,
        });
      })
      .catch(() => {
        setComparison({ loading: false, previous: null, recent3: null, reference: null, ref_label: "", ref_count: 0, error: "对比数据加载失败" });
      });
  }, []);

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
    if (!video) return;
    setMainIssues("");
    setFeedback("");
    setAnalysisResult(null);
    setCardDetail(null);
    setDraftSavedAt(null);
    setHighlightedSegmentIndex(null);
    setQuotedIndices(new Set());
    setShowSendConfirm(false);
    setShowPreviousFeedback(false);
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
        } else if (feedbackCard) {
          setCardDetail({ ...feedbackCard, draft: null, confirmed: null });
        }
      })
      .catch(() => {});

    fetchPreviousFeedback(video.id);
  }, [video?.id, feedbackCard, fetchPreviousFeedback]);

  useEffect(() => {
    if (!video) return;
    if (selectedRef === "user" && !selectedRefUserId) return;
    fetchAttribution(video.id, selectedRef, selectedRefUserId);
    fetchComparison(video.id, selectedRef, selectedRefUserId);
  }, [video?.id, selectedRef, selectedRefUserId, fetchAttribution, fetchComparison]);

  const isLocked =
    cardDetail?.workflow_status === "sent" || cardDetail?.workflow_status === "viewed";
  const isEditable = !isLocked;

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
            },
            actions: {
              message_for_member: feedback.trim() || null,
            },
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { feedback_card?: ContentFeedbackCardDetail };
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
    const retention2s = snapshot.bounce_rate_2s != null ? Math.max(0, 100 - snapshot.bounce_rate_2s) : null;
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

  const feedbackEvidence = useMemo(() => {
    const list: string[] = [];
    if (attribution?.findings) {
      for (const f of attribution.findings) {
        if (f.tone === "bad" || f.tone === "warn") {
          list.push(`${f.metric_label} ${f.value != null ? f.value.toFixed(1) : ""}${RATE_METRICS.has(f.metric) ? "%" : ""} (${f.delta != null && f.delta !== 0 ? (f.delta > 0 ? "+" : "") + f.delta.toFixed(1) : ""})`);
        }
      }
    }
    if (analysisResult?.data_summary) {
      list.push(`AI：${analysisResult.data_summary}`);
    }
    return list;
  }, [attribution, analysisResult]);

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
          },
          actions: {
            message_for_member: feedback.trim() || null,
          },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; feedback_card?: ContentFeedbackCardDetail; error?: string };
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

  async function handleGenerateAnalysis() {
    if (!video) return;
    setIsGeneratingAnalysis(true);
    try {
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
      feedbackToast.error(error instanceof Error ? error.message : "标记经验失败");
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

  const handleLocateFinding = useCallback((finding: AttributionFinding) => {
    const locate = finding.locate;
    if (locate.kind !== "segment" || !locate.segment_hint) return;
    
    let targetIdx = -1;
    if (locate.segment_hint === "opening") {
      targetIdx = 0;
    } else if (locate.segment_hint === "middle") {
      targetIdx = Math.floor(scriptSegments.length / 2);
    } else if (locate.segment_hint === "ending") {
      targetIdx = scriptSegments.length - 1;
    }
    
    if (targetIdx !== -1 && targetIdx < scriptSegments.length) {
      setHighlightedSegmentIndex(targetIdx);
      setTimeout(() => {
        const el = document.getElementById(`script-segment-${targetIdx}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);
    }
  }, [scriptSegments]);

  const showOverlay = previewIndex !== null && screenshotItems[previewIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col h-full bg-stone-50/70 rounded-2xl border border-stone-200 overflow-hidden"
    >
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="group active:scale-[0.96] rounded-xl hover:bg-stone-100 gap-1.5 transition-transform text-[12px] text-stone-500"
          >
            <ChevronLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
            返回列表
          </Button>
          <div className="h-4 w-px bg-stone-200" />
          <div className="min-w-0">
            <h1 className="max-w-md truncate text-[16px] font-semibold text-stone-900 leading-tight">
              {video?.video_title || "视频复盘归因舱"}
            </h1>
            <p className="mt-1 text-[11px] text-stone-500 leading-none">
              成员：{video?.profiles?.name || "未知"} · 账号：{video?.accounts?.name || "未知"}
            </p>
          </div>
        </div>

        {video && (
          <Badge variant="outline" className={`h-6 text-[12px] ${statusBadgeClass[video.anomaly_status]}`}>
            {video.anomaly_status}
          </Badge>
        )}
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden min-h-0">
        
        <div className="flex flex-col border-r border-stone-200 bg-white overflow-y-auto p-6 space-y-6">

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.08em] text-stone-500">
                <span className="size-1.5 rounded-full bg-[#D97757]" />
                一、归因结论诊断
              </h2>
              <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                {(["self", "team", "top", "user"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setSelectedRef(r);
                      if (r !== "user") setSelectedRefUserId(null);
                    }}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-all ${
                      selectedRef === r
                        ? "border border-stone-200/50 bg-white text-stone-950 shadow-sm"
                        : "text-stone-500 hover:text-stone-700"
                    }`}
                  >
                    {r === "self" ? "比自己" : r === "team" ? "比团队" : r === "top" ? "比高手" : "比某人"}
                  </button>
                ))}
              </div>
            </div>

            {selectedRef === "user" && profiles.length > 0 && (
              <div className="flex items-center gap-2 bg-stone-50 border border-stone-150 rounded-xl p-2.5 animate-fade-in">
                <span className="text-[11px] text-stone-500 font-medium">选择指定对比人:</span>
                <Select
                  value={selectedRefUserId || undefined}
                  onValueChange={(val) => setSelectedRefUserId(val)}
                >
                  <SelectTrigger className="h-7 min-w-32 text-[11px] bg-white border-stone-200 rounded-md">
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
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
              </div>
            ) : !attribution || !attribution.snapshot_ready ? (
              <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/50 p-6 text-center text-[12px] text-stone-400">
                {attribution ? "这条视频暂无 24h 快照数据，请人工核对下方曲线与素材" : "正在加载归因结论..."}
              </div>
            ) : (
              <div className="flex flex-col">
                {attribution.findings.map((f: AttributionFinding) => (
                  <AttributionFindingRow
                    key={f.metric}
                    finding={f}
                    onLocate={() => handleLocateFinding(f)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.08em] text-stone-500">
              <span className="size-1.5 rounded-full bg-[#D97757]" />
              二、多参照系指标对比 ({comparison.ref_label || "比自己近3条"})
            </h2>

            {comparison.loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : comparison.error ? (
              <div className="rounded-xl border border-dashed border-red-200 bg-red-50/20 p-4 text-center text-[12px] text-red-500">
                {comparison.error}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <CompareMetricCard
                  label="播放量"
                  current={comparison.current?.play_count}
                  reference={comparison.reference?.play_count}
                  formatter={formatNumber}
                />
                <CompareMetricCard
                  label="2s跳出率"
                  current={comparison.current?.bounce_rate_2s}
                  reference={comparison.reference?.bounce_rate_2s}
                  formatter={formatRate}
                  lowerIsBetter
                />
                <CompareMetricCard
                  label="5s完播率"
                  current={comparison.current?.completion_rate_5s}
                  reference={comparison.reference?.completion_rate_5s}
                  formatter={formatRate}
                />
                <CompareMetricCard
                  label="完播率"
                  current={comparison.current?.completion_rate}
                  reference={comparison.reference?.completion_rate}
                  formatter={formatRate}
                />
                <CompareMetricCard
                  label="均播时长"
                  current={comparison.current?.avg_play_duration}
                  reference={comparison.reference?.avg_play_duration}
                  formatter={formatSeconds}
                />
                <CompareMetricCard
                  label="今日涨粉"
                  current={comparison.current?.follower_gain}
                  reference={comparison.reference?.follower_gain}
                  formatter={formatNumber}
                />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.08em] text-stone-500">
              <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
              三、流量留存曲线漏斗
            </h2>
            {snapshot ? (
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 h-[200px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={funnelChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#D97757" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#D97757" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E5E4" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#78716C", fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "#78716C", fontSize: 11 }} />
                    <ChartTooltip
                      contentStyle={{ borderRadius: "12px", border: "1px solid #E7E5E4", boxShadow: "0 4px 12px rgba(28,25,23,0.08)", fontSize: "11px" }}
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
              <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/50 p-6 text-center text-[12px] text-stone-400">
                暂无 24h 快照留存曲线数据
              </div>
            )}
          </div>

          {screenshotItems.length > 0 && (
            <div className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.08em] text-stone-500">
                <span className="size-1.5 rounded-full bg-stone-400" />
                四、曲线及留存截图
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {screenshotItems.slice(0, 2).map((item, index) => (
                  <button
                    key={`${item.label}-${item.url}`}
                    type="button"
                    onClick={() => setPreviewIndex(index)}
                    className="group border border-stone-200 rounded-xl overflow-hidden bg-stone-50 relative hover:border-stone-300 transition-colors text-left"
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
                    <div className="px-3 py-1.5 text-[11px] text-stone-500 bg-white border-t border-stone-100 flex items-center justify-between">
                      <span>{item.label}</span>
                      <span className="text-[#D97757] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">放大</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col bg-stone-50/50 overflow-y-auto p-6 space-y-8">
          
          {showPreviousFeedback && previousFeedback?.previous && (
            <div className="border-l-2 border-[#5F82A8]/30 pl-4 space-y-3.5 relative animate-fade-in">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-1.5 text-[#5F82A8]">
                  <History className="size-4" />
                  <span className="text-[11.5px] font-bold tracking-wider uppercase">上次复盘诊断对比</span>
                </div>
                <button
                  onClick={() => setShowPreviousFeedback(false)}
                  className="text-stone-400 hover:text-stone-600 text-[11px] font-medium transition-colors"
                >
                  收起
                </button>
              </div>
              <div className="space-y-2.5 text-[12px] text-stone-700">
                <div>
                  <span className="text-[11px] text-stone-450 block">上次核心问题：</span>
                  <p className="font-bold text-stone-850 text-[12.5px]">{previousFeedback.previous.one_line}</p>
                </div>
                {previousFeedback.previous.message_for_member && (
                  <div>
                    <span className="text-[11px] text-stone-450 block">上次改进建议：</span>
                    <p className="leading-relaxed text-stone-600 bg-white border border-stone-150 p-2.5 rounded-xl shadow-sm">{previousFeedback.previous.message_for_member}</p>
                  </div>
                )}
                {previousFeedback.previous.metrics && (
                  <div>
                    <span className="text-[11px] text-stone-450 block mb-1.5">上次核心指标快照：</span>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(previousFeedback.previous.metrics).map(([key, val]) => {
                        const entry = METRIC_MAP_INDEX.get(key as MetricKey);
                        if (!entry) return null;
                        const formatted = val != null ? (RATE_METRICS.has(key as MetricKey) ? `${val.toFixed(1)}%` : key === "avg_play_duration" ? `${val.toFixed(1)}s` : val.toLocaleString()) : "—";
                        return (
                          <div key={key} className="flex justify-between border-b border-stone-200/50 py-1 text-[11px] leading-none">
                            <span className="text-stone-400">{entry.label}</span>
                            <span className="font-semibold text-stone-700 tabular-nums">{formatted}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {showPreviousFeedback && <div className="h-px bg-gradient-to-r from-stone-200/50 via-stone-200/10 to-transparent pt-0.5" />}

          {scriptSegments.length > 0 && (
            <div className="space-y-3">
              <h3 className="flex items-center justify-between text-[11.5px] font-bold tracking-wider text-stone-400">
                <span>分段台词脚本 (点击句子引用)</span>
                {video?.video_url && (
                  <a
                    href={video.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] text-[#D97757] font-medium hover:underline normal-case"
                  >
                    查看抖音原片
                  </a>
                )}
              </h3>
              <div className="max-h-[260px] overflow-y-auto divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
                {scriptSegments.map((seg, idx) => {
                  const isHighlighted = highlightedSegmentIndex === idx;
                  const isQuoted = quotedIndices.has(idx);
                  return (
                    <button
                      type="button"
                      key={idx}
                      id={`script-segment-${idx}`}
                      onClick={() => handleQuoteSegment(seg, idx)}
                      aria-pressed={isQuoted}
                      className={`group/seg flex w-full items-start gap-3 px-4 py-3.5 cursor-pointer transition-all text-left border-l-2 ${
                        isQuoted 
                          ? "bg-gradient-to-r from-[#6FAA7D]/8 to-transparent border-[#6FAA7D]" 
                          : isHighlighted 
                            ? "bg-gradient-to-r from-[#D97757]/8 to-transparent border-[#D97757]" 
                            : "hover:bg-stone-50/70 border-transparent"
                      }`}
                    >
                      <span className={`mt-0.5 w-4 shrink-0 text-[11px] tabular-nums ${isQuoted ? "text-[#6FAA7D] font-medium" : "text-stone-400"}`}>
                        {idx + 1}
                      </span>
                      <span className={`text-[12px] leading-relaxed flex-1 ${
                        isQuoted 
                          ? "text-stone-400 line-through decoration-stone-300/60" 
                          : isHighlighted 
                            ? "text-amber-900 font-semibold animate-pulse" 
                            : "text-stone-700 font-normal"
                      }`}>
                        {seg}
                      </span>
                      <span className="opacity-100 sm:opacity-0 sm:group-hover/seg:opacity-100 sm:group-focus-visible/seg:opacity-100 transition-opacity shrink-0 flex items-center gap-1.5">
                        <span
                          title={isQuoted ? "取消引用" : "引用此句"}
                          className={`rounded-md p-1 ${isQuoted ? "text-[#6FAA7D]" : "text-stone-400 hover:text-[#D97757]"}`}
                        >
                          {isQuoted ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div> /* activeTab === "analysis" */
          )}

          {scriptSegments.length > 0 && <div className="h-px bg-gradient-to-r from-stone-200/50 via-stone-200/10 to-transparent pt-0.5" />}

          {analysisResult && (
            <div className="border-l-2 border-[#D97757]/30 pl-4 space-y-3.5 relative animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[#D97757]">
                  <Sparkles className="size-4 animate-pulse" />
                  <span className="text-[11.5px] font-bold tracking-wider">AI 辅助诊断思路</span>
                </div>
                <button
                  onClick={() => setAnalysisResult(null)}
                  className="text-stone-400 hover:text-stone-600 text-[11px] font-medium transition-colors"
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
                className="space-y-3 text-[12px] text-stone-700 leading-relaxed"
              >
                <motion.div variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
                  <span className="font-semibold text-stone-900 block">数据特征总结：</span>
                  <p className="mt-0.5">{analysisResult.data_summary}</p>
                </motion.div>
                <motion.div variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
                  <span className="font-semibold text-stone-900 block">改进方向与思路：</span>
                  <p className="mt-0.5">{analysisResult.copywriting_reason}</p>
                </motion.div>
                {analysisResult.abnormal_points && analysisResult.abnormal_points.length > 0 && (
                  <motion.div variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
                    <span className="font-semibold text-stone-900 block">异常提示点：</span>
                    <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                      {analysisResult.abnormal_points.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </motion.div>
              <div className="flex justify-end gap-2 pt-2.5 border-t border-stone-200/50">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleMarkExperience("analysis", "hot_case")}
                  disabled={isMarkingExperience}
                  className="h-7 rounded-lg border-stone-200 bg-white text-[11px] font-medium text-stone-600 hover:bg-stone-50 gap-1"
                >
                  {isMarkingExperience && <Loader2 className="size-3 animate-spin text-stone-400" />}
                  {isMarkingExperience ? "正在保存..." : "沉淀优秀经验"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleQuoteAnalysisToFeedback}
                  className="h-7 rounded-lg bg-[#D97757] text-white text-[11px] font-medium hover:bg-[#C96442]"
                >
                  一键引用至反馈框
                </Button>
              </div>
            </div>
          )}

          {analysisResult && <div className="h-px bg-gradient-to-r from-stone-200/50 via-stone-200/10 to-transparent pt-0.5" />}

          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <h3 className="text-[11.5px] font-bold tracking-wider text-stone-400">
                四、诊断反馈下发
              </h3>
              <div className="text-[11px] text-stone-400 min-h-5 flex items-center gap-1">
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

            <div className="space-y-1.5 bg-stone-50 border border-stone-200 rounded-xl p-3">
              <span className="text-[11px] font-semibold text-stone-500 block">诊断证据 (自动汇总偏离/异常指标)：</span>
              {feedbackEvidence.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {feedbackEvidence.map((ev, index) => (
                    <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-[#C9604D] border border-red-100 text-[11px] font-medium">
                      {ev}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-stone-400 italic">暂无指标偏离证据，该视频表现良好。</span>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1 text-left">
                <label className="text-[11.5px] font-medium text-stone-700">主要问题一句话总结 (员工在消息或仪表盘中第一眼看到)：</label>
                <input
                  type="text"
                  value={mainIssues}
                  onChange={(e) => setMainIssues(e.target.value)}
                  disabled={!isEditable}
                  placeholder="例如：开头前5s钩子不够吸引人，完播偏低..."
                  className="w-full h-9 rounded-lg border border-stone-200 px-3 text-[12px] text-stone-700 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500/10 transition-all"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[11.5px] font-medium text-stone-700">改进具体建议 (关于台词改写、情绪、节奏的具体方向)：</label>
                <textarea
                  rows={4}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={!isEditable}
                  placeholder="输入具体优化台词的话术改写方向或操作建议..."
                  className="w-full rounded-lg border border-stone-200 p-3 text-[12px] leading-relaxed text-stone-700 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500/10 transition-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-stone-150 pt-3.5">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateAnalysis}
                  disabled={isGeneratingAnalysis || !isEditable}
                  className="h-8 rounded-lg border-stone-200 hover:bg-stone-50 font-medium text-[12px] gap-1.5 text-stone-600"
                >
                  <Sparkles className="size-3.5 text-[#D97757]" />
                  {isGeneratingAnalysis ? "分析中..." : "获取 AI 诊断思路"}
                </Button>
                
                {previousFeedbackLoading ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="h-8 rounded-lg border-stone-200 text-[12px] font-medium text-stone-400 gap-1.5"
                  >
                    <Loader2 className="size-3.5 animate-spin" />
                    正在获取上次反馈...
                  </Button>
                ) : previousFeedback?.has_previous ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreviousFeedback((prev) => !prev)}
                    className="h-8 rounded-lg border-stone-200 hover:bg-stone-50 text-[12px] font-medium text-stone-600 gap-1.5"
                  >
                    <History className="size-3.5 text-[#5F82A8]" />
                    {showPreviousFeedback ? "关闭上次反馈对比" : "对比上次反馈意见"}
                  </Button>
                ) : null}
              </div>

              {isEditable ? (
                showSendConfirm ? (
                  <div className="flex items-center gap-1.5 animate-fade-in">
                    <Button
                      size="sm"
                      onClick={() => {
                        setShowSendConfirm(false);
                        handleConfirmAndSend().then(() => {
                          if (onGoToNextVideo && video) {
                            onGoToNextVideo(video.id);
                          }
                        });
                      }}
                      disabled={isConfirming}
                      className="h-8 rounded-lg bg-[#C9604D] hover:bg-[#B54D3C] text-white font-medium text-[12px] px-4"
                    >
                      {isConfirming ? "下发中..." : "确认"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowSendConfirm(false)}
                      className="h-8 rounded-lg border-stone-200 text-stone-600 font-medium text-[12px] px-2.5"
                    >
                      取消
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setShowSendConfirm(true)}
                    disabled={isConfirming || isSavingDraft}
                    className="h-8 rounded-lg bg-[#D97757] hover:bg-[#C96442] text-white font-medium text-[12px] px-4"
                  >
                    确认并下发
                  </Button>
                )
              ) : (
                <span className="text-[12px] text-stone-400 font-medium bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-lg">
                  已下发锁定
                </span>
              )}
            </div>
            <p className="text-[11px] text-stone-400 text-left">
              * 提示：AI 辅助诊断思路仅供思路参考，复盘的最终判断与改进意见审定权 100% 在您手中。
            </p>
          </div>
        </div>
      </div>

      {showOverlay && (
        <ScreenshotPreview
          items={screenshotItems}
          index={previewIndex!}
          onClose={() => setPreviewIndex(null)}
          onPrev={() => setPreviewIndex((i) => (i !== null && i > 0 ? i - 1 : screenshotItems.length - 1))}
          onNext={() => setPreviewIndex((i) => (i !== null && i < screenshotItems.length - 1 ? i + 1 : 0))}
        />
      )}

      {/* 悬浮胶囊诊断舱控制器 */}
      {anomalyVideos && anomalyVideos.length > 1 && onVideoSelect && currentIndex !== -1 && (
        <TooltipProvider delay={150}>
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.15 }}
            className="fixed bottom-8 right-8 z-50 flex items-center bg-stone-50/85 backdrop-blur-xl border border-white/60 ring-1 ring-stone-250/45 px-5 py-2.5 rounded-full shadow-[0_12px_36px_rgba(28,25,23,0.06),0_2px_8px_rgba(28,25,23,0.04)] hover:shadow-[0_16px_48px_rgba(28,25,23,0.12)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 select-none gap-4"
          >
            {/* 唯一选择入口：状态圆点队列 */}
            <div className="flex gap-2.5 items-center">
              {anomalyVideos.map((item, idx) => {
                const isActive = idx === currentIndex;
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger>
                      <button
                        type="button"
                        onClick={() => onVideoSelect(item.id)}
                        className={`size-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                          isActive
                            ? "bg-gradient-to-tr from-[#D97757] to-[#F19373] scale-110 shadow-[0_0_8px_rgba(217,119,87,0.4)] outline outline-offset-[3px] outline-1 outline-[#D97757]/45"
                            : "bg-stone-300 hover:bg-stone-400 hover:scale-115"
                        }`}
                      />
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      align="center"
                      sideOffset={10}
                      className="z-[60] bg-stone-950/85 text-white backdrop-blur-md border border-stone-850 px-3 py-1.5 rounded-xl shadow-lg text-[11px] max-w-[190px] leading-snug animate-fade-in"
                    >
                      <p className="font-semibold truncate">
                        {(item.profiles?.name || "未知")} · {(item.accounts?.name || "未知")}
                      </p>
                      <p className="text-stone-300 truncate mt-0.5">
                        {item.video_title || item.content || "（无标题）"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            {/* 渐隐渐现分隔线 */}
            <div className="h-4.5 w-px bg-gradient-to-b from-transparent via-stone-250 to-transparent" />

            {/* 科技杂志级混排文本 - 像素级水平对齐版 */}
            <div className="flex items-center gap-1.5 select-none leading-none">
              <span className="text-[11px] font-bold tracking-wider text-stone-400">
                诊断
              </span>
              <span className="text-[13px] font-extrabold text-[#D97757] tabular-nums">
                {currentIndex + 1}
              </span>
              <span className="text-[13px] text-stone-300 font-light">/</span>
              <span className="text-[13px] font-semibold text-stone-500 tabular-nums">
                {anomalyVideos.length}
              </span>
            </div>
          </motion.div>
        </TooltipProvider>
      )}
    </motion.div>
  );
}

function CompareMetricCard({
  label,
  current,
  reference,
  formatter,
  lowerIsBetter = false,
}: {
  label: string;
  current: number | null | undefined;
  reference: number | null | undefined;
  formatter: (v: number | null | undefined) => string;
  lowerIsBetter?: boolean;
}) {
  const currentVal = current ?? 0;
  const refVal = reference ?? 0;
  const delta = current != null && reference != null ? current - reference : null;
  
  let isGood = false;
  let isBad = false;
  if (delta != null) {
    const isBetter = lowerIsBetter ? delta < 0 : delta > 0;
    const absDelta = Math.abs(delta);
    const rateThresh = label.includes("率") ? 8 : 15;
    if (absDelta >= rateThresh) {
      if (isBetter) isGood = true;
      else isBad = true;
    }
  }
  
  const toneColor = isGood ? "text-[#6FAA7D]" : isBad ? "text-[#C9604D]" : "text-stone-600";
  const barColor = isGood ? "bg-[#6FAA7D]" : isBad ? "bg-[#C9604D]" : "bg-[#D97757]";
  
  const maxVal = Math.max(currentVal, refVal, 1) * 1.1;
  const currentPct = (currentVal / maxVal) * 100;
  const refPct = (refVal / maxVal) * 100;

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-sm space-y-1.5 text-left">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-stone-500">{label}</span>
        {delta != null && delta !== 0 && (
          <span className={`text-[11px] font-semibold ${toneColor}`}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[18px] font-bold tabular-nums text-stone-900 leading-tight">
          {current != null ? formatter(current) : "缺数据"}
        </span>
        <span className="text-[11px] text-stone-400 tabular-nums">
          参照 {reference != null ? formatter(reference) : "—"}
        </span>
      </div>
      
      {current != null && reference != null && (
        <div className="space-y-1 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] leading-none text-stone-500">
            <span className="w-5 shrink-0">本条</span>
            <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden relative">
              <div
                className={`h-full rounded-full ${barColor} transition-[width] duration-300`}
                style={{ width: `${currentPct}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] leading-none text-stone-500">
            <span className="w-5 shrink-0 text-stone-400">参照</span>
            <div className="flex-1 h-1 bg-stone-100 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-stone-300 rounded-full transition-[width] duration-300"
                style={{ width: `${refPct}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TONE_LABEL: Record<string, string> = {
  bad: "异常",
  warn: "偏低",
  good: "良好",
  missing: "缺数据",
};

const TONE_BG_COLOR: Record<string, string> = {
  bad: "bg-[#C9604D]/6 border-[#C9604D]/20 text-[#C9604D]",
  warn: "bg-[#D99E55]/6 border-[#D99E55]/20 text-[#D99E55]",
  good: "bg-[#6FAA7D]/6 border-[#6FAA7D]/20 text-[#6FAA7D]",
  missing: "bg-stone-50 border-stone-250 text-stone-450",
};

function AttributionFindingRow({
  finding,
  onLocate,
}: {
  finding: AttributionFinding;
  onLocate: () => void;
}) {
  const badgeColorClass = TONE_BG_COLOR[finding.tone] ?? TONE_BG_COLOR.missing;
  const locate = finding.locate;
  const hintLabel =
    locate.kind === "attribute"
      ? "属性层"
      : locate.segment_hint === "opening"
        ? "开头"
        : locate.segment_hint === "middle"
          ? "中段"
          : locate.segment_hint === "ending"
            ? "结尾"
            : null;

  return (
    <div className="flex items-start gap-4 border-b border-stone-200/50 last:border-b-0 py-4 px-1 text-left bg-transparent transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap leading-none">
          <span className="text-[12.5px] font-bold text-stone-850">{finding.metric_label}</span>
          <div className="flex items-center leading-none">
            <span className="text-[13.5px] font-extrabold text-stone-800 tabular-nums">
              {finding.value != null ? finding.value.toFixed(1) : "-"}
              {RATE_METRICS.has(finding.metric) && finding.value != null ? "%" : ""}
            </span>
            <span className="text-[11.5px] text-stone-400 font-normal tabular-nums">
              {finding.ref_value != null ? ` / 参照 ${finding.ref_value.toFixed(1)}` : ""}
              {RATE_METRICS.has(finding.metric) && finding.ref_value != null ? "%" : ""}
            </span>
            {finding.delta != null && finding.delta !== 0 && (
              <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md ml-2 tabular-nums border ${
                finding.delta > 0
                  ? "bg-[#6FAA7D]/6 border-[#6FAA7D]/20 text-[#6FAA7D]"
                  : "bg-[#C9604D]/6 border-[#C9604D]/20 text-[#C9604D]"
              }`}>
                {finding.delta > 0 ? "+" : ""}{finding.delta.toFixed(1)}
              </span>
            )}
          </div>
          {hintLabel && (
            <span className="text-[10px] border rounded-full px-1.5 py-0.5 font-medium border-stone-200 text-stone-450">
              {hintLabel}{locate.seconds != null ? ` · ${locate.seconds.toFixed(0)}s` : ""}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[11.5px] text-stone-500 leading-relaxed">{finding.points_to}</p>
      </div>

      <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeColorClass}`}>
          {TONE_LABEL[finding.tone] ?? finding.tone}
        </span>
        {locate.kind === "segment" && finding.tone !== "good" && finding.tone !== "missing" && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); onLocate(); }}
            className="h-6 rounded-lg border-stone-200 bg-white text-stone-600 hover:text-stone-900 hover:bg-stone-50 px-2 text-[10px] font-semibold shadow-sm transition-all"
          >
            看台词
          </Button>
        )}
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

