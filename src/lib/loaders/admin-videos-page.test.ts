import test from "node:test";
import assert from "node:assert/strict";

import { __internal, ADMIN_VIDEOS_INITIAL_LIMIT } from "./admin-videos-page";

test("素材库首屏限制条数，full 模式保留全部", () => {
  const rows = Array.from({ length: ADMIN_VIDEOS_INITIAL_LIMIT + 1 }, (_, index) => ({ id: index }));
  assert.equal(__internal.limitInitialVideos(rows, "initial").length, ADMIN_VIDEOS_INITIAL_LIMIT);
  assert.equal(__internal.limitInitialVideos(rows, "full").length, ADMIN_VIDEOS_INITIAL_LIMIT + 1);
  assert.deepEqual(__internal.limitInitialVideos([], "initial"), []);
});

test("Supabase 关联对象、数组与 null 都归一化", () => {
  const rows = __internal.normalizeVideoRows([
    { id: "v1", accounts: [{ name: "账号", profile_id: "u1" }], profiles: { name: "成员" } },
    { id: "v2", accounts: null, profiles: [] },
  ] as never);
  assert.equal(rows[0]?.accounts.name, "账号");
  assert.equal(rows[0]?.accounts.profile_id, "u1");
  assert.equal(rows[1]?.accounts.name, "未命名账号");
  assert.equal(rows[1]?.profiles.name, "未命名成员");
});

test("素材库按视频 ID 分批查询，避免超长 IN 请求", () => {
  const ids = Array.from({ length: 251 }, (_, index) => `video-${index}`);
  assert.deepEqual(__internal.chunkVideoIds(ids, 100), [
    ids.slice(0, 100),
    ids.slice(100, 200),
    ids.slice(200),
  ]);
});
