import type { SopCheckpoint, SopCheckpointStatus, SopReviewScores, UserRole } from "@/types";

export const SOP_CHECKPOINTS: SopCheckpoint[] = [
  "DATA_REPORT",
  "MORNING_REVIEW",
  "TOPIC",
  "SCRIPT",
  "VIDEO",
];

export const SOP_REVIEW_CHECKPOINTS: SopCheckpoint[] = ["TOPIC", "SCRIPT", "VIDEO"];

export const SOP_CHECKPOINT_LABELS: Record<SopCheckpoint, string> = {
  DATA_REPORT: "数据上报",
  MORNING_REVIEW: "早会",
  TOPIC: "选题",
  SCRIPT: "文案",
  VIDEO: "成片",
};

export const SOP_CHECKPOINT_DEADLINES: Record<SopCheckpoint, string> = {
  DATA_REPORT: "11:15",
  MORNING_REVIEW: "12:00",
  TOPIC: "15:30",
  SCRIPT: "18:00",
  VIDEO: "20:00",
};

export const SOP_REVIEW_DIMENSIONS = [
  "HOOK",
  "VIEWPOINT",
  "COMPLIANCE",
  "PERFORMANCE_HOOK",
  "YESTERDAY_REVIEW",
  "CTA",
] as const;

export const SOP_PASS_SCORE = 6;

export interface SopProfileAccess {
  userId: string;
  role: UserRole;
  teamId: string | null;
  groupId: string | null;
  ledGroupIds: string[];
}

export interface SopTargetProfile {
  userId: string;
  teamId: string | null;
  groupId: string | null;
}

export interface SopAccessDecision {
  allowed: boolean;
  scope: "self" | "group" | "global" | "denied";
}

export interface SopMatrixProfile {
  userId: string;
  userName: string;
  teamId: string | null;
  groupId: string | null;
}

export interface SopMatrixStatus {
  userId: string;
  statusDate: string;
  statuses: Record<SopCheckpoint, SopCheckpointStatus>;
  currentBlocker: SopCheckpoint | null;
  isOverdue: boolean;
}

export interface SopMatrixSubmission {
  userId: string;
  checkpoint: SopCheckpoint;
  reviewStatus: SopCheckpointStatus;
}

export interface SopMatrixRow {
  userId: string;
  userName: string;
  teamId: string | null;
  groupId: string | null;
  statusDate: string;
  statuses: Record<SopCheckpoint, SopCheckpointStatus>;
  currentBlocker: SopCheckpoint | null;
  isOverdue: boolean;
  submittedCount: number;
  approvedCount: number;
}

export function calculateReviewTotal(scores: SopReviewScores) {
  const total =
    scores.HOOK +
    scores.VIEWPOINT +
    scores.COMPLIANCE +
    scores.PERFORMANCE_HOOK +
    scores.YESTERDAY_REVIEW +
    scores.CTA;

  return Math.round((total / SOP_REVIEW_DIMENSIONS.length) * 100) / 100;
}

export function buildReviewDecision(scores: SopReviewScores) {
  const totalScore = calculateReviewTotal(scores);
  return {
    totalScore,
    isPassed: totalScore >= SOP_PASS_SCORE,
    nextStatus: totalScore >= SOP_PASS_SCORE ? "APPROVED" : "REJECTED",
  } as const;
}

export function getNextBlocker(statuses: Record<SopCheckpoint, SopCheckpointStatus>) {
  return SOP_CHECKPOINTS.find((checkpoint) => {
    const status = statuses[checkpoint];
    return status !== "APPROVED";
  }) ?? null;
}

export function applyCheckpointStatus(
  statuses: Record<SopCheckpoint, SopCheckpointStatus>,
  checkpoint: SopCheckpoint,
  status: SopCheckpointStatus,
) {
  const next = { ...statuses, [checkpoint]: status };
  return {
    statuses: next,
    currentBlocker: getNextBlocker(next),
    isOverdue: Object.values(next).some((item) => item === "OVERDUE"),
  };
}

