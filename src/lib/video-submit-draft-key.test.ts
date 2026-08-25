import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_VIDEO_SUBMIT_DRAFT_KEY_PREFIX,
  buildVideoSubmitDraftKey,
  resolveVideoSubmitCreateDraftStorageKey,
} from "./video-submit-draft-key";

const USER_ID = "123e4567-e89b-12d3-a456-426614174001";
const ACCOUNT_A = "223e4567-e89b-12d3-a456-426614174002";
const ACCOUNT_B = "223e4567-e89b-12d3-a456-426614174003";
const VIDEO_1 = "323e4567-e89b-12d3-a456-426614174004";
const VIDEO_2 = "323e4567-e89b-12d3-a456-426614174005";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

test("新建与编辑草稿 key 互不相同", () => {
  const createKey = buildVideoSubmitDraftKey({
    userId: USER_ID,
    mode: "create",
    accountId: ACCOUNT_A,
    bizDate: "2026-08-25",
  });
  const editKey = buildVideoSubmitDraftKey({
    userId: USER_ID,
    mode: "edit",
    accountId: ACCOUNT_A,
    bizDate: "2026-08-25",
    videoId: VIDEO_1,
  });
  assert.notEqual(createKey, editKey);
});

test("不同账号、日期、videoId 的编辑草稿 key 不冲突", () => {
  const base = { userId: USER_ID, mode: "edit" as const, bizDate: "2026-08-25" };
  const keyA1 = buildVideoSubmitDraftKey({ ...base, accountId: ACCOUNT_A, videoId: VIDEO_1 });
  const keyB1 = buildVideoSubmitDraftKey({ ...base, accountId: ACCOUNT_B, videoId: VIDEO_1 });
  const keyA2 = buildVideoSubmitDraftKey({ ...base, accountId: ACCOUNT_A, videoId: VIDEO_2 });
  const keyOtherDate = buildVideoSubmitDraftKey({ ...base, accountId: ACCOUNT_A, videoId: VIDEO_1, bizDate: "2026-08-24" });
  const keyOtherUser = buildVideoSubmitDraftKey({ userId: "other-user", mode: "edit", accountId: ACCOUNT_A, videoId: VIDEO_1, bizDate: "2026-08-25" });

  assert.notEqual(keyA1, keyB1);
  assert.notEqual(keyA1, keyA2);
  assert.notEqual(keyA1, keyOtherDate);
  assert.notEqual(keyA1, keyOtherUser);
});

test("补交草稿与新建、编辑互不冲突", () => {
  const createKey = buildVideoSubmitDraftKey({ userId: USER_ID, mode: "create", accountId: ACCOUNT_A, bizDate: "2026-08-25" });
  const backfillKey = buildVideoSubmitDraftKey({ userId: USER_ID, mode: "backfill", accountId: ACCOUNT_A, bizDate: "2026-08-24" });
  const backfillAgain = buildVideoSubmitDraftKey({ userId: USER_ID, mode: "backfill", accountId: ACCOUNT_A, bizDate: "2026-08-24" });
  assert.equal(backfillKey, backfillAgain);
  assert.notEqual(createKey, backfillKey);
});

test("清除编辑草稿不会影响新建草稿（key 不同即存储隔离）", () => {
  const storage = memoryStorage();
  const editKey = buildVideoSubmitDraftKey({ userId: USER_ID, mode: "edit", accountId: ACCOUNT_A, videoId: VIDEO_1, bizDate: "2026-08-25" });
  const createKey = buildVideoSubmitDraftKey({ userId: USER_ID, mode: "create", accountId: ACCOUNT_A, bizDate: "2026-08-25" });
  storage.setItem(editKey, JSON.stringify({ data: { meta: { content: "编辑草稿" } }, savedAt: "t1" }));
  storage.setItem(createKey, JSON.stringify({ data: { meta: { content: "新建草稿" } }, savedAt: "t2" }));

  // 模拟 clearDraft：仅删除当前 key
  storage.removeItem(editKey);

  assert.equal(storage.getItem(editKey), null);
  assert.notEqual(storage.getItem(createKey), null);
});

test("新建态优先 v2 key，其次只读兼容旧共享 key", () => {
  const legacyKey = `${LEGACY_VIDEO_SUBMIT_DRAFT_KEY_PREFIX}${USER_ID}`;

  const fresh = resolveVideoSubmitCreateDraftStorageKey({
    userId: USER_ID,
    accountId: ACCOUNT_A,
    bizDate: "2026-08-25",
    storage: memoryStorage(),
  });
  assert.equal(fresh.startsWith("dydata.draft.videoSubmit.v2.create."), true);

  const withLegacyOnly = resolveVideoSubmitCreateDraftStorageKey({
    userId: USER_ID,
    accountId: ACCOUNT_A,
    bizDate: "2026-08-25",
    storage: memoryStorage({ [legacyKey]: JSON.stringify({ data: {}, savedAt: "t0" }) }),
  });
  assert.equal(withLegacyOnly, legacyKey);

  const v2Key = buildVideoSubmitDraftKey({ userId: USER_ID, mode: "create", accountId: ACCOUNT_A, bizDate: "2026-08-25" });
  assert.notEqual(v2Key, legacyKey);
  const withBoth = resolveVideoSubmitCreateDraftStorageKey({
    userId: USER_ID,
    accountId: ACCOUNT_A,
    bizDate: "2026-08-25",
    storage: memoryStorage({ [v2Key]: "x", [legacyKey]: "y" }),
  });
  assert.equal(withBoth, v2Key);
});

test("编辑/补交态不读取旧共享 key", () => {
  const legacyKey = `${LEGACY_VIDEO_SUBMIT_DRAFT_KEY_PREFIX}${USER_ID}`;
  const editKey = buildVideoSubmitDraftKey({ userId: USER_ID, mode: "edit", accountId: ACCOUNT_A, videoId: VIDEO_1, bizDate: "2026-08-25" });
  assert.notEqual(editKey, legacyKey);

  const backfillKey = buildVideoSubmitDraftKey({ userId: USER_ID, mode: "backfill", accountId: ACCOUNT_A, bizDate: "2026-08-24" });
  assert.notEqual(backfillKey, legacyKey);
});
