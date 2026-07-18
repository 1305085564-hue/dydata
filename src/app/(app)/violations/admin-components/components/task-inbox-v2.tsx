"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardList,
  FileX2,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { CaseDetailDialog } from "@/components/case-detail-dialog";
import type { InboxBucketEntry, InboxCounts } from "../data";
import dynamic from "next/dynamic";

const CaseRejectDialog = dynamic(
  () => import("@/components/case-reject-dialog").then((m) => m.CaseRejectDialog),
  { ssr: false }
);

/** 后端 batch-review / [id]/review response 里的旧状态快照 */
type ReviewSnapshot = {
  id: string;
  status: string;
  usage_state: string | null;
  risk_level: string | null;
  admin_conclusion: string | null;
  suggested_action: string | null;
};

/** 撤销窗口 5s — 顶级 SaaS 操作反悔的标准时长 */
const UNDO_WINDOW_MS = 5000;

/* ─── types ─── */

type Tone = "danger" | "warm" | "positive" | "neutral";

interface InboxSection {
  key: string;
  title: string;
  hint: string;
  count: number;
  tone: Tone;
  icon: React.ComponentType<{ className?: string }>;
  entries: InboxBucketEntry[];
  emptyHint: string;
  defaultOpen?: boolean;
  renderSuffix?: (entry: InboxBucketEntry) => React.ReactNode;
  headerTag?: React.ReactNode;
}

/* ─── tone tokens ─── */

const TONE: Record<
  Tone,
  { bar: string; iconText: string; badge: string; badgeText: string }
> = {
  danger: {
    bar: "bg-[#C9604D]",
    iconText: "text-[#C9604D]",
    badge: "border-[#C9604D]/25 text-[#C9604D]",
    badgeText: "text-[#C9604D]",
  },
  warm: {
    bar: "bg-[#D97757]",
    iconText: "text-[#D97757]",
    badge: "border-[#D97757]/25 text-[#D97757]",
    badgeText: "text-[#D97757]",
  },
  positive: {
    bar: "bg-[#6FAA7D]",
    iconText: "text-[#6FAA7D]",
    badge: "border-[#6FAA7D]/25 text-[#6FAA7D]",
    badgeText: "text-[#6FAA7D]",
  },
  neutral: {
    bar: "bg-stone-400",
    iconText: "text-stone-500",
    badge: "border-stone-200 text-stone-500",
    badgeText: "text-stone-500",
  },
};

const RISK_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };
const MISSING_LABEL: Record<string, string> = {
  screenshot: "截图",
  scene_description: "场景描述",
  platform_notice: "平台通知",
};

/* ─── helpers ─── */

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/* ─── MissingBadge ─── */

function MissingBadge({ field }: { field: string }) {
  const label = MISSING_LABEL[field] ?? field;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#D99E55]/20 bg-[#D99E55]/[0.04] px-1.5 py-0.5 text-[12px] text-[#D99E55]">
      <span className="size-1 rounded-full bg-[#D99E55]" />
      缺{label}
    </span>
  );
}

/* ─── TaskRow ─── */

type RowAction = "approve" | "reject";

