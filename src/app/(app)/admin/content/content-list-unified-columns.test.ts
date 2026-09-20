import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./content-list.tsx", import.meta.url), "utf8");

test("视频复盘列表移除互动与完播切换并始终渲染全部指标列", () => {
  assert.doesNotMatch(source, /type ViewMode/);
  assert.doesNotMatch(source, /\bviewMode\b/);
  assert.doesNotMatch(source, /interactiveColClass|completionColClass/);
  assert.doesNotMatch(source, />互动数据</);
  assert.doesNotMatch(source, />完播数据</);

  for (const label of [
    "点赞",
    "评论",
    "分享",
    "收藏",
    "互动率",
    "2s跳出",
    "5s完播",
    "均播",
    "完播",
  ]) {
    assert.match(source, new RegExp(`<span>${label}<\\/span>`));
  }
});

test("异常和腰斩状态使用统一橙色标记", () => {
  assert.match(source, /status === "abnormal"/);
  assert.match(source, /status === "异常"/);
  assert.match(source, /bg-\[#B98A54\]/);
});

test("窄屏列表通过表格容器横向滚动查看全部列", () => {
  assert.match(source, /className="[^"]*overflow-x-auto[^"]*"/);
  assert.match(source, /<table className="[^"]*min-w-\[960px\][^"]*"/);
});
