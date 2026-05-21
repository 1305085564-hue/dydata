"use client";

import Link from "next/link";
import { ArrowUpRight, Loader2 } from "lucide-react";

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
  PendingViolationRow,
} from "./admin-first-screen-loader";
import type { ExemptionRequestRow } from "../豁免申请列表";
import type { AdminRequestRow } from "@/lib/team-join/service";

const RISK_DOT: Record<string, { text: string; color: string }> = {
  high: { text: "高", color: "bg-[#C9604D]" },
  medium: { text: "中", color: "bg-[#D99E55]" },
  low: { text: "低", color: "bg-zinc-300" },
};

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
      ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
      : "bg-[#D97757] text-white hover:bg-[#C96442]";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "rounded-2xl border border-zinc-200 bg-white p-0",
          widthClass,
        )}
      >
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="text-[18px] font-medium tracking-tight text-zinc-800">
            {title}
          </DialogTitle>
          {subtitle ? (
            <div className="mt-1 text-[12px] text-zinc-500">{subtitle}</div>
          ) : null}
        </DialogHeader>

        <div className="px-5 pb-4">{children}</div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-5 py-3">
          {fullViewHref ? (
            <Link
              href={fullViewHref}
              className="inline-flex items-center gap-1 text-[12px] text-zinc-500 transition-colors hover:text-zinc-800"
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
                className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {secondaryAction.loading ? (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                ) : null}
                {secondaryAction.label}
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
                  <Loader2 className="mr-1 size-3 animate-spin" />
                ) : null}
                {primaryAction.label}
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
          <dt className="text-zinc-400">{item.label}</dt>
          <dd className="text-zinc-700">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── 1. 待筛视频 ── */
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
  const states: { text: string; dot: string }[] = [];
  if (row.anomaly_flag) states.push({ text: "数据异常", dot: "bg-[#C9604D]" });
  if (!row.has_tags) states.push({ text: "未打标", dot: "bg-zinc-300" });
  if (row.has_tags && !row.anomaly_flag)
    states.push({ text: "已打标", dot: "bg-[#6FAA7D]" });

  return (
    <PreviewShell
      size="md"
      open={open}
      onOpenChange={onOpenChange}
      title={row.account_name}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            {row.submitted_by_name ?? "未知成员"} 提交 · {row.report_date}
          </span>
          {states.map((s) => (
            <span
              key={s.text}
              className="inline-flex items-center gap-1 text-zinc-600"
            >
              <span className={cn("size-1.5 rounded-full", s.dot)} />
              {s.text}
            </span>
          ))}
        </span>
      }
      fullViewHref={`/admin/videos?focus=${row.id}`}
      fullViewLabel="前往打标"
    >
      <p className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-[13px] leading-7 text-zinc-600">
        打标和异常处理在视频详情页完成。点击下方“前往打标”打开完整工作台。
      </p>
    </PreviewShell>
  );
}

/* ── 2. 待审违规 ── */
export function ViolationPreviewDialog({
  row,
  open,
  onOpenChange,
  onReview,
  reviewing,
}: {
  row: PendingViolationRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReview: (row: PendingViolationRow, status: "verified" | "rejected") => void;
  reviewing: boolean;
}) {
  if (!row) return null;
  const risk = RISK_DOT[row.risk_level ?? ""] ?? null;
  return (
    <PreviewShell
      size="lg"
      open={open}
      onOpenChange={onOpenChange}
      title="案例复核"
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            {row.submitted_by_name ?? "未知成员"} 提交
            {row.category ? ` · ${row.category}` : ""}
          </span>
          {risk ? (
            <span className="inline-flex items-center gap-1 text-zinc-600">
              <span className={cn("size-1.5 rounded-full", risk.color)} />
              风险 {risk.text}
            </span>
          ) : null}
        </span>
      }
      fullViewHref={`/violations?perspective=review&focus=${row.id}`}
      fullViewLabel="完整复核"
      primaryAction={{
        label: "通过",
        tone: "primary",
        onClick: () => onReview(row, "verified"),
        loading: reviewing,
      }}
      secondaryAction={{
        label: "驳回",
        onClick: () => onReview(row, "rejected"),
        loading: reviewing,
      }}
    >
      <div className="max-h-[420px] min-h-[220px] overflow-y-auto rounded-xl border border-zinc-200 border-l-[2px] border-l-[#C9604D] bg-zinc-50 px-5 py-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-200">
        <p className="whitespace-pre-wrap text-[14px] leading-[1.85] text-zinc-800">
          {row.script_text}
        </p>
      </div>
    </PreviewShell>
  );
}

/* ── 3. 待催交 ── */
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
                    <span className={gapDays >= 2 ? "text-[#C9604D]" : "text-zinc-700"}>
                      {gapDays} 天
                    </span>
                  ),
                }
              : null,
          ].filter(Boolean) as { label: string; value: React.ReactNode }[]}
        />
        <p className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-[13px] leading-7 text-zinc-600">
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
          <span className="inline-flex items-center gap-1 text-zinc-600">
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
      <div className="max-h-[360px] min-h-[180px] overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-200">
        <p className="whitespace-pre-wrap text-[14px] leading-[1.85] text-zinc-800">
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
      fullViewLabel="团队管理"
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
