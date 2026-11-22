import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { DEFAULT_CONTENT_LIST_FILTERS } from "@/lib/content/domain/content-list-filters";
import type { VideoMetricsSnapshot } from "@/types";
import { buildProcessedContentRows, compareContentRows } from "./content-list";

test("服务端分页结果不在客户端按当前页缺失的选题状态再次筛空", () => {
  const video = {
    id: "video-in-library",
    user_id: "user-1",
    account_id: "account-1",
    video_title: "已入库作品",
    published_at: "2026-10-20T00:00:00Z",
  } as Parameters<typeof buildProcessedContentRows>[0]["queueRows"][number];

  const rows = buildProcessedContentRows({
    queueRows: [video],
    filters: { ...DEFAULT_CONTENT_LIST_FILTERS, topicStatus: "in_library" },
    playCountById: new Map(),
    snapshotMap: new Map(),
    sortField: "published_at",
    sortDir: "desc",
    serverPaginated: true,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.video.id, "video-in-library");
});

test("列表 hook 将服务端分页标记传给当前页呈现计算", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/content/data/content-list.ts"), "utf8");
  assert.match(source, /sortField,\s*sortDir,\s*serverPaginated,\s*\}\);/);
});

test("作品行保留快照中的平均播放占比原始比例", () => {
  const video = {
    id: "video-ratio",
    user_id: "user-1",
    account_id: "account-1",
    video_title: "播放占比作品",
  } as Parameters<typeof buildProcessedContentRows>[0]["queueRows"][number];

  const rows = buildProcessedContentRows({
    queueRows: [video],
    filters: DEFAULT_CONTENT_LIST_FILTERS,
    playCountById: new Map(),
    snapshotMap: new Map([["video-ratio", { avg_play_ratio: 0.25 } as VideoMetricsSnapshot]]),
    sortField: "published_at",
    sortDir: "desc",
  });

  assert.equal(rows[0]?.avgPlayRatio, 0.25);
});

test("单日客户端排序支持播放占比与留存达成（缺失值始终垫底）", () => {
  const low = { publishedTime: 1, avgPlayRatio: 0.12, quality: { contentAchievement: 65 } } as Parameters<typeof compareContentRows>[0];
  const high = { publishedTime: 2, avgPlayRatio: 0.34, quality: { contentAchievement: 120 } } as Parameters<typeof compareContentRows>[0];
  const missing = { publishedTime: 3, avgPlayRatio: null, quality: null } as Parameters<typeof compareContentRows>[0];

  assert.deepEqual(
    [high, missing, low].sort((a, b) => compareContentRows(a, b, "avg_play_ratio", "asc")).map((r) => r.publishedTime),
    [1, 2, 3],
  );
  assert.deepEqual(
    [low, missing, high].sort((a, b) => compareContentRows(a, b, "retention_achievement", "desc")).map((r) => r.publishedTime),
    [2, 1, 3],
  );
});