function TaskRow({
  entry,
  tone,
  suffix,
  selected,
  onToggle,
  onAction,
  onOpenDetail,
  busyAction,
}: {
  entry: InboxBucketEntry;
  tone: Tone;
  suffix?: React.ReactNode;
  selected: boolean;
  onToggle: () => void;
  onAction: (entry: InboxBucketEntry, action: RowAction) => void;
  onOpenDetail: (id: string) => void;
  busyAction: RowAction | null;
}) {
  const style = TONE[tone];

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-200",
        selected
          ? "border-stone-300 bg-stone-50"
          : "border-transparent hover:border-stone-200 hover:bg-stone-50/80 hover:shadow-[0_4px_12px_-4px_rgba(28,25,23,0.06)]"
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300",
          selected
            ? "border-[#D97757] bg-[#D97757] text-white"
            : "border-stone-300 bg-white hover:border-stone-400"
        )}
      >
        {selected && <Check className="size-3 stroke-[2.5]" />}
      </button>

      {/* Left color bar */}
      <span
        className={cn(
          "absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full transition-all duration-200",
          style.bar,
          selected ? "opacity-100" : "opacity-40 group-hover:opacity-100"
        )}
      />

      {/* Content — 点击行打开中心 Dialog */}
      <button
        type="button"
        onClick={() => onOpenDetail(entry.id)}
        onMouseEnter={() => {
          import("@/components/case-detail-dialog");
        }}
        className="min-w-0 flex-1 cursor-pointer pl-1 text-left focus-visible:outline-none"
      >
        <p className="line-clamp-2 text-[13px] font-medium text-stone-900 leading-[1.6]">
          {entry.script_text}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-stone-500">
          <span>{entry.submitted_by_name}</span>
          <span className="text-stone-300">·</span>
          <span>{formatTime(entry.created_at)}</span>
          {entry.risk_level && entry.risk_level !== "low" ? (
            <>
              <span className="text-stone-300">·</span>
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none",
                  TONE.danger.badge
                )}
              >
                {RISK_LABEL[entry.risk_level] ?? entry.risk_level}风险
              </span>
            </>
          ) : null}
          {suffix}
        </div>
      </button>

      {/* Quick actions — hover 时流畅淡入滑入 */}
      <div className={cn(
        "hidden shrink-0 items-center gap-1 sm:flex",
        "opacity-0 translate-x-2 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto transition-all duration-200"
      )}>
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={(e) => {
            e.stopPropagation();
            onAction(entry, "approve");
          }}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium transition-colors",
            "text-stone-500 hover:bg-[#6FAA7D]/10 hover:text-[#6FAA7D]",
            "disabled:cursor-wait disabled:opacity-60",
          )}
          title="通过"
        >
          {busyAction === "approve" ? (
            <Loader2 className="size-3 animate-spin stroke-[2]" />
          ) : null}
          通过
        </button>
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={(e) => {
            e.stopPropagation();
            onAction(entry, "reject");
          }}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium transition-colors",
            "text-stone-500 hover:bg-[#C9604D]/10 hover:text-[#C9604D]",
            "disabled:cursor-wait disabled:opacity-60",
          )}
          title="驳回"
        >
          {busyAction === "reject" ? (
            <Loader2 className="size-3 animate-spin stroke-[2]" />
          ) : null}
          驳回
        </button>
      </div>
    </div>
  );
}

/* ─── CollapsibleSection ─── */

const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0.04 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

