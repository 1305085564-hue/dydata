"use client";

import { useState, useEffect, useTransition, useRef, useMemo } from "react";
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
import { getDefaultPublishedAtForBizDate, normalizePublishedAtInputValue } from "@/lib/日报";
import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import { fetchVideoSubmissionEditDetail } from "./video-submit-panel-v2";
import type { VideoSubmissionEditDetail } from "./video-submit-form-state";

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

export interface MetricFieldConfig {
  key: MetricKey;
  label: string;
  required?: boolean;
  suffix?: string;
}

export const METRIC_ROWS: Array<MetricFieldConfig[]> = [
  [
    { key: "play_count", label: "播放量", required: true },
    { key: "follower_gain", label: "涨粉", required: true },
    { key: "follower_convert", label: "导粉" },
  ],
  [
    { key: "likes", label: "点赞", required: true },
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

const editDetailCache = new Map<string, VideoSubmissionEditDetail>();

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

  const parsed = useMemo(() => {
    if (!value) return { date: formatShanghaiDateOnly(), hour: "11", minute: "00" };
    const normalized = value.replace(" ", "T");
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
        setIsOpen(false);
      }
    }
    function handleResizeOrScroll() {
      updateDropdownPosition();
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleResizeOrScroll);
    window.addEventListener("scroll", handleResizeOrScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll, true);
    };
  }, [isOpen]);

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
        type="button"
        disabled={disabled}
        onClick={() => {
            if (!isOpen) updateDropdownPosition();
            setIsOpen((prev) => !prev);
          }}
        className={cn(
          "h-7 w-full flex items-center justify-between rounded-md border border-[#ECE7DE] bg-[#FAF8F4]/50 hover:bg-[#F5F3EE] focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 px-2.5 text-xs text-[#292524] transition-colors cursor-pointer active:scale-[0.99] active:duration-120",
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
          ref={panelRef}
          style={{
            position: "fixed",
            top: dropdownPos.top,
            left: Math.max(8, dropdownPos.left),
            maxHeight: `calc(100dvh - ${dropdownPos.top}px - 16px)`,
            overflowY: "auto",
            zIndex: 9999,
          }}
          className="w-[260px] max-w-[calc(100vw-1rem)] rounded-xl border border-[#E5E0D6] bg-white p-3 shadow-claude-dialog animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-[#ECE7DE]">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded hover:bg-[#F5F3EE] text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="text-xs font-semibold text-[#1C1917] tabular-nums">
              {viewYear}年{viewMonth + 1}月
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded hover:bg-[#F5F3EE] text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10.5px] font-medium text-[#78716C] mb-1">
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
                      : "text-[#292524] hover:bg-[#F5F3EE]"
                  )}
                >
                  {item.dayNumber}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 pt-2 border-t border-[#ECE7DE] flex items-center justify-between">
            <span className="text-[11.5px] text-[#78716C] font-medium">发布时点</span>
            <div className="flex items-center gap-1 rounded-lg border border-[#E5E0D6] bg-[#FAF8F4] px-2 py-0.5">
              <button
                type="button"
                onClick={() => stepHour(-1)}
                className="size-4 flex items-center justify-center text-[#78716C] hover:text-[#1C1917] font-semibold text-xs rounded hover:bg-[#ECE7DE] cursor-pointer"
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
                className="size-4 flex items-center justify-center text-[#78716C] hover:text-[#1C1917] font-semibold text-xs rounded hover:bg-[#ECE7DE] cursor-pointer"
                title="加1小时"
              >
                +
              </button>
              <span className="text-xs text-[#78716C] font-medium">:</span>
              <button
                type="button"
                onClick={() => stepMinute(-5)}
                className="size-4 flex items-center justify-center text-[#78716C] hover:text-[#1C1917] font-semibold text-xs rounded hover:bg-[#ECE7DE] cursor-pointer"
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
                className="size-4 flex items-center justify-center text-[#78716C] hover:text-[#1C1917] font-semibold text-xs rounded hover:bg-[#ECE7DE] cursor-pointer"
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
  const [historicalAssignees, setHistoricalAssignees] = useState<
    Array<{ userId: string; displayName: string | null; name: string | null }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    if (!cachedTeamMembers) {
      void fetchCachedOperatorMembers().then((members) => {
        if (!cancelled && members.length > 0) {
          setTeamMembers(members);
        }
      });
    }

    if (report.account_id && report.report_date) {
      const cacheKey = `${report.account_id}:${report.report_date}`;
      if (editDetailCache.has(cacheKey)) {
        const detail = editDetailCache.get(cacheKey);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 编辑详情内存缓存命中时同步回填共创人（缓存回填惯例）
        if (detail?.meta?.scriptAuthorUserId) setScriptAuthorId(detail.meta.scriptAuthorUserId);
        if (detail?.meta?.videoEditorUserId) setVideoEditorId(detail.meta.videoEditorUserId);
        if (detail?.meta?.operatorUserId) setOperatorId(detail.meta.operatorUserId);
        if (detail?.assigneeProfiles) setHistoricalAssignees(detail.assigneeProfiles);
      } else {
        void fetchVideoSubmissionEditDetail({
          accountId: report.account_id,
          bizDate: report.report_date,
        })
          .then((detail) => {
            if (!cancelled && detail) {
              editDetailCache.set(cacheKey, detail);
              if (detail.meta?.scriptAuthorUserId) {
                setScriptAuthorId(detail.meta.scriptAuthorUserId);
              }
              if (detail.meta?.videoEditorUserId) {
                setVideoEditorId(detail.meta.videoEditorUserId);
              }
              if (detail.meta?.operatorUserId) {
                setOperatorId(detail.meta.operatorUserId);
              }
              if (detail.assigneeProfiles) {
                setHistoricalAssignees(detail.assigneeProfiles);
              }
            }
          })
          .catch(() => {});
      }
    }

    return () => {
      cancelled = true;
    };
  }, [report.account_id, report.report_date]);

  function updateMetric(key: MetricKey, value: string) {
    setMetrics((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

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

      <DialogBody className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium text-[#1C1917]">
              基础信息
            </div>
            <span className="text-[11.5px] text-[#78716C] tabular-nums">
              {report.report_date} · {accountDisplayName || report.account_id}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="history-report-date" className="text-[11.5px] text-[#78716C]">归属日期</Label>
              <Input id="history-report-date" value={report.report_date} disabled className="h-7 bg-[#F5F3EE]/60 text-xs text-[#78716C] rounded-md border-[#ECE7DE]" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11.5px] text-[#78716C]">发布时间</Label>
              <PublishedAtPicker
                value={publishedAt}
                onChange={setPublishedAt}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="history-title" className="text-[11.5px] text-[#78716C]">视频标题</Label>
              <Input
                id="history-title"
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-7 text-xs rounded-md border-[#ECE7DE] bg-[#FAF8F4]/50 focus:bg-white"
                placeholder="补充或修正视频标题"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="history-content" className="text-[11.5px] text-[#78716C]">视频文案</Label>
              <textarea
                id="history-content"
                name="content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={3}
                className="w-full resize-y rounded-xl border border-[#E5E0D6] bg-[#FAF8F4]/50 shadow-2xs px-3 py-2 text-xs leading-relaxed text-[#292524] outline-none transition hover:border-[#78716C]/40 placeholder:text-[#78716C]/60 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0 focus:bg-white"
                placeholder="补充或修正历史文案"
              />
            </div>
          </div>
        </section>

        <section className="space-y-2.5 pt-2 border-t border-[#ECE7DE]">
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
                      className="h-8 rounded-lg border-[#E5E0D6] bg-[#FAF8F4]/50 focus:bg-white text-xs font-medium tabular-nums shadow-2xs transition-colors px-2"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2 pt-2 border-t border-[#ECE7DE]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#78716C]">
              <Users className="size-3.5 text-[#78716C]" />
              <span>共创伙伴（可选）</span>
            </div>
            <span className="text-[11px] text-[#A8A29E]">文案 · 剪辑 · 运营</span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-1.5 rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-2.5 py-1 transition-colors hover:border-[#78716C]/40">
              <span className="text-[11.5px] text-[#78716C] shrink-0 font-medium">文案</span>
              <Select value={scriptAuthorId} onValueChange={(val) => setScriptAuthorId(val || "unassigned")}>
                <SelectTrigger className="h-6 border-0 bg-transparent p-0 text-[11.5px] text-[#292524] shadow-none hover:bg-transparent focus:ring-0 focus:ring-offset-0 max-w-[100px] sm:max-w-[95px] justify-end gap-1">
                  <SelectValue>{getAssigneeLabel(scriptAuthorId, "未指定")}</SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-[#E5E0D6] bg-[#FAF8F4] shadow-claude-float min-w-36 max-h-56">
                  {renderMemberOptions(scriptAuthorId)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-1.5 rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-2.5 py-1 transition-colors hover:border-[#78716C]/40">
              <span className="text-[11.5px] text-[#78716C] shrink-0 font-medium">剪辑</span>
              <Select value={videoEditorId} onValueChange={(val) => setVideoEditorId(val || "unassigned")}>
                <SelectTrigger className="h-6 border-0 bg-transparent p-0 text-[11.5px] text-[#292524] shadow-none hover:bg-transparent focus:ring-0 focus:ring-offset-0 max-w-[100px] sm:max-w-[95px] justify-end gap-1">
                  <SelectValue>{getAssigneeLabel(videoEditorId, "未指定")}</SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-[#E5E0D6] bg-[#FAF8F4] shadow-claude-float min-w-36 max-h-56">
                  {renderMemberOptions(videoEditorId)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-1.5 rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-2.5 py-1 transition-colors hover:border-[#78716C]/40">
              <span className="text-[11.5px] text-[#78716C] shrink-0 font-medium">运营</span>
              <Select value={operatorId} onValueChange={(val) => setOperatorId(val || "unassigned")}>
                <SelectTrigger className="h-6 border-0 bg-transparent p-0 text-[11.5px] text-[#292524] shadow-none hover:bg-transparent focus:ring-0 focus:ring-offset-0 max-w-[100px] sm:max-w-[95px] justify-end gap-1">
                  <SelectValue>{getAssigneeLabel(operatorId, "未指定")}</SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-[#E5E0D6] bg-[#FAF8F4] shadow-claude-float min-w-36 max-h-56">
                  {renderMemberOptions(operatorId)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      </DialogBody>

      <DialogFooter className="shrink-0 border-t border-[#ECE7DE] bg-white px-5 py-3">
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="text-[11.5px] text-[#78716C] truncate hidden xs:block sm:block">
            就地更新历史指标并同步共创责任人
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="submit"
              size="m"
              disabled={isPending}
              className="px-3.5 text-[13px] font-medium bg-[#D97757] hover:bg-[#C46A4D] text-white cursor-pointer shadow-sm"
            >
              {isPending ? "保存中..." : "保存历史修改"}
            </Button>
          </div>
        </div>
      </DialogFooter>
    </form>
  );
}
