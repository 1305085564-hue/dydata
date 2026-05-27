"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardList,
  FileX2,
  Sparkles,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { InboxBucketEntry, InboxCounts } from "../data";

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
    bar: "bg-zinc-400",
    iconText: "text-zinc-500",
    badge: "border-zinc-200 text-zinc-500",
    badgeText: "text-zinc-500",
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

function formatNumber(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatRate(rate: number | null | undefined) {
  if (rate == null) return "—";
  return `${(Number(rate) * 100).toFixed(1)}%`;
}

/* ─── MissingBadge ─── */

function MissingBadge({ field }: { field: string }) {
  const label = MISSING_LABEL[field] ?? field;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#D99E55]/20 bg-[#D99E55]/[0.04] px-1.5 py-0.5 text-[11px] text-[#D99E55]">
      <span className="size-1 rounded-full bg-[#D99E55]" />
      缺{label}
    </span>
  );
}

/* ─── TaskRow ─── */

function TaskRow({
  entry,
  tone,
  suffix,
  selected,
  onToggle,
}: {
  entry: InboxBucketEntry;
  tone: Tone;
  suffix?: React.ReactNode;
  selected: boolean;
  onToggle: () => void;
}) {
  const style = TONE[tone];

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
        selected
          ? "border-zinc-300 bg-zinc-50"
          : "border-transparent hover:border-zinc-200 hover:bg-zinc-50/60"
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
          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300",
          selected
            ? "border-[#D97757] bg-[#D97757] text-white"
            : "border-zinc-300 bg-white hover:border-zinc-400"
        )}
      >
        {selected && <Check className="size-3 stroke-[2.5]" />}
      </button>

      {/* Left color bar */}
      <span
        className={cn(
          "absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full transition-all duration-200",
          style.bar,
          selected ? "opacity-100" : "opacity-60 group-hover:opacity-100"
        )}
      />

      {/* Content */}
      <Link
        href={`/violations/${entry.id}`}
        className="min-w-0 flex-1 pl-1 focus-visible:outline-none"
      >
        <p className="line-clamp-2 text-[13px] font-medium text-zinc-800">
          {entry.script_text}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-zinc-500">
          <span>{entry.submitted_by_name}</span>
          <span className="text-zinc-300">·</span>
          <span>{formatTime(entry.created_at)}</span>
          {entry.risk_level && entry.risk_level !== "low" ? (
            <>
              <span className="text-zinc-300">·</span>
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
                  TONE.danger.badge
                )}
              >
                {RISK_LABEL[entry.risk_level] ?? entry.risk_level}风险
              </span>
            </>
          ) : null}
          {suffix}
        </div>
      </Link>

      {/* Quick actions */}
      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-[#6FAA7D]"
          title="通过"
        >
          通过
        </button>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-[#C9604D]"
          title="驳回"
        >
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
  onToggle,
}: {
  section: InboxSection;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(section.defaultOpen ?? true);
  const [expanded, setExpanded] = useState(false);
  const style = TONE[section.tone];
  const Icon = section.icon;
  const visible = expanded ? section.entries : section.entries.slice(0, 5);
  const hasMore = section.entries.length > 5;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const }}
      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-zinc-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-inset"
      >
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
            <p className="text-[13px] font-semibold text-zinc-800">
              {section.title}
              {section.count > 0 && (
                <span
                  className={cn(
                    "ml-2 inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-mono tabular-nums font-semibold",
                    style.badge
                  )}
                >
                  {section.count}
                </span>
              )}
              {section.headerTag}
            </p>
            <p className="text-[11px] text-zinc-500">{section.hint}</p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 stroke-[1.5] text-zinc-400 transition-transform duration-300",
            open ? "" : "-rotate-90"
          )}
        />
      </button>

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
            <div className="border-t border-zinc-100 px-2 py-2">
              {section.entries.length === 0 ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-3 py-6 text-center text-[12px] text-zinc-400"
                >
                  {section.emptyHint}
                </motion.p>
              ) : (
                <motion.div
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-0.5"
                >
                  {visible.map((entry) => (
                    <motion.div key={entry.id} variants={itemVariants}>
                      <TaskRow
                        entry={entry}
                        tone={section.tone}
                        suffix={section.renderSuffix?.(entry)}
                        selected={selectedIds.has(entry.id)}
                        onToggle={() => onToggle(entry.id)}
                      />
                    </motion.div>
                  ))}
                  {hasMore && (
                    <motion.div variants={itemVariants} className="pt-1">
                      <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
                      >
                        {expanded
                          ? "收起"
                          : `展开剩余 ${section.entries.length - 5} 条`}
                        <ChevronDown
                          className={cn(
                            "size-3 stroke-[1.5] transition-transform duration-200",
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
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const }}
        className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-5 py-3 shadow-lg shadow-zinc-900/8"
      >
        <span className="text-[13px] font-medium text-zinc-800">
          已选择 <span className="tabular-nums text-[#D97757]">{count}</span> 项
        </span>
        <div className="h-4 w-px bg-zinc-200" />
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
        >
          批量通过
        </button>
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
        >
          批量驳回
        </button>
        <button
          type="button"
          onClick={onClear}
          className="flex size-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
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
}

export function TaskInbox({ inbox, counts }: TaskInboxProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const sections: InboxSection[] = useMemo(
    () => [
      {
        key: "high_risk",
        title: "高风险待确认",
        hint: "先处理掉，避免团队误用",
        count: counts.high_risk_pending,
        tone: "danger",
        icon: AlertTriangle,
        entries: inbox.high_risk_pending,
        emptyHint: "目前没有高风险案例待处理",
        headerTag: counts.high_risk_pending > 0 ? (
          <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-[#C9604D]/20 bg-[#C9604D]/[0.04] px-1.5 py-0.5 text-[11px] text-[#C9604D]">
            <span className="size-1 rounded-full bg-[#C9604D]" />
            优先处理
          </span>
        ) : null,
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
        defaultOpen: false,
        renderSuffix: (entry) =>
          entry.missing_fields && entry.missing_fields.length > 0 ? (
            <>
              {entry.missing_fields.map((field) => (
                <MissingBadge key={field} field={field} />
              ))}
            </>
          ) : null,
      },
      {
        key: "promote",
        title: "推广候选",
        hint: "转化数据稳定，决定要不要置顶",
        count: counts.promotion_candidates,
        tone: "positive",
        icon: Sparkles,
        entries: inbox.promotion_candidates,
        emptyHint: "暂无推广候选话术",
        defaultOpen: false,
        renderSuffix: (entry) => (
          <>
            <span className="text-zinc-300">·</span>
            <span className="text-[12px] text-zinc-500">
              {formatNumber(entry.total_views)} 展示
            </span>
            <span className="text-zinc-300">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[12px] text-zinc-500">转化</span>
              <div className="h-1 w-10 rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-[#6FAA7D]"
                  style={{
                    width: `${Math.min(
                      (entry.weighted_conversion_rate ?? 0) * 100 * 5,
                      100
                    )}%`,
                  }}
                />
              </div>
              <span className="text-[12px] font-medium text-[#6FAA7D] tabular-nums">
                {formatRate(entry.weighted_conversion_rate)}
              </span>
            </span>
          </>
        ),
      },
    ],
    [inbox, counts]
  );

  return (
    <>
      <div className="space-y-3">
        {sections.map((section) => (
          <CollapsibleSection
            key={section.key}
            section={section}
            selectedIds={selectedIds}
            onToggle={toggleId}
          />
        ))}
      </div>
      <BulkActionBar count={selectedIds.size} onClear={clearSelection} />
    </>
  );
}
