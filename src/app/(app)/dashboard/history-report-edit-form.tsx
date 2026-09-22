"use client";

import { useCallback, useState, useEffect, useTransition, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Users, CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { submitReport } from "./actions";
import { cn } from "@/lib/utils";
import { useFormDraft } from "@/hooks/use-form-draft";
import { getDefaultPublishedAtForBizDate, normalizePublishedAtInputValue } from "@/lib/日报";
import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import { fetchHistoryReportEditDetail, type HistoryReportEditDetailOutcome } from "./history-report-edit-detail";
import type { UnboundDailyReportDetail, VideoSubmissionEditDetail } from "./video-submit-form-state";

export interface HistoryReportEditData {
  id: string;
  account_id: string;
  title: string | null;
  report_date: string;
  play_count: number | null;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  content: string | null;
  published_at: string | null;
  uploaded_at: string | null;
}

export type MetricKey =
  | "play_count"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "follower_gain"
  | "follower_convert"
  | "avg_play_duration"
  | "bounce_rate_2s"
  | "completion_rate_5s"
  | "completion_rate";

export type MetricValues = Record<MetricKey, string>;

export type HistoryReportEditDraftData = {
  title: string;
  content: string;
  publishedAt: string;
  metrics: MetricValues;
  scriptAuthorId: string;
  videoEditorId: string;
  operatorId: string;
};

type HistoryReportEditAssigneeIds = Pick<
  HistoryReportEditDraftData,
  "scriptAuthorId" | "videoEditorId" | "operatorId"
>;

const UNASSIGNED_HISTORY_REPORT_EDIT_ASSIGNEES: HistoryReportEditAssigneeIds = {
  scriptAuthorId: "unassigned",
  videoEditorId: "unassigned",
  operatorId: "unassigned",
};

function stripSuffix(value: string | null | undefined, suffix: string) {
  return value?.replace(suffix, "").trim() ?? "";
}

function toInputValue(value: number | null | undefined, fallback = "") {
  return value == null ? fallback : String(value);
}

export function getInitialHistoryReportMetricValues(report: HistoryReportEditData): MetricValues {
  return {
    play_count: toInputValue(report.play_count),
    likes: toInputValue(report.likes, "0"),
    comments: toInputValue(report.comments, "0"),
    shares: toInputValue(report.shares, "0"),
    favorites: toInputValue(report.favorites, "0"),
    follower_gain: toInputValue(report.follower_gain, "0"),
    follower_convert: report.follower_convert && report.follower_convert > 0 ? String(report.follower_convert) : "",
    avg_play_duration: stripSuffix(report.avg_play_duration, "秒"),
    bounce_rate_2s: stripSuffix(report.bounce_rate_2s, "%"),
    completion_rate_5s: stripSuffix(report.completion_rate_5s, "%"),
    completion_rate: stripSuffix(report.completion_rate, "%"),
  };
}

export function buildHistoryReportEditDraftBaseline(
  report: HistoryReportEditData,
  assignees: HistoryReportEditAssigneeIds = UNASSIGNED_HISTORY_REPORT_EDIT_ASSIGNEES,
): HistoryReportEditDraftData {
  return {
    title: report.title ?? "",
    content: report.content ?? "",
    publishedAt:
      normalizePublishedAtInputValue(report.published_at) ||
      getDefaultPublishedAtForBizDate(report.report_date, formatShanghaiDateOnly()),
    metrics: getInitialHistoryReportMetricValues(report),
    ...assignees,
  };
}

export function isHistoryReportEditDraftEmpty(
  data: HistoryReportEditDraftData,
  baseline: HistoryReportEditDraftData,
) {
  return JSON.stringify(data) === JSON.stringify(baseline);
}

function resolveHistoryReportEditAssignees(
  detail: VideoSubmissionEditDetail,
): HistoryReportEditAssigneeIds {
  return {
    scriptAuthorId: detail.meta?.scriptAuthorUserId || "unassigned",
    videoEditorId: detail.meta?.videoEditorUserId || "unassigned",
    operatorId: detail.meta?.operatorUserId || "unassigned",
  };
}

export interface MetricFieldConfig {
  key: MetricKey;
  label: string;
  required?: boolean;
  suffix?: string;
}

export const METRIC_ROWS: Array<MetricFieldConfig[]> = [
  [
    { key: "play_count", label: "播放量", required: true },
    { key: "follower_gain", label: "涨粉数", required: true },
    { key: "follower_convert", label: "导粉" },
  ],
  [
    { key: "likes", label: "点赞数", required: true },
    { key: "comments", label: "评论", required: true },
    { key: "shares", label: "分享", required: true },
    { key: "favorites", label: "收藏", required: true },
  ],
  [
    { key: "avg_play_duration", label: "均播时长", suffix: "秒" },
    { key: "bounce_rate_2s", label: "2秒跳出率", suffix: "%" },
    { key: "completion_rate_5s", label: "5秒完播率", suffix: "%" },
    { key: "completion_rate", label: "整体完播率", suffix: "%" },
  ],
];

type TeamMember = {
  id: string;
  name: string;
  display_name: string;
};

let cachedTeamMembers: TeamMember[] | null = null;
let teamMembersPromise: Promise<TeamMember[]> | null = null;

export async function fetchCachedOperatorMembers(): Promise<TeamMember[]> {
  if (cachedTeamMembers) return cachedTeamMembers;
  if (!teamMembersPromise) {
    teamMembersPromise = fetch("/api/dashboard/operator-members")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data?.members)) {
          cachedTeamMembers = data.members;
          return data.members;
        }
        return [];
      })
      .catch(() => [])
      .finally(() => {
        teamMembersPromise = null;
      });
  }
  return teamMembersPromise;
}