export function canTransitionCheckpointStatus(current: SopCheckpointStatus, next: SopCheckpointStatus) {
  if (current === next) return true;

  const allowed: Partial<Record<SopCheckpointStatus, SopCheckpointStatus[]>> = {
    IDLE: ["SUBMITTED", "PENDING"],
    PENDING: ["SUBMITTED", "OVERDUE"],
    SUBMITTED: ["APPROVED", "REJECTED"],
    REJECTED: ["SUBMITTED", "PENDING"],
    OVERDUE: ["SUBMITTED"],
  };

  return allowed[current]?.includes(next) ?? false;
}

export function canSubmitOwnCheckpoint(actor: SopProfileAccess, targetUserId: string): SopAccessDecision {
  if (actor.userId !== targetUserId) return { allowed: false, scope: "denied" };
  return { allowed: true, scope: "self" };
}

export function canReviewCheckpoint(actor: SopProfileAccess, target: SopTargetProfile): SopAccessDecision {
  if (actor.role === "owner") return { allowed: true, scope: "global" };
  if (actor.role === "admin" && target.groupId && actor.groupId === target.groupId) return { allowed: true, scope: "group" };
  if (target.groupId && actor.ledGroupIds.includes(target.groupId)) return { allowed: true, scope: "group" };
  return { allowed: false, scope: "denied" };
}

export function canReadSopStatus(actor: SopProfileAccess, target: SopTargetProfile): SopAccessDecision {
  if (actor.role === "owner") return { allowed: true, scope: "global" };
  if (actor.userId === target.userId) return { allowed: true, scope: "self" };
  if (actor.role === "admin" && target.groupId && actor.groupId === target.groupId) return { allowed: true, scope: "group" };
  if (target.groupId && actor.ledGroupIds.includes(target.groupId)) return { allowed: true, scope: "group" };
  return { allowed: false, scope: "denied" };
}

export function canReadGroupSop(actor: SopProfileAccess, groupId: string): SopAccessDecision {
  if (actor.role === "owner") return { allowed: true, scope: "global" };
  if (actor.role === "admin" && actor.groupId === groupId) return { allowed: true, scope: "group" };
  if (actor.ledGroupIds.includes(groupId)) return { allowed: true, scope: "group" };
  return { allowed: false, scope: "denied" };
}

export function buildSopMatrixRows(input: {
  profiles: SopMatrixProfile[];
  statuses: SopMatrixStatus[];
  submissions: SopMatrixSubmission[];
  statusDate: string;
  limit?: number;
}): SopMatrixRow[] {
  const statusByUserId = new Map(input.statuses.map((status) => [status.userId, status]));
  const submissionsByUserId = new Map<string, SopMatrixSubmission[]>();

  for (const submission of input.submissions) {
    const userSubmissions = submissionsByUserId.get(submission.userId) ?? [];
    userSubmissions.push(submission);
    submissionsByUserId.set(submission.userId, userSubmissions);
  }

  return input.profiles.slice(0, input.limit ?? 24).map((profile) => {
    const status = statusByUserId.get(profile.userId);
    const statuses = status?.statuses ?? {
      DATA_REPORT: "IDLE",
      MORNING_REVIEW: "IDLE",
      TOPIC: "IDLE",
      SCRIPT: "IDLE",
      VIDEO: "IDLE",
    };
    const submissions = submissionsByUserId.get(profile.userId) ?? [];

    return {
      ...profile,
      statusDate: status?.statusDate ?? input.statusDate,
      statuses,
      currentBlocker: status?.currentBlocker ?? getNextBlocker(statuses),
      isOverdue: status?.isOverdue ?? Object.values(statuses).some((item) => item === "OVERDUE"),
      submittedCount: submissions.length,
      approvedCount: submissions.filter((submission) => submission.reviewStatus === "APPROVED").length,
    };
  });
}
