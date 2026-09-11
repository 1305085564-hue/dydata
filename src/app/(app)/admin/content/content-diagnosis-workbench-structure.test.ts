import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./content-diagnosis-workbench.tsx", import.meta.url),
  "utf8",
);

test("诊断工作台指定成员候选不只依赖 profiles 入参", () => {
  assert.match(source, /buildComparisonMemberOptions/);
  assert.match(source, /profiles,\s*\n\s*videos: comparisonVideos,\s*\n\s*fallbackProfiles[\s\S]*?\}/);
  assert.match(source, /availableComparisonMembers/);
});

test("诊断工作台缺少本地候选时会异步加载可对比成员", () => {
  assert.match(source, /\/api\/admin\/content\/comparison-members/);
  assert.match(source, /comparisonMembersLoading/);
  assert.match(source, /setFallbackComparisonProfiles/);
});

test("诊断工作台切换视频时清理指定成员和归因状态", () => {
  assert.match(source, /setSelectedRefUserId\(null\)/);
  assert.match(source, /setMultiAttribution\(null\)/);
  assert.match(source, /validSelectedRefUserId/);
});
