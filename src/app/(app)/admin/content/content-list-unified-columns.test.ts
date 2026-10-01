import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getContentQualityStatusText,
  getContentQualityStatusShortText,
} from "@/lib/collaboration/content-quality-contract";

const source = readFileSync(new URL("./content-list.tsx", import.meta.url), "utf8");

test("视频复盘列表支持全部/互动/完播指标分段切换，综合评级与核心指标常驻", () => {
  assert.match(source, /metricViewMode/);
  assert.match(source, />全部指标</);
  assert.match(source, />互动</);
  assert.match(source, />完播</);

  for (const label of [
    "综合评级",
    "核心指标",
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

test("视频复盘列表空态占位单元格动态与当前视图列数对齐", () => {
  assert.match(source, /colSpan=\{dynamicColSpan\}/);
});

test("异常和腰斩状态使用统一橙色标记", () => {
  assert.match(source, /status === "abnormal"/);
  assert.match(source, /status === "异常"/);
  assert.match(source, /variant: "warning" as const/);
});

test("窄屏列表通过表格容器横向滚动查看全部列", () => {
  assert.match(source, /className="[^"]*overflow-x-auto[^"]*"/);
  assert.match(source, /<table className="[^"]*min-w-\[960px\][^"]*"/);
});

test("未评级原因短文案与长文案同源，未知状态不等于硬编码待采集", () => {
  const unknownStatus = "future_unsupported_status" as unknown as Parameters<typeof getContentQualityStatusShortText>[0];
  const longText = getContentQualityStatusText(unknownStatus);
  const shortText = getContentQualityStatusShortText(unknownStatus);

  assert.equal(shortText, longText, "未知 status 时短文案与长文案同源");
  assert.notEqual(shortText, "待采集", "未知 status 不等于硬编码「待采集」");
  assert.equal(shortText, "数据未就绪");
});

test("content-list.tsx 只调用契约短文案函数，无本地分支与硬编码待采集兜底，无其他·点赞", () => {
  assert.match(source, /getContentQualityStatusShortText/);
  assert.doesNotMatch(source, /"其他·点赞"/);
  assert.doesNotMatch(source, /status === "unlinked"\s*\?\s*"未关联"/);
});
