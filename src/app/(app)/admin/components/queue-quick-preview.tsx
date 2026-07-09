"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type {
  PendingSubmissionRow,
  PendingVideoRow,
} from "./admin-first-screen-loader";
import type { ExemptionRequestRow } from "../豁免申请列表";
import type { AdminRequestRow } from "@/lib/team-join/service";

const EXEMPTION_TYPE_LABELS: Record<string, string> = {
  yesterday: "昨日",
  range: "多日",
  permanent: "永久",
  single: "昨日",
  "3days": "多日",
  "4days": "多日",
  "5days": "多日",
};

interface PreviewShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  primaryAction?: {
    label: string;
    onClick: () => void;
    tone?: "primary" | "danger";
    loading?: boolean;
    disabled?: boolean;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
    disabled?: boolean;
  };
  fullViewHref?: string;
  fullViewLabel?: string;
  size?: "sm" | "md" | "lg";
}

function PreviewShell({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  primaryAction,
  secondaryAction,
  fullViewHref,
  fullViewLabel = "完整查看",
  size = "md",
}: PreviewShellProps) {
  const widthClass =
    size === "lg" ? "sm:max-w-xl" : size === "md" ? "sm:max-w-lg" : "sm:max-w-md";
  const primaryToneClass =
    primaryAction?.tone === "danger"
      ? "bg-stone-100 text-stone-700 hover:bg-stone-200"
      : "bg-[#D97757] text-white hover:bg-[#C96442]";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "rounded-2xl border border-stone-200 bg-white p-0",
          widthClass,
        )}
      >
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="text-[18px] font-medium tracking-tight text-stone-800">
            {title}
          </DialogTitle>
          {subtitle ? (
            <div className="mt-1 text-[12px] text-stone-500">{subtitle}</div>
          ) : null}
        </DialogHeader>

        <div className="px-5 pb-4">{children}</div>

        <div className="flex items-center justify-between gap-2 border-t border-stone-100 px-5 py-3">
          {fullViewHref ? (
            <Link
              href={fullViewHref}
              className="active:translate-y-0 inline-flex items-center gap-1 text-[12px] text-stone-500 transition-colors hover:text-stone-800"
              onClick={() => onOpenChange(false)}
            >
              {fullViewLabel}
              <ArrowUpRight className="size-3 stroke-[1.5]" />
            </Link>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {secondaryAction ? (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                disabled={secondaryAction.loading || secondaryAction.disabled}
                className="inline-flex h-8 items-center rounded-lg border border-stone-200 bg-white px-3 text-[12px] font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {secondaryAction.loading ? (
                  <div className="space-y-2"><div className="h-12 rounded-lg bg-stone-100" /><div className="h-12 rounded-lg bg-stone-100" /></div>
                ) : (
                  <>
                    {secondaryAction.label}
                  </>
                )}
              </button>
            ) : null}
            {primaryAction ? (
              <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={primaryAction.loading || primaryAction.disabled}
                className={cn(
                  "inline-flex h-8 items-center rounded-lg px-3.5 text-[12px] font-medium transition active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50",
                  primaryToneClass,
                )}
              >
                {primaryAction.loading ? (
                  <div className="space-y-2"><div className="h-12 rounded-lg bg-stone-100" /><div className="h-12 rounded-lg bg-stone-100" /></div>
                ) : (
                  <>
                    {primaryAction.label}
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetaInline({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-baseline gap-1.5">
          <dt className="text-stone-400">{item.label}</dt>
          <dd className="text-stone-700">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── 1. 异常视频 ── */
export function VideoPreviewDialog({
  row,
  open,
  onOpenChange,
}: {
  row: PendingVideoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!row) return null;
  const isSurge = row.play_change_signal === "surge";
  const pct = row.play_count_change_pct;
  const pctText = pct != null ? `${pct > 0 ? "+" : ""}${Math.round(pct)}%` : "—";
  return (
    <PreviewShell
      size="md"
      open={open}
      onOpenChange={onOpenChange}
      title={row.account_name}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            {row.submitted_by_name ?? "未知成员"} 提交
            {row.published_at ? ` · ${row.published_at.slice(0, 10)}` : ""}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1",
              isSurge ? "text-[#C9604D]" : "text-[#6FAA7D]",
            )}
          >
            {isSurge ? "暴涨" : "腰斩"} {pctText}
          </span>
        </span>
      }
      fullViewHref={`/admin/content?view=all`}
      fullViewLabel="前往批改台"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
          <p className="text-[11px] text-stone-400">本条 24h 播放</p>
          <p className="mt-1 text-[18px] font-medium tabular-nums text-stone-800">
            {(row.current_play_count ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
          <p className="text-[11px] text-stone-400">上一条 24h 播放</p>
          <p className="mt-1 text-[18px] font-medium tabular-nums text-stone-800">
            {(row.previous_play_count ?? 0).toLocaleString()}
          </p>
        </div>
      </div>
    </PreviewShell>
  );
}

/* ── 2. 待催交 ── */
export function SubmissionPreviewDialog({
  row,
  date,
  open,
  onOpenChange,
  onOpenRemindLog,
}: {
  row: PendingSubmissionRow | null;
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRemindLog: () => void;
}) {
  if (!row) return null;
  const lastReport = row.last_report_date ?? "—";
  const gapDays = computeGapDays(row.last_report_date, date);
  return (
    <PreviewShell
      size="md"
      open={open}
      onOpenChange={onOpenChange}
      title={row.name}
      subtitle={
        <span>
          {row.team_name ?? "未分组"} · 今天还没交日报
        </span>
      }
      fullViewHref={`/admin/analytics?profile=${row.profile_id}`}
      fullViewLabel="个人分析"
      secondaryAction={{
        label: "催交历史",
        onClick: () => {
          onOpenChange(false);
          onOpenRemindLog();
        },
      }}
    >
      <div className="space-y-3">
        <MetaInline
          items={[
            { label: "上次交报", value: lastReport },
            gapDays !== null
              ? {
                  label: "距今",
                  value: (
                    <span className={gapDays >= 2 ? "text-[#C9604D]" : "text-stone-700"}>
                      {gapDays} 天
                    </span>
                  ),
                }
              : null,
          ].filter(Boolean) as { label: string; value: React.ReactNode }[]}
        />
        <p className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 text-[13px] leading-7 text-stone-600">
          系统每天 11:15 自动飞书催交。 “催交历史” 可看具体送达记录。
        </p>
      </div>
    </PreviewShell>
  );
}

function computeGapDays(lastReport: string | null, todayStr: string): number | null {
  if (!lastReport) return null;
  const a = new Date(lastReport);
  const b = new Date(todayStr);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

/* ── 4. 待审豁免 ── */
export function ExemptionPreviewDialog({
  row,
  open,
  onOpenChange,
  onDecision,
  reviewing,
}: {
  row: ExemptionRequestRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecision: (row: ExemptionRequestRow, decision: "approved" | "rejected") => void;
  reviewing: boolean;
}) {
  if (!row) return null;
  const typeLabel = EXEMPTION_TYPE_LABELS[row.exemption_type] ?? row.exemption_type;
  return (
    <PreviewShell
      size="lg"
      open={open}
      onOpenChange={onOpenChange}
      title={`${row.applicant_name} 申请豁免`}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1 text-stone-600">
            <span className="size-1.5 rounded-full bg-[#D99E55]" />
            {typeLabel}
          </span>
          <span>{formatDate(row.created_at)}</span>
        </span>
      }
      fullViewHref={`/admin/modules?focus=exemption`}
      fullViewLabel="豁免管理"
      primaryAction={{
        label: "同意",
        tone: "primary",
        onClick: () => onDecision(row, "approved"),
        loading: reviewing,
      }}
      secondaryAction={{
        label: "驳回",
        onClick: () => onDecision(row, "rejected"),
        loading: reviewing,
      }}
    >
      <div className="max-h-[360px] min-h-[180px] overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 px-5 py-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-200">
        <p className="whitespace-pre-wrap text-[14px] leading-[1.85] text-stone-800">
          {row.reason ?? "未填写原因"}
        </p>
      </div>
    </PreviewShell>
  );
}

/* ── 5. 入团申请 ── */
export function JoinPreviewDialog({
  row,
  open,
  onOpenChange,
  onDecision,
  reviewing,
}: {
  row: AdminRequestRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecision: (row: AdminRequestRow, decision: "approved" | "rejected") => void;
  reviewing: boolean;
}) {
  if (!row) return null;
  return (
    <PreviewShell
      size="md"
      open={open}
      onOpenChange={onOpenChange}
      title={`${row.applicantName || "未命名"} 申请入团`}
      subtitle={<span>{formatDate(row.createdAt)}</span>}
      fullViewHref={`/admin/modules?focus=team`}
      fullViewLabel="内容中心"
      primaryAction={{
        label: "同意",
        tone: "primary",
        onClick: () => onDecision(row, "approved"),
        loading: reviewing,
      }}
      secondaryAction={{
        label: "驳回",
        onClick: () => onDecision(row, "rejected"),
        loading: reviewing,
      }}
    >
      <MetaInline
        items={[
          { label: "目标团队", value: row.targetTeamName || "未知团队" },
          ...(row.applicantEmail
            ? [{ label: "邮箱", value: row.applicantEmail }]
            : []),
        ]}
      />
    </PreviewShell>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}
