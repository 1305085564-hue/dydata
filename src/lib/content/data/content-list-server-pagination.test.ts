import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { DEFAULT_CONTENT_LIST_FILTERS } from "@/app/(app)/admin/content/content-list-filters";
import { buildProcessedContentRows } from "./content-list";

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
