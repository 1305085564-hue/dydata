import assert from "node:assert/strict";
import test from "node:test";

import { buildContentPageUrl } from "./content-video-navigation";

test("打开指定作品时保留当前列表范围并写入 videoId", () => {
  assert.equal(
    buildContentPageUrl({
      view: "all",
      perspective: "team",
      teamId: "team-1",
      videoId: "video-1",
    }),
    "/admin/content?view=all&scope=team&teamId=team-1&videoId=video-1",
  );
});

test("关闭指定作品时移除 videoId，回到原列表地址", () => {
  assert.equal(
    buildContentPageUrl({
      view: "pending",
      perspective: "company",
      teamId: null,
      videoId: null,
    }),
    "/admin/content?view=pending&scope=company",
  );
});
