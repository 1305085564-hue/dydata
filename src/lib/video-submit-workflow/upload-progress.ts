import type { SubmissionSlotRole, SubmissionSlotStatus } from "@/components/submission/提交状态机";
import type { SlotViewState } from "@/app/(app)/dashboard/video-submit-form-model";

export const UPLOAD_LONG_WAIT_MS = 10_000;

type ProgressSlotInput = Pick<SlotViewState, "status" | "startedAt" | "phaseStartedAt" | "finishedAt" | "batchStartedAt">;

export type SlotUploadProgress = {
  status: SubmissionSlotStatus;
  startedAt: number | null;
  phaseStartedAt: number | null;
  finishedAt: number | null;
  batchStartedAt: number | null;
  elapsedMs: number;
  phaseElapsedMs: number;
  isLongWaiting: boolean;
};

export type UploadProgress = Record<SubmissionSlotRole, SlotUploadProgress> & {
  activeRoles: SubmissionSlotRole[];
  totalElapsedMs: number;
  isLongWaiting: boolean;
};

const SLOT_ROLES: SubmissionSlotRole[] = ["screenshot_1", "screenshot_2"];

export function getUploadProgress(
  slots: Record<SubmissionSlotRole, ProgressSlotInput>,
  now: number,
): UploadProgress {
  const activeRoles = SLOT_ROLES.filter((role) => {
    const status = slots[role].status;
    return status === "uploading" || status === "recognizing";
  });

  const progress = Object.fromEntries(SLOT_ROLES.map((role) => {
    const slot = slots[role];
    const isActive = activeRoles.includes(role);
    const endedAt = isActive ? now : slot.finishedAt ?? slot.startedAt ?? now;
    const elapsedMs = slot.startedAt === undefined
      ? 0
      : Math.max(0, endedAt - slot.startedAt);
    const phaseElapsedMs = slot.phaseStartedAt === undefined
      ? 0
      : Math.max(0, endedAt - slot.phaseStartedAt);

    return [role, {
      status: slot.status,
      startedAt: slot.startedAt ?? null,
      phaseStartedAt: slot.phaseStartedAt ?? null,
      finishedAt: slot.finishedAt ?? null,
      batchStartedAt: slot.batchStartedAt ?? null,
      elapsedMs,
      phaseElapsedMs,
      isLongWaiting: isActive && elapsedMs > UPLOAD_LONG_WAIT_MS,
    }];
  })) as Record<SubmissionSlotRole, SlotUploadProgress>;

  const totalStartedAt = activeRoles.reduce<number | null>((earliest, role) => {
    const slot = slots[role];
    const startedAt = slot.batchStartedAt ?? slot.startedAt;
    return startedAt === undefined ? earliest : earliest === null ? startedAt : Math.min(earliest, startedAt);
  }, null);
  const totalElapsedMs = totalStartedAt === null ? 0 : Math.max(0, now - totalStartedAt);

  return {
    ...progress,
    activeRoles,
    totalElapsedMs,
    isLongWaiting: activeRoles.length > 0 && totalElapsedMs > UPLOAD_LONG_WAIT_MS,
  };
}
