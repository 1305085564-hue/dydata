import {
  FileText,
  Layers,
  LayoutDashboard,
  Target,
  Video,
  type LucideIcon,
} from "lucide-react";
import type {
  SopCheckpoint,
  SopCheckpointStatus,
  SopMemberStatus,
  SopReviewScores,
} from "@/types";

/**
 * 阿禅美学法典 V1 · 状态主题
 * 极简主义 + 高端克制
 * 禁止大面积彩底；仅保留文字色 + 状态点 + 边框左 2px 状态条
 */
export const STATUS_THEME: Record<
  SopCheckpointStatus,
  { label: string; color: string; dot: string; cellBar: string }
> = {
  IDLE: {
    label: "待处理",
    color: "text-zinc-400",
    dot: "bg-zinc-300",
    cellBar: "border-l-zinc-200",
  },
  PENDING: {
    label: "执行中",
    color: "text-[#D99E55]",
    dot: "bg-[#D99E55]",
    cellBar: "border-l-[#D99E55]",
  },
  SUBMITTED: {
    label: "已提交",
    color: "text-[#8AA8C7]",
    dot: "bg-[#8AA8C7]",
    cellBar: "border-l-[#8AA8C7]",
  },
  APPROVED: {
    label: "已通过",
    color: "text-[#6FAA7D]",
    dot: "bg-[#6FAA7D]",
    cellBar: "border-l-[#6FAA7D]",
  },
  REJECTED: {
    label: "需修正",
    color: "text-[#C9604D]",
    dot: "bg-[#C9604D]",
    cellBar: "border-l-[#C9604D]",
  },
  OVERDUE: {
    label: "延期",
    color: "text-zinc-500",
    dot: "bg-zinc-400",
    cellBar: "border-l-zinc-400",
  },
};

export const MATRIX_CHECKPOINTS: Array<{
  id: SopCheckpoint;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "DATA_REPORT", label: "数据报表", icon: LayoutDashboard },
  { id: "MORNING_REVIEW", label: "早会复盘", icon: Layers },
  { id: "TOPIC", label: "选题策划", icon: Target },
  { id: "SCRIPT", label: "脚本创作", icon: FileText },
  { id: "VIDEO", label: "成片审核", icon: Video },
];

export const PRODUCTION_CHECKPOINTS = MATRIX_CHECKPOINTS.filter((checkpoint) =>
  ["TOPIC", "SCRIPT", "VIDEO"].includes(checkpoint.id),
);

export const REVIEW_DIMENSIONS: Array<{
  key: keyof SopReviewScores;
  label: string;
  short: string;
}> = [
  { key: "HOOK", label: "开头感染力", short: "开头 (HOOK)" },
  { key: "VIEWPOINT", label: "观点质量", short: "逻辑 (POV)" },
  { key: "COMPLIANCE", label: "合规红线", short: "合规" },
  { key: "PERFORMANCE_HOOK", label: "绩效钩子", short: "绩效钩子" },
  { key: "YESTERDAY_REVIEW", label: "昨日绩效回顾", short: "昨日回顾" },
  { key: "CTA", label: "导粉话术", short: "转化 (CTA)" },
];

export type WorkspaceTab = "FLOW" | "REVIEW" | "MATRIX";

/**
 * 告警级别文字色（不使用大面积彩底）
 */
export function severityTone(severity: string) {
  return severity === "critical"
    ? "text-[#C9604D]"
    : "text-[#D99E55]";
}

export function severityDot(severity: string) {
  return severity === "critical" ? "bg-[#C9604D]" : "bg-[#D99E55]";
}

export function getLatestSubmission(
  member: SopMemberStatus,
  checkpoint?: SopCheckpoint,
) {
  const submissions = checkpoint
    ? member.submissions.filter((submission) => submission.checkpoint === checkpoint)
    : member.submissions;
  return (
    submissions
      .slice()
      .sort((left, right) => right.submitted_at.localeCompare(left.submitted_at))[0] ??
    null
  );
}

export function checkpointLabel(checkpoint: SopCheckpoint) {
  return MATRIX_CHECKPOINTS.find((item) => item.id === checkpoint)?.label ?? checkpoint;
}

export function emptyStatuses(): Record<SopCheckpoint, SopCheckpointStatus> {
  return {
    DATA_REPORT: "IDLE",
    MORNING_REVIEW: "IDLE",
    TOPIC: "IDLE",
    SCRIPT: "IDLE",
    VIDEO: "IDLE",
  };
}

export function emptyMember(today: string): SopMemberStatus {
  return {
    userId: "",
    userName: "",
    teamId: null,
    groupId: null,
    statusDate: today,
    statuses: emptyStatuses(),
    currentBlocker: "DATA_REPORT",
    isOverdue: false,
    submissions: [],
  };
}

export function matrixRate(rows: SopMemberStatus[]) {
  const total = rows.length * MATRIX_CHECKPOINTS.length;
  if (total === 0) return "0.0";
  const approved = rows.reduce(
    (sum, row) =>
      sum +
      MATRIX_CHECKPOINTS.filter((checkpoint) => row.statuses[checkpoint.id] === "APPROVED")
        .length,
    0,
  );
  return ((approved / total) * 100).toFixed(1);
}