function CollapsibleSection({
  section,
  selectedIds,
  hiddenIds,
  onToggle,
  onAction,
  onOpenDetail,
  busyMap,
  collapsible = true,
}: {
  section: InboxSection;
  selectedIds: Set<string>;
  hiddenIds: Set<string>;
  onToggle: (id: string) => void;
  onAction: (entry: InboxBucketEntry, action: RowAction) => void;
  onOpenDetail: (id: string) => void;
  busyMap: Map<string, RowAction>;
  collapsible?: boolean;
}) {
  const [openState, setOpenState] = useState(section.defaultOpen ?? true);
  const open = collapsible ? openState : true;

  const [expanded, setExpanded] = useState(false);
  const visibleEntries = useMemo(
    () => section.entries.filter((e) => !hiddenIds.has(e.id)),
    [section.entries, hiddenIds],
  );

  const visible = expanded ? visibleEntries : visibleEntries.slice(0, 8);
  const hasMore = visibleEntries.length > 8;
  const visualCount = visibleEntries.length;

  const isHighRiskEmpty = section.key === "high_risk" && visualCount === 0;
  const toneToUse = isHighRiskEmpty ? "positive" : section.tone;
  const style = TONE[toneToUse];
  const Icon = section.icon;

  const headerContent = (
    <div className="flex items-center gap-3 min-w-0">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg border bg-white",
          style.iconText,
          style.badge
        )}
      >
        <Icon className="size-3.5 stroke-[1.5]" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="text-[13px] font-medium text-stone-900 flex items-center gap-1.5">
          <span>{section.title}</span>
          {visualCount > 0 && (
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] tabular-nums font-medium",
                style.badge
              )}
            >
              {visualCount}
            </span>
          )}
          {section.headerTag}
        </p>
        <p className="text-[12px] text-stone-500 mt-0.5">{section.hint}</p>
      </div>
    </div>
  );

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const }}
      className={cn(
        "overflow-hidden rounded-2xl border bg-white transition-colors duration-300 shadow-[0_4px_20px_-4px_rgba(28,25,23,0.03)]",
        (section.tone === "danger" && visualCount > 0)
          ? "border-red-200/60 bg-gradient-to-b from-red-50/[0.03] to-white"
          : "border-stone-200"
      )}
    >
      {/* Header */}
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpenState((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300 focus-visible:ring-inset"
        >
          {headerContent}
          <ChevronDown
            className={cn(
              "size-4 shrink-0 stroke-[1.5] text-stone-500 transition-transform duration-300",
              open ? "" : "-rotate-90"
            )}
          />
        </button>
      ) : (
        <div className="flex w-full items-center justify-between gap-3 px-5 py-4 border-b border-stone-100 bg-white">
          {headerContent}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }}
            className="overflow-hidden"
          >
            <div className="px-3 py-3 bg-white">
              {visibleEntries.length === 0 ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-8 text-center text-[12px] text-stone-400"
                >
                  {section.emptyHint}
                </motion.p>
              ) : (
                <motion.div
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-1.5"
                >
                  <AnimatePresence initial={false}>
                    {visible.map((entry) => (
                      <motion.div
                        key={entry.id}
                        variants={itemVariants}
                        layout
                        exit={{ opacity: 0, height: 0, x: 20 }}
                        transition={{
                          type: "spring",
                          stiffness: 300,
                          damping: 30,
                        }}
                      >
                        <TaskRow
                          entry={entry}
                          tone={section.tone}
                          suffix={section.renderSuffix?.(entry)}
                          selected={selectedIds.has(entry.id)}
                          onToggle={() => onToggle(entry.id)}
                          onAction={onAction}
                          onOpenDetail={onOpenDetail}
                          busyAction={busyMap.get(entry.id) ?? null}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {hasMore && (
                    <motion.div variants={itemVariants} className="pt-2 pl-1">
                      <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
                      >
                        {expanded
                          ? "收起"
                          : `展开剩余 ${visibleEntries.length - 8} 条`}
                        <ChevronDown
                          className={cn(
                            "size-3.5 stroke-[1.5] transition-transform duration-200",
                            expanded ? "rotate-180" : ""
                          )}
                        />
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/* ─── BulkActionBar ─── */

function BulkActionBar({
  count,
  busy,
  onApprove,
  onReject,
  onClear,
}: {
  count: number;
  busy: "approve" | "reject" | null;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        style={{
          // 移动端避开底部 tab + safe-area；桌面端走 px 兜底
          bottom:
            "calc(env(safe-area-inset-bottom, 0px) + var(--bulk-bar-offset, 24px))",
        }}
        className="fixed left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 shadow-sm sm:gap-3 sm:px-5 sm:py-3 [--bulk-bar-offset:24px] max-sm:[--bulk-bar-offset:96px]"
      >
        <span className="whitespace-nowrap text-[13px] font-medium text-stone-900">
          已选择 <span className="tabular-nums text-[#D97757]">{count}</span> 项
        </span>
        <div className="h-4 w-px bg-stone-200" />
        <button
          type="button"
          disabled={busy !== null}
          onClick={onApprove}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-stone-700 transition-colors hover:bg-[#6FAA7D]/10 hover:text-[#6FAA7D] disabled:cursor-wait disabled:opacity-60 sm:px-3"
        >
          {busy === "approve" ? <Loader2 className="size-3 animate-spin" /> : null}
          批量通过
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={onReject}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-stone-700 transition-colors hover:bg-[#C9604D]/10 hover:text-[#C9604D] disabled:cursor-wait disabled:opacity-60 sm:px-3"
        >
          {busy === "reject" ? <Loader2 className="size-3 animate-spin" /> : null}
          批量驳回
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="清除已选"
          className="flex size-7 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
        >
          <X className="size-3.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

/* ─── TaskInbox ─── */

interface TaskInboxProps {
  inbox: {
    pending_review: InboxBucketEntry[];
    missing_data: InboxBucketEntry[];
    high_risk_pending: InboxBucketEntry[];
    promotion_candidates: InboxBucketEntry[];
  };
  counts: InboxCounts;
  /** 是否 Owner — 透传给详情 Dialog 内嵌的审批面板 */
  isOwner?: boolean;
  /** 分栏布局视角 */
  viewType?: "main" | "sidebar";
  /** 外部提升的详情弹窗状态，用于双栏共享同一个弹窗 */
  detailCaseId?: string | null;
  onOpenDetail?: (id: string | null) => void;
}

export function TaskInbox({
  inbox,
  counts,
  isOwner = false,
  viewType = "main",
  detailCaseId,
  onOpenDetail,
}: TaskInboxProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyMap, setBusyMap] = useState<Map<string, RowAction>>(new Map());
  const [bulkBusy, setBulkBusy] = useState<RowAction | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  /** 中心 Dialog 的当前案例 id — 行点击触发 */
  const [internalDetailCaseId, setInternalDetailCaseId] = useState<string | null>(null);
  const activeDetailCaseId = detailCaseId ?? internalDetailCaseId;
  const setActiveDetailCaseId = onOpenDetail ?? setInternalDetailCaseId;
  const [rejectState, setRejectState] = useState<
    | { mode: "single"; entry: InboxBucketEntry }
    | { mode: "bulk"; ids: string[] }
    | null
  >(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  const lastRefreshRef = useRef(0);
  /** 撤销窗口期内挂起的 refresh 定时器，撤销时取消，提交时立即触发 */
  const pendingRefreshTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // 卸载时清掉所有挂起的 refresh
  useEffect(() => {
    const timers = pendingRefreshTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const debouncedRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 500) return;
    lastRefreshRef.current = now;
    router.refresh();
  }, [router]);

  /** Optimistic 隐藏：成功就维持，失败/撤销就回滚 */
  const optimisticHide = useCallback((ids: string[]) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);
  const restoreHidden = useCallback((ids: string[]) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  /**
   * 撤销 toast — 5s 内点撤销调 restore API 把 case 状态原样写回；
   * 5s 后才正式 router.refresh，让审批"落地"。
   */
  const showUndoableToast = useCallback(
    ({
      label,
      snapshots,
      affectedIds,
    }: {
      label: string;
      snapshots: ReviewSnapshot[];
      affectedIds: string[];
    }) => {
      let undone = false;

      // 5s 后正式 commit：刷列表
      const commitTimer = setTimeout(() => {
        pendingRefreshTimers.current.delete(commitTimer);
        if (undone) return;
        debouncedRefresh();
      }, UNDO_WINDOW_MS);
      pendingRefreshTimers.current.add(commitTimer);

      const id = feedbackToast.success(label, {
        duration: UNDO_WINDOW_MS,
        action: snapshots.length > 0
          ? {
              label: "撤销",
              onClick: async () => {
                undone = true;
                clearTimeout(commitTimer);
                pendingRefreshTimers.current.delete(commitTimer);
                // 视觉立刻把行恢复回来
                restoreHidden(affectedIds);
                try {
                  const res = await fetch("/api/violations/review/restore", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ snapshots }),
                  });
                  if (!res.ok) throw new Error("撤销失败");
                  feedbackToast.success("已撤销");
                  // 撤销后也刷一次，让 reviewed_at 之类的辅助字段同步
                  debouncedRefresh();
                } catch (e) {
                  feedbackToast.error(e instanceof Error ? e.message : "撤销失败");
                  // 撤销失败 → 行还是隐藏的（数据库实际审批已写入），后端是源头
                  optimisticHide(affectedIds);
                  debouncedRefresh();
                }
              },
            }
          : undefined,
      });
      // 返回 id 便于将来需要 dismiss
      return id;
    },
    [debouncedRefresh, restoreHidden, optimisticHide],
  );

  const handleSingleAction = useCallback(
    async (entry: InboxBucketEntry, action: RowAction) => {
      if (busyMap.has(entry.id)) return;

      if (action === "reject") {
        // 不在这里发请求，交给 Dialog 流程
        setRejectState({ mode: "single", entry });
        return;
      }

      // approve — optimistic
      setBusyMap((prev) => {
        const next = new Map(prev);
        next.set(entry.id, action);
        return next;
      });
      optimisticHide([entry.id]);
      try {
        const res = await fetch(`/api/violations/${entry.id}/review`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: "verified",
            risk_level: entry.risk_level ?? null,
            usage_state: "available",
            admin_conclusion: null,
            suggested_action: null,
          }),
        });
        if (!res.ok) throw new Error("通过失败");
        const payload: { snapshot?: ReviewSnapshot } = await res.json().catch(() => ({}));
        const snapshot = payload?.snapshot;
        showUndoableToast({
          label: "已通过",
          snapshots: snapshot ? [snapshot] : [],
          affectedIds: [entry.id],
        });
      } catch (e) {
        restoreHidden([entry.id]);
        feedbackToast.error(e instanceof Error ? e.message : "通过失败");
      } finally {
        setBusyMap((prev) => {
          const next = new Map(prev);
          next.delete(entry.id);
          return next;
        });
      }
    },
    [busyMap, optimisticHide, restoreHidden, showUndoableToast],
  );

  const handleBulk = useCallback(
    (action: RowAction) => {
      if (selectedIds.size === 0 || bulkBusy) return;
      if (action === "reject") {
        setRejectState({ mode: "bulk", ids: Array.from(selectedIds) });
        return;
      }
      // approve bulk — optimistic
      const ids = Array.from(selectedIds);
      setBulkBusy(action);
      optimisticHide(ids);
      void (async () => {
        try {
          const res = await fetch("/api/violations/batch-review", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ids, action, conclusion: null }),
          });
          if (!res.ok) throw new Error("批量操作失败");
          const data: {
            success?: number;
            failed?: number;
            snapshots?: ReviewSnapshot[];
          } = await res.json().catch(() => ({}));
          const successCount = data?.success ?? ids.length;
          const failedCount = data?.failed ?? 0;
          const snapshots = data?.snapshots ?? [];
          if (failedCount > 0) {
            feedbackToast.warning(`成功 ${successCount} · 失败 ${failedCount}`);
            debouncedRefresh();
          } else if (successCount > 0) {
            showUndoableToast({
              label: `已批量通过 ${successCount} 条`,
              snapshots,
              affectedIds: snapshots.map((s) => s.id),
            });
          } else {
            debouncedRefresh();
          }
          clearSelection();
        } catch (e) {
          restoreHidden(ids);
          feedbackToast.error(e instanceof Error ? e.message : "批量操作失败");
        } finally {
          setBulkBusy(null);
        }
      })();
    },
    [
      selectedIds,
      bulkBusy,
      optimisticHide,
      restoreHidden,
      clearSelection,
      showUndoableToast,
      debouncedRefresh,
    ],
  );

  /** Dialog 提交：处理 single 或 bulk 驳回 */
  const handleRejectConfirm = useCallback(
    async (reason: string) => {
      if (!rejectState) return;
      setRejectBusy(true);
      try {
        if (rejectState.mode === "single") {
          const entry = rejectState.entry;
          setBusyMap((prev) => {
            const next = new Map(prev);
            next.set(entry.id, "reject");
            return next;
          });
          optimisticHide([entry.id]);
          try {
            const res = await fetch(`/api/violations/${entry.id}/review`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                status: "rejected",
                risk_level: entry.risk_level ?? null,
                usage_state: "banned",
                admin_conclusion: reason,
                suggested_action: null,
              }),
            });
            if (!res.ok) throw new Error("驳回失败");
            const payload: { snapshot?: ReviewSnapshot } = await res
              .json()
              .catch(() => ({}));
            const snapshot = payload?.snapshot;
            showUndoableToast({
              label: "已驳回",
              snapshots: snapshot ? [snapshot] : [],
              affectedIds: [entry.id],
            });
          } catch (e) {
            restoreHidden([entry.id]);
            feedbackToast.error(e instanceof Error ? e.message : "驳回失败");
            throw e;
          } finally {
            setBusyMap((prev) => {
              const next = new Map(prev);
              next.delete(entry.id);
              return next;
            });
          }
        } else {
          const ids = rejectState.ids;
          setBulkBusy("reject");
          optimisticHide(ids);
          try {
            const res = await fetch("/api/violations/batch-review", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                ids,
                action: "reject",
                conclusion: reason,
              }),
            });
            if (!res.ok) throw new Error("批量操作失败");
            const data: {
              success?: number;
              failed?: number;
              snapshots?: ReviewSnapshot[];
            } = await res.json().catch(() => ({}));
            const successCount = data?.success ?? ids.length;
            const failedCount = data?.failed ?? 0;
            const snapshots = data?.snapshots ?? [];
            if (failedCount > 0) {
              feedbackToast.warning(`成功 ${successCount} · 失败 ${failedCount}`);
              debouncedRefresh();
            } else if (successCount > 0) {
              showUndoableToast({
                label: `已批量驳回 ${successCount} 条`,
                snapshots,
                affectedIds: snapshots.map((s) => s.id),
              });
            } else {
              debouncedRefresh();
            }
            clearSelection();
          } catch (e) {
            restoreHidden(ids);
            feedbackToast.error(e instanceof Error ? e.message : "批量操作失败");
            throw e;
          } finally {
            setBulkBusy(null);
          }
        }
        setRejectState(null);
      } catch {
        // 错误时保持 Dialog 打开，让用户看到 toast
      } finally {
        setRejectBusy(false);
      }
    },
    [
      rejectState,
      optimisticHide,
      restoreHidden,
      showUndoableToast,
      debouncedRefresh,
      clearSelection,
    ],
  );

  const allSections: InboxSection[] = useMemo(
    () => [
      {
        key: "high_risk",
        title: "高风险待确认",
        hint: "先处理掉，避免团队误用",
        count: counts.high_risk_pending,
        tone: "danger",
        icon: AlertTriangle,
        entries: inbox.high_risk_pending,
        emptyHint: "✓ 目前安全 · 无高风险踩雷话术待确认",
        headerTag: counts.high_risk_pending > 0 ? (
          <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-[#C9604D]/20 bg-[#C9604D]/[0.04] px-1.5 py-0.5 text-[11px] text-[#C9604D] leading-none">
            <span className="size-1 rounded-full bg-[#C9604D]" />
            优先处理
          </span>
        ) : (
          <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-[#6FAA7D]/20 bg-[#6FAA7D]/[0.04] px-1.5 py-0.5 text-[11px] text-[#6FAA7D] leading-none">
            <span className="size-1 rounded-full bg-[#6FAA7D]" />
            目前安全
          </span>
        ),
      },
      {
        key: "pending",
        title: "待审核",
        hint: "员工新提交的案例，过一遍决定是否纳入",
        count: counts.pending_review,
        tone: "warm",
        icon: ClipboardList,
        entries: inbox.pending_review,
        emptyHint: "目前没有待审核的提交",
      },
      {
        key: "missing",
        title: "缺数据",
        hint: "缺截图或场景描述，先催员工补",
        count: counts.missing_data,
        tone: "neutral",
        icon: FileX2,
        entries: inbox.missing_data,
        emptyHint: "所有提交资料齐全",
        defaultOpen: true,
        renderSuffix: (entry) =>
          entry.missing_fields && entry.missing_fields.length > 0 ? (
            <>
              {entry.missing_fields.map((field) => (
                <MissingBadge key={field} field={field} />
              ))}
            </>
          ) : null,
      },
    ],
    [inbox, counts]
  );

  const sections = useMemo(() => {
    if (viewType === "main") {
      return allSections.filter((s) => s.key === "pending" || s.key === "high_risk");
    }
    return allSections.filter((s) => s.key === "missing");
  }, [allSections, viewType]);

  // 三桶在乐观隐藏后的可见数 — 全 0 显示成就提示
  const visibleTotal = useMemo(() => {
    return sections.reduce(
      (sum, s) => sum + s.entries.filter((e) => !hiddenIds.has(e.id)).length,
      0,
    );
  }, [sections, hiddenIds]);

  const allBucketsTotal = useMemo(() => {
    return sections.reduce((sum, s) => sum + s.count, 0);
  }, [sections]);

  return (
    <>
      <div className="space-y-4">
        {sections.map((section) => (
          <CollapsibleSection
            key={section.key}
            section={section}
            selectedIds={selectedIds}
            hiddenIds={hiddenIds}
            onToggle={toggleId}
            onAction={handleSingleAction}
            onOpenDetail={setActiveDetailCaseId}
            busyMap={busyMap}
            collapsible={viewType === "sidebar"}
          />
        ))}

        <AnimatePresence>
          {visibleTotal === 0 && allBucketsTotal > 0 ? (
            <motion.div
              key="empty-cheer"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className={cn(
                "rounded-2xl border text-center",
                viewType === "main"
                  ? "border-[#6FAA7D]/25 bg-[#6FAA7D]/[0.04] px-6 py-8"
                  : "border-stone-200 bg-stone-50 px-4 py-6"
              )}
            >
              <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-white shadow-sm">
                <Sparkles className="size-4 stroke-[1.75] text-[#6FAA7D]" />
              </div>
              <p className="mt-3 text-[13px] font-medium text-stone-900">
                {viewType === "main" ? "今天的审批已清空" : "无待补材料"}
              </p>
              <p className="mt-1 text-[12px] text-stone-500 font-normal">
                {viewType === "main" ? "辛苦了 · 5 秒内仍可在 toast 撤销" : "材料全部齐全"}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <BulkActionBar
        count={selectedIds.size}
        busy={bulkBusy}
        onApprove={() => handleBulk("approve")}
        onReject={() => handleBulk("reject")}
        onClear={clearSelection}
      />
      <CaseRejectDialog
        open={rejectState !== null}
        busy={rejectBusy}
        count={rejectState?.mode === "bulk" ? rejectState.ids.length : 1}
        subject={
          rejectState?.mode === "single"
            ? rejectState.entry.script_text
            : undefined
        }
        onOpenChange={(o) => {
          if (!o && !rejectBusy) setRejectState(null);
        }}
        onConfirm={handleRejectConfirm}
      />
      {viewType === "main" ? (
        <CaseDetailDialog
          caseId={activeDetailCaseId}
          open={activeDetailCaseId !== null}
          onOpenChange={(o) => {
            if (!o) setActiveDetailCaseId(null);
          }}
          showReviewPanel
          isOwner={isOwner}
          canManage={true}
          onReviewSuccess={() => {
            setActiveDetailCaseId(null);
          }}
        />
      ) : null}
    </>
  );
}
