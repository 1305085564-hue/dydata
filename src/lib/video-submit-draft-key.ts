export type VideoSubmitDraftMode = "create" | "backfill" | "edit";

export const VIDEO_SUBMIT_DRAFT_KEY_PREFIX = "dydata.draft.videoSubmit.v2";
export const LEGACY_VIDEO_SUBMIT_DRAFT_KEY_PREFIX = "dydata.draft.videoSubmit.";

function sanitizeSegment(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "none";
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function buildVideoSubmitDraftKey(input: {
  userId: string;
  mode: VideoSubmitDraftMode;
  accountId?: string | null;
  bizDate?: string | null;
  videoId?: string | null;
}) {
  const segments = [
    VIDEO_SUBMIT_DRAFT_KEY_PREFIX,
    sanitizeSegment(input.mode),
    sanitizeSegment(input.userId),
    sanitizeSegment(input.accountId),
    sanitizeSegment(input.bizDate),
  ];
  if (input.mode === "edit") {
    segments.push(sanitizeSegment(input.videoId));
  }
  return segments.join(".");
}

interface MinimalStorage {
  getItem(key: string): string | null;
}

function getDefaultStorage(): MinimalStorage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // localStorage 访问被禁用时视为无存储
  }
  return null;
}

/**
 * 新建态的存储 key 解析：
 * - v2 create key 已有草稿 → 继续用 v2 key
 * - 否则旧版共享 key 有草稿 → 只在新建态读取旧 key（不迁移、不删除）
 * - 都没有 → 用 v2 create key
 */
export function resolveVideoSubmitCreateDraftStorageKey(input: {
  userId: string;
  accountId?: string | null;
  bizDate?: string | null;
  storage?: MinimalStorage | null;
}) {
  const nextKey = buildVideoSubmitDraftKey({ ...input, mode: "create" });
  const storage = input.storage === undefined ? getDefaultStorage() : input.storage;
  if (!storage) return nextKey;

  try {
    if (storage.getItem(nextKey)) return nextKey;
    const legacyKey = `${LEGACY_VIDEO_SUBMIT_DRAFT_KEY_PREFIX}${sanitizeSegment(input.userId)}`;
    if (storage.getItem(legacyKey)) return legacyKey;
  } catch {
    // 存储不可用时退回新 key
  }
  return nextKey;
}
