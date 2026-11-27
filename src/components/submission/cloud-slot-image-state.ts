import type { SubmissionSlotRole, SubmissionSlotState } from "./提交状态机";

export type CloudSlotImagePhase = "loading" | "loaded" | "failed";

export interface CloudSlotImageEntry {
  src: string;
  phase: CloudSlotImagePhase;
  reloadSeq: number;
}

export type CloudSlotImageStateMap = Record<SubmissionSlotRole, CloudSlotImageEntry | null>;

type SlotCloudLike = Pick<SubmissionSlotState, "status"> & {
  file?: File | null;
  assetUrl?: string | null;
  previewUrl?: string | null;
};

/** 仅保留云端 assetUrl、无本地文件且无 blob 预览的草稿/已存截图，需要展示「来自云端」加载与失败兜底态。 */
export function isCloudRestoredSlotImage(slot: SlotCloudLike): boolean {
  if (!slot.assetUrl) return false;
  if (slot.status === "uploading" || slot.status === "recognizing" || slot.status === "empty") return false;
  if (slot.file) return false;
  if (slot.previewUrl && slot.previewUrl.startsWith("blob:")) return false;
  return true;
}

export function resolveCloudSlotImageEntry(
  entry: CloudSlotImageEntry | null | undefined,
  src: string | null | undefined,
): CloudSlotImageEntry | null {
  if (!src) return null;
  if (entry && entry.src === src) return entry;
  return { src, phase: "loading", reloadSeq: 0 };
}

export function markCloudSlotImageLoaded(
  current: CloudSlotImageStateMap,
  role: SubmissionSlotRole,
  src: string,
): CloudSlotImageStateMap {
  const existing = resolveCloudSlotImageEntry(current[role], src);
  if (!existing || (existing.phase === "loaded" && current[role]?.src === src)) return current;
  return { ...current, [role]: { ...existing, phase: "loaded" } };
}

export function markCloudSlotImageFailed(
  current: CloudSlotImageStateMap,
  role: SubmissionSlotRole,
  src: string,
): CloudSlotImageStateMap {
  const existing = resolveCloudSlotImageEntry(current[role], src);
  if (!existing || (existing.phase === "failed" && current[role]?.src === src)) return current;
  return { ...current, [role]: { ...existing, phase: "failed" } };
}

export function retryCloudSlotImageLoad(
  current: CloudSlotImageStateMap,
  role: SubmissionSlotRole,
  src: string,
): CloudSlotImageStateMap {
  const existing = resolveCloudSlotImageEntry(current[role], src);
  if (!existing) return current;
  return {
    ...current,
    [role]: { src, phase: "loading", reloadSeq: existing.reloadSeq + 1 },
  };
}
