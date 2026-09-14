import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPersonDataCache,
  loadPersonData,
  readPersonDataCache,
  writePersonDataCache,
} from "./person-data";
import type { PersonDetailData } from "./types";

const personData = {
  userId: "user-1",
  name: "成员 A",
  teamId: "team-1",
  currentMonth: {
    writerCount: 0,
    editorCount: 0,
    operatorCount: 0,
  },
  trend: [],
  records: [],
  operatorSummary: null,
} satisfies PersonDetailData;

test("clearPersonDataCache 只清理指定用户的月份缓存", () => {
  writePersonDataCache("user-1-2026-9", personData);
  writePersonDataCache("user-1-2026-8", personData);
  writePersonDataCache("user-2-2026-9", personData);

  clearPersonDataCache("user-1");

  assert.equal(readPersonDataCache("user-1-2026-9"), null);
  assert.equal(readPersonDataCache("user-1-2026-8"), null);
  assert.equal(readPersonDataCache("user-2-2026-9"), personData);
  clearPersonDataCache("user-2");
});

test("clearPersonDataCache 会阻止已在路上的旧请求回写缓存", async () => {
  const originalFetch = globalThis.fetch;
  const fetchControl: { resolve?: (response: Response) => void } = {};
  globalThis.fetch = (() => new Promise<Response>((resolve) => {
    fetchControl.resolve = resolve;
  })) as typeof fetch;

  try {
    const pending = loadPersonData("user-1", 2026, 9);
    clearPersonDataCache("user-1");

    assert.ok(fetchControl.resolve);
    fetchControl.resolve(Response.json(personData));
    await pending;

    assert.equal(readPersonDataCache("user-1-2026-9"), null);
  } finally {
    globalThis.fetch = originalFetch;
    clearPersonDataCache("user-1");
  }
});