/**
 * 只缓存读取成功的详情。失败的详情不落缓存，「重新载入」才能真的重新请求；
 * 无绑定视频（dailyReportOnly）是合法状态，与视频详情同等待遇。
 */
const editDetailCache = new Map<string, HistoryReportEditDetailOutcome>();

export type HistoryEditDetailStatus = "loading" | "ready_with_video" | "ready_without_video" | "error";

export function isHistoryEditDetailReady(status: HistoryEditDetailStatus) {
  return status === "ready_with_video" || status === "ready_without_video";
}

/** 无绑定视频时，负责人只能来自日报自身；读不到原值就不允许保存（由状态门禁保证）。 */
export function resolveUnboundHistoryReportEditAssignees(
  report: UnboundDailyReportDetail,
): HistoryReportEditAssigneeIds {
  return {
    scriptAuthorId: report.scriptAuthorUserId || "unassigned",
    videoEditorId: report.videoEditorUserId || "unassigned",
    operatorId: report.operatorUserId || "unassigned",
  };
}

export function PublishedAtPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const closePicker = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const parsed = useMemo(() => {
    if (!value) return { date: formatShanghaiDateOnly(), hour: "11", minute: "00" };
    const normalized = normalizePublishedAtInputValue(value);
    const [d = formatShanghaiDateOnly(), t = "11:00"] = normalized.split("T");
    const [h = "11", m = "00"] = t.split(":");
    return {
      date: d,
      hour: h.padStart(2, "0"),
      minute: m.padStart(2, "0"),
    };
  }, [value]);

  const [viewYear, setViewYear] = useState(() => {
    const d = new Date(parsed.date);
    return isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(parsed.date);
    return isNaN(d.getTime()) ? new Date().getMonth() : d.getMonth();
  });

  const updateDropdownPosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const panelWidth = Math.min(260, window.innerWidth - 16);
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - panelWidth - 8),
    );
    setDropdownPos({
      top: rect.bottom + 6,
      left,
    });
  };

  useEffect(() => {
    if (isOpen && parsed.date) {
      const d = new Date(parsed.date);
      if (!isNaN(d.getTime())) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开选择器时同步日历视图到当前日期（受控弹窗重置惯例）
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [isOpen, parsed.date]);

  useEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!panelRef.current || !panelRef.current.contains(target))
      ) {
        closePicker();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker(true);
      }
    }
    function handleResizeOrScroll() {
      updateDropdownPosition();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResizeOrScroll);
    window.addEventListener("scroll", handleResizeOrScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll, true);
    };
  }, [closePicker, isOpen]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: Array<{ dayNumber: number; dateStr: string } | null> = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(viewMonth + 1).padStart(2, "0");
      const dayStr = String(d).padStart(2, "0");
      days.push({
        dayNumber: d,
        dateStr: `${viewYear}-${monthStr}-${dayStr}`,
      });
    }
    return days;
  }, [viewYear, viewMonth]);

  const handleDateClick = (dateStr: string) => {
    onChange(`${dateStr}T${parsed.hour}:${parsed.minute}`);
  };

  const stepHour = (delta: number) => {
    const current = parseInt(parsed.hour, 10) || 0;
    const next = (current + delta + 24) % 24;
    onChange(`${parsed.date}T${String(next).padStart(2, "0")}:${parsed.minute}`);
  };

  const stepMinute = (delta: number) => {
    const current = parseInt(parsed.minute, 10) || 0;
    const next = (current + delta + 60) % 60;
    onChange(`${parsed.date}T${parsed.hour}:${String(next).padStart(2, "0")}`);
  };

  const displayTime = `${parsed.hour}:${parsed.minute}`;
  const displayDate = parsed.date;

  return (
    <div className="relative" ref={containerRef}>
      <input type="hidden" name="published_at" value={`${parsed.date}T${displayTime}`} />
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={isOpen}
        aria-controls="history-published-at-picker"
        aria-haspopup="dialog"
        onClick={() => {
            if (!isOpen) updateDropdownPosition();
            setIsOpen((prev) => !prev);
          }}
        className={cn(
          "h-7 w-full flex items-center justify-between rounded-md border border-[#E2E2DF] hover:bg-[#EBEBE9] focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 px-2.5 text-xs text-[#292524] transition-colors cursor-pointer active:scale-[0.99] active:duration-120",
          isOpen && "border-[#78716C] bg-white ring-1 ring-[#D97757]/25"
        )}
      >
        <span className="tabular-nums font-medium flex items-center gap-1.5 text-xs text-[#292524]">
          <CalendarDays className="size-3.5 text-[#78716C]" />
          {displayDate} {displayTime}
        </span>
        <ChevronDown className="size-3.5 text-[#78716C]" />
      </button>

      {isOpen && dropdownPos && typeof document !== "undefined" && createPortal(
        <div
          id="history-published-at-picker"
          role="dialog"
          aria-label="选择发布时间"
          ref={panelRef}
          style={{
            position: "fixed",
            top: dropdownPos.top,
            left: Math.max(8, dropdownPos.left),
            maxHeight: `calc(100dvh - ${dropdownPos.top}px - 16px)`,
            overflowY: "auto",
            zIndex: "var(--z-popover, 90)" as unknown as number,
          }}
          className="w-[260px] max-w-[calc(100vw-1rem)] rounded-xl border border-[#E2E2DF] bg-white p-3 shadow-claude-dialog animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-center gap-1.5 pb-2 mb-1.5 border-b border-[#E2E2DF]">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded hover:bg-[#EBEBE9] text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer active:scale-[0.99]"
              title="上个月"
              aria-label="上个月"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="text-xs font-semibold text-[#1C1917] tabular-nums px-1">
              {viewYear}年{viewMonth + 1}月
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded hover:bg-[#EBEBE9] text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer active:scale-[0.99]"
              title="下个月"
              aria-label="下个月"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[#78716C] mb-1">
            {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {calendarDays.map((item, idx) => {
              if (!item) {
                return <span key={`empty-${idx}`} className="size-7" />;
              }
              const isSelected = item.dateStr === parsed.date;
              return (
                <button
                  key={item.dateStr}
                  type="button"
                  onClick={() => handleDateClick(item.dateStr)}
                  className={cn(
                    "size-7 rounded-md text-xs tabular-nums flex items-center justify-center transition-colors cursor-pointer",
                    isSelected
                      ? "bg-[#D97757] text-white font-semibold shadow-2xs"
                      : "text-[#292524] hover:bg-[#EBEBE9]"
                  )}
                >
                  {item.dayNumber}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 pt-2 border-t border-[#E2E2DF] flex items-center justify-between">
            <span className="text-[12px] text-[#78716C] font-medium">发布时点</span>
            <div className="flex items-center gap-1 rounded-lg border border-[#E2E2DF]/60 bg-white px-2 py-0.5">
              <button
                type="button"
                onClick={() => stepHour(-1)}
                className="size-4 flex items-center justify-center text-[#78716C] hover:text-[#1C1917] font-semibold text-xs rounded hover:bg-[#EBEBE9] cursor-pointer"
                title="减1小时"
              >
                −
              </button>
              <span className="text-xs font-semibold tabular-nums text-[#1C1917] px-0.5">
                {parsed.hour}
              </span>
              <button
                type="button"
                onClick={() => stepHour(1)}
                className="size-4 flex items-center justify-center text-[#78716C] hover:text-[#1C1917] font-semibold text-xs rounded hover:bg-[#EBEBE9] cursor-pointer"
                title="加1小时"
              >
                +
              </button>
              <span className="text-xs text-[#78716C] font-medium">:</span>
              <button
                type="button"
                onClick={() => stepMinute(-5)}
                className="size-4 flex items-center justify-center text-[#78716C] hover:text-[#1C1917] font-semibold text-xs rounded hover:bg-[#EBEBE9] cursor-pointer"
                title="减5分钟"
              >
                −
              </button>
              <span className="text-xs font-semibold tabular-nums text-[#1C1917] px-0.5">
                {parsed.minute}
              </span>
              <button
                type="button"
                onClick={() => stepMinute(5)}
                className="size-4 flex items-center justify-center text-[#78716C] hover:text-[#1C1917] font-semibold text-xs rounded hover:bg-[#EBEBE9] cursor-pointer"
                title="加5分钟"
              >
                +
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function HistoryReportEditForm({
  report,
  accountDisplayName,
  onSaved,
}: {
  report: HistoryReportEditData;
  accountDisplayName?: string;
  onSaved?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [metrics, setMetrics] = useState<MetricValues>(() =>
    getInitialHistoryReportMetricValues(report),
  );
  const [title, setTitle] = useState(report.title ?? "");
  const [content, setContent] = useState(report.content ?? "");
  const [publishedAt, setPublishedAt] = useState(
    normalizePublishedAtInputValue(report.published_at) ||
      getDefaultPublishedAtForBizDate(report.report_date, formatShanghaiDateOnly()),
  );

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => cachedTeamMembers ?? []);
  const [scriptAuthorId, setScriptAuthorId] = useState<string>("unassigned");
  const [videoEditorId, setVideoEditorId] = useState<string>("unassigned");
  const [operatorId, setOperatorId] = useState<string>("unassigned");
  const [editDetailStatus, setEditDetailStatus] = useState<HistoryEditDetailStatus>("loading");
  const [editDetailRequestVersion, setEditDetailRequestVersion] = useState(0);
  const [boundVideoId, setBoundVideoId] = useState<string | null>(null);
  const [initialAssigneeIds, setInitialAssigneeIds] = useState<HistoryReportEditAssigneeIds>(
    () => ({ ...UNASSIGNED_HISTORY_REPORT_EDIT_ASSIGNEES }),
  );
  const [historicalAssignees, setHistoricalAssignees] = useState<
    Array<{ userId: string; displayName: string | null; name: string | null }>
  >([]);

  const draftData = useMemo<HistoryReportEditDraftData>(() => ({
    title,
    content,
    publishedAt,
    metrics,
    scriptAuthorId,
    videoEditorId,
    operatorId,
  }), [content, metrics, operatorId, publishedAt, scriptAuthorId, title, videoEditorId]);

  const initialDraftData = useMemo(
    () => buildHistoryReportEditDraftBaseline(report, initialAssigneeIds),
    [initialAssigneeIds, report],
  );

  const isHistoryEditDraftEmpty = useCallback(
    (data: HistoryReportEditDraftData) => isHistoryReportEditDraftEmpty(data, initialDraftData),
    [initialDraftData],
  );

  const { hasDraft, restoreDraft, clearDraft } = useFormDraft<HistoryReportEditDraftData>(
    `dydata:draft:history-edit:${report.id}`,
    draftData,
    [draftData],
    { isEmpty: isHistoryEditDraftEmpty },
  );

  function handleRestoreDraft() {
    const draft = restoreDraft();
    if (!draft) return;
    setTitle(draft.title);
    setContent(draft.content);
    setPublishedAt(draft.publishedAt);
    setMetrics(draft.metrics);
    setScriptAuthorId(draft.scriptAuthorId || "unassigned");
    setVideoEditorId(draft.videoEditorId || "unassigned");
    setOperatorId(draft.operatorId || "unassigned");
  }

  function handleDiscardDraft() {
    clearDraft();
  }

  useEffect(() => {
    return () => clearDraft();
  }, [clearDraft]);

  /* eslint-disable react-hooks/set-state-in-effect -- 编辑详情是外部数据：加载中状态、缓存命中同步回填、请求返回后回填都只能在 effect 内改 state */
  useEffect(() => {
    let cancelled = false;
    setEditDetailStatus("loading");

    function applyDetail(outcome: HistoryReportEditDetailOutcome) {
      if (outcome.kind === "video") {
        const assignees = resolveHistoryReportEditAssignees(outcome.detail);
        setInitialAssigneeIds(assignees);
        setScriptAuthorId(assignees.scriptAuthorId);
        setVideoEditorId(assignees.videoEditorId);
        setOperatorId(assignees.operatorId);
        setBoundVideoId(outcome.detail.videoId);
        if (outcome.detail.assigneeProfiles) setHistoricalAssignees(outcome.detail.assigneeProfiles);
        setEditDetailStatus("ready_with_video");
        return;
      }
      const assignees = resolveUnboundHistoryReportEditAssignees(outcome.report);
      setInitialAssigneeIds(assignees);
      setScriptAuthorId(assignees.scriptAuthorId);
      setVideoEditorId(assignees.videoEditorId);
      setOperatorId(assignees.operatorId);
      setBoundVideoId(null);
      setHistoricalAssignees(outcome.report.assigneeProfiles ?? []);
      setEditDetailStatus("ready_without_video");
    }

    if (!cachedTeamMembers) {
      void fetchCachedOperatorMembers().then((members) => {
        if (!cancelled && members.length > 0) {
          setTeamMembers(members);
        }
      });
    }

    if (report.account_id && report.report_date) {
      const cacheKey = `${report.account_id}:${report.report_date}`;
      const cached = editDetailCache.get(cacheKey);
      if (cached) {
        applyDetail(cached);
      } else {
        void fetchHistoryReportEditDetail({
          accountId: report.account_id,
          bizDate: report.report_date,
        })
          .then((outcome) => {
            if (cancelled) return;
            editDetailCache.set(cacheKey, outcome);
            applyDetail(outcome);
          })
          .catch((err) => {
            // H2 中危修复：详情加载失败不能静默吞掉，否则 video_id 变空喂给 submitReport
            // H2 中危修复（续）：失败也不落缓存，否则「重新载入」会读到同一个失败标记
            if (!cancelled) {
              console.error("[history-report-edit] failed to load edit detail", {
                accountId: report.account_id,
                bizDate: report.report_date,
                error: err,
              });
              setEditDetailStatus("error");
            }
          });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [editDetailRequestVersion, report.account_id, report.report_date]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleRetryEditDetail() {
    editDetailCache.delete(`${report.account_id}:${report.report_date}`);
    setEditDetailRequestVersion((version) => version + 1);
  }

  function updateMetric(key: MetricKey, value: string) {
    setMetrics((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isHistoryEditDetailReady(editDetailStatus)) {
      feedbackToast.error(
        editDetailStatus === "loading"
          ? "原记录仍在加载，请稍候"
          : "原记录加载失败，请点「重新载入」后再保存",
      );
      return;
    }
    const formData = new FormData(event.currentTarget);
    // 只有确实绑定了视频才带 video_id；无绑定视频的日报只写日报侧，不猜、不新建绑定
    if (boundVideoId) {
      formData.set("video_id", boundVideoId);
    } else {
      formData.delete("video_id");
    }
    formData.set("report_id", report.id);

    if (scriptAuthorId && scriptAuthorId !== "unassigned") {
      formData.set("script_author_user_id", scriptAuthorId);
    } else {
      formData.set("script_author_user_id", "");
    }
    if (videoEditorId && videoEditorId !== "unassigned") {
      formData.set("video_editor_user_id", videoEditorId);
    } else {
      formData.set("video_editor_user_id", "");
    }
    if (operatorId && operatorId !== "unassigned") {
      formData.set("operator_user_id", operatorId);
    } else {
      formData.set("operator_user_id", "");
    }

    startTransition(async () => {
      const result = await submitReport(formData);
      if (result?.error) {
        feedbackToast.error(result.error);
        return;
      }

      feedbackToast.success("历史手稿修改已保存");
      clearDraft();
      onSaved?.();
    });
  }

  const getAssigneeLabel = (id: string, fallback = "未指定") => {
    if (!id || id === "unassigned") return "未指定";
    const member = teamMembers.find((m) => m.id === id);
    if (member) return member.display_name || member.name;
    const historical = historicalAssignees.find((h) => h.userId === id);
    if (historical) return `${historical.displayName || historical.name || "历史成员"}（历史）`;
    return fallback;
  };

  const renderMemberOptions = (currentSelectedId: string) => {
    const isHistorical =
      currentSelectedId !== "unassigned" &&
      !teamMembers.some((m) => m.id === currentSelectedId);
    const historicalProfile = isHistorical
      ? historicalAssignees.find((h) => h.userId === currentSelectedId)
      : null;

    return (
      <>
        <SelectItem value="unassigned">未指定</SelectItem>
        {isHistorical && historicalProfile && (
          <SelectItem value={currentSelectedId}>
            {historicalProfile.displayName || historicalProfile.name || "历史成员"}（历史成员）
          </SelectItem>
        )}
        {teamMembers.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            {member.display_name || member.name}
          </SelectItem>
        ))}
      </>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col justify-between">
      <input type="hidden" name="account_id" value={report.account_id} />
      <input type="hidden" name="report_date" value={report.report_date} />
      <input type="hidden" name="report_id" value={report.id} />
      <input type="hidden" name="video_id" value={boundVideoId ?? ""} />

      <DialogBody className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
        {hasDraft ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#B98A54]/30 bg-[#B98A54]/[0.04] px-3 py-2 text-[12px] text-[#292524]">
            <span>检测到未保存的修改</span>
            <div className="inline-flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleRestoreDraft}
                className="font-medium text-[#292524] hover:text-[#D97757] transition-colors cursor-pointer"
              >
                恢复
              </button>
              <span className="text-[#D6D3D1]" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="text-[#78716C] hover:text-[#C0685C] transition-colors cursor-pointer"
              >
                丢弃
              </button>
            </div>
          </div>
        ) : null}

        {editDetailStatus === "error" ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#C0685C]/30 bg-[#C0685C]/[0.04] px-3 py-2 text-[12px] text-[#292524]">
            <span>原记录没加载出来，为避免覆盖原负责人，保存已停用。</span>
            <button
              type="button"
              onClick={handleRetryEditDetail}
              className="shrink-0 font-medium text-[#292524] hover:text-[#D97757] transition-colors cursor-pointer"
            >
              重新载入
            </button>
          </div>
        ) : null}

        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium text-[#1C1917]">
              基础信息
            </div>
            <span className="text-[12px] text-[#78716C] tabular-nums">
              {report.report_date} · {accountDisplayName || report.account_id}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="history-report-date" className="text-[12px] text-[#78716C]">归属日期</Label>
              <Input id="history-report-date" value={report.report_date} disabled className="h-7 bg-[#F1F1F0]/60 text-xs text-[#78716C] rounded-md border-[#E2E2DF]" />
            </div>
            <div className="space-y-1">
              <Label className="text-[12px] text-[#78716C]">发布时间</Label>
              <PublishedAtPicker
                value={publishedAt}
                onChange={setPublishedAt}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="history-title" className="text-[12px] text-[#78716C]">视频标题</Label>
              <Input
                id="history-title"
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-7 text-xs rounded-md border-[#E2E2DF] bg-white/50 focus:bg-white"
                placeholder="补充或修正视频标题"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="history-content" className="text-[12px] text-[#78716C]">视频文案</Label>
              <textarea
                id="history-content"
                name="content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={3}
                className="w-full resize-y rounded-xl border border-[#E2E2DF] bg-white/50 shadow-input px-3 py-2 text-xs leading-relaxed text-[#292524] outline-none transition hover:border-[#78716C]/40 placeholder:text-[#78716C]/60 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0 focus:bg-white"
                placeholder="补充或修正历史文案"
              />
            </div>
          </div>
        </section>

        <section className="space-y-2.5 pt-2 border-t border-[#E2E2DF]">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium text-[#1C1917]">历史指标</div>
            <span className="text-[11px] text-[#A8A29E]">24 小时沉淀数据</span>
          </div>
          <div className="space-y-2.5">
            {METRIC_ROWS.map((fields, rowIdx) => (
              <div
                key={`metric-row-${rowIdx}`}
                className="grid grid-cols-4 gap-2.5"
              >
                {fields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <Label
                      htmlFor={`history-${field.key}`}
                      className="text-[11px] font-normal text-[#78716C] block leading-tight truncate"
                      title={`${field.label}${field.suffix ? `（${field.suffix}）` : ""}`}
                    >
                      {field.label}
                      {field.suffix ? <span className="text-[10px] text-[#A8A29E] ml-0.5 font-normal">({field.suffix})</span> : null}
                    </Label>
                    <Input
                      id={`history-${field.key}`}
                      name={field.key}
                      type="number"
                      min={0}
                      step="any"
                      required={field.required}
                      value={metrics[field.key]}
                      onChange={(event) => updateMetric(field.key, event.target.value)}
                      className="h-8 rounded-lg border-[#E2E2DF] bg-white/50 focus:bg-white text-xs font-medium tabular-nums shadow-input transition-colors px-2"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2 pt-2 border-t border-[#E2E2DF]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#78716C]">
              <Users className="size-3.5 text-[#78716C]" />
              <span>共创伙伴（可选）</span>
            </div>
            <span className="text-[11px] text-[#A8A29E]">文案 · 剪辑 · 运营</span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-1.5 rounded-lg border border-[#E2E2DF] bg-white/50 px-2.5 py-1 transition-colors hover:border-[#78716C]/40">
              <span className="text-[12px] text-[#78716C] shrink-0 font-medium">文案</span>
              <Select value={scriptAuthorId} onValueChange={(val) => setScriptAuthorId(val || "unassigned")}>
                <SelectTrigger className="h-6 border-0 bg-transparent p-0 text-[12px] text-[#292524] shadow-none hover:bg-transparent focus:ring-0 focus:ring-offset-0 max-w-[100px] sm:max-w-[95px] justify-end gap-1">
                  <SelectValue>{getAssigneeLabel(scriptAuthorId, "未指定")}</SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-[#E2E2DF] shadow-claude-float min-w-36 max-h-56">
                  {renderMemberOptions(scriptAuthorId)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-1.5 rounded-lg border border-[#E2E2DF] bg-white/50 px-2.5 py-1 transition-colors hover:border-[#78716C]/40">
              <span className="text-[12px] text-[#78716C] shrink-0 font-medium">剪辑</span>
              <Select value={videoEditorId} onValueChange={(val) => setVideoEditorId(val || "unassigned")}>
                <SelectTrigger className="h-6 border-0 bg-transparent p-0 text-[12px] text-[#292524] shadow-none hover:bg-transparent focus:ring-0 focus:ring-offset-0 max-w-[100px] sm:max-w-[95px] justify-end gap-1">
                  <SelectValue>{getAssigneeLabel(videoEditorId, "未指定")}</SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-[#E2E2DF] shadow-claude-float min-w-36 max-h-56">
                  {renderMemberOptions(videoEditorId)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-1.5 rounded-lg border border-[#E2E2DF] bg-white/50 px-2.5 py-1 transition-colors hover:border-[#78716C]/40">
              <span className="text-[12px] text-[#78716C] shrink-0 font-medium">运营</span>
              <Select value={operatorId} onValueChange={(val) => setOperatorId(val || "unassigned")}>
                <SelectTrigger className="h-6 border-0 bg-transparent p-0 text-[12px] text-[#292524] shadow-none hover:bg-transparent focus:ring-0 focus:ring-offset-0 max-w-[100px] sm:max-w-[95px] justify-end gap-1">
                  <SelectValue>{getAssigneeLabel(operatorId, "未指定")}</SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-[#E2E2DF] shadow-claude-float min-w-36 max-h-56">
                  {renderMemberOptions(operatorId)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      </DialogBody>

      <DialogFooter className="shrink-0 border-t border-[#E2E2DF] bg-white px-5 py-3">
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="text-[12px] text-[#78716C] truncate hidden xs:block sm:block">
            {editDetailStatus === "ready_without_video"
              ? "该日报没有关联视频，保存只更新日报数据"
              : "就地更新历史指标并同步共创责任人"}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="submit"
              size="m"
              disabled={isPending || !isHistoryEditDetailReady(editDetailStatus)}
              className="px-3.5 text-[13px] font-medium bg-[#D97757] hover:bg-[#C46A4D] text-white cursor-pointer shadow-sm"
            >
              {isPending
                ? "保存中..."
                : editDetailStatus === "loading"
                  ? "加载原记录..."
                  : editDetailStatus === "error"
                    ? "原记录加载失败"
                    : "保存历史修改"}
            </Button>
          </div>
        </div>
      </DialogFooter>
    </form>
  );
}
