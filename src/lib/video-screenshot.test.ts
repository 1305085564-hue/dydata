import test from "node:test";
import assert from "node:assert/strict";
import { resolveReviewScreenshots } from "./video-screenshot";

test("resolveReviewScreenshots: 空快照返回空数组", () => {
  assert.deepEqual(resolveReviewScreenshots(null), []);
  assert.deepEqual(resolveReviewScreenshots(undefined), []);
  assert.deepEqual(
    resolveReviewScreenshots({
      screenshot_urls: null,
      curve_screenshot_url: null,
      retention_screenshot_url: null,
    }),
    [],
  );
});

test("resolveReviewScreenshots: 新提交双图快照（仅 screenshot_urls + retention）正确去重且归位为 2 张", () => {
  const result = resolveReviewScreenshots({
    screenshot_urls: ["https://dydata.cc/flow.png", "https://dydata.cc/retention.png"],
    curve_screenshot_url: null,
    retention_screenshot_url: "https://dydata.cc/retention.png",
  });

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], {
    slot: "curve",
    label: "流量与互动截图",
    subLabel: "流量曲线",
    url: "https://dydata.cc/flow.png",
  });
  assert.deepEqual(result[1], {
    slot: "retention",
    label: "留存完播截图",
    subLabel: "留存脱落",
    url: "https://dydata.cc/retention.png",
  });
});

test("resolveReviewScreenshots: 历史快照（同时含 curve、retention 与 screenshot_urls）绝不产生克隆重复图", () => {
  const result = resolveReviewScreenshots({
    screenshot_urls: ["https://dydata.cc/flow.png", "https://dydata.cc/retention.png"],
    curve_screenshot_url: "https://dydata.cc/flow.png",
    retention_screenshot_url: "https://dydata.cc/retention.png",
  });

  // 严格只有 2 张，绝不再出现第 3、第 4 张伪补充截图
  assert.equal(result.length, 2);
  assert.equal(result[0].url, "https://dydata.cc/flow.png");
  assert.equal(result[1].url, "https://dydata.cc/retention.png");
});

test("resolveReviewScreenshots: 单图快照只输出 1 张图", () => {
  const result = resolveReviewScreenshots({
    screenshot_urls: ["https://dydata.cc/single.png"],
    curve_screenshot_url: null,
    retention_screenshot_url: null,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].slot, "curve");
  assert.equal(result[0].url, "https://dydata.cc/single.png");
});
