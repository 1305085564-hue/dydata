import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RatingRulesContent, RatingRulesDialog } from "./rating-rules-dialog";
import { BREAKOUT_GRADE_TEXT_CLASS } from "@/lib/breakout-rating";
import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";

const dialogSource = readFileSync(
  resolve(process.cwd(), "src/components/rating-rules/rating-rules-dialog.tsx"),
  "utf8"
);

const collaborationPageSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/collaboration/page.tsx"),
  "utf8"
);

test("作品评级说明综合评级使用互动达成率和留存达成率", () => {
  assert.equal(dialogSource.includes("第四格"), false);
  assert.match(dialogSource, /互动达成率/);
  assert.match(dialogSource, /留存达成率/);
  assert.match(dialogSource, /留存分/);
});

test("作品评级说明内容渲染结果使用统一的两项名称", () => {
  const rendered = renderToStaticMarkup(<RatingRulesContent />);
  assert.equal(rendered.includes("第四格"), false);
  assert.match(rendered, /互动达成率/);
  assert.match(rendered, /留存达成率/);
  assert.match(rendered, /留存分/);
});

test("作品评级说明展示互动达成率和留存达成率", () => {
  assert.match(dialogSource, /互动数据/);
  assert.match(dialogSource, /留存达成率/);
  assert.match(dialogSource, /BREAKOUT_GRADE_THRESHOLDS/);
  assert.match(dialogSource, /KPI_PLAY_FLOOR/);
  assert.match(dialogSource, /KPI_PLAY_GOOD/);
  assert.match(dialogSource, /KPI_PLAY_EXCELLENT/);
  assert.match(dialogSource, /BREAKOUT_GRADE_TEXT_CLASS/);

  const rendered = renderToStaticMarkup(<RatingRulesContent />);

  // 验证现行标准、权重和播放量门槛可见
  assert.match(rendered, /35%/);
  assert.match(rendered, /30%/);
  assert.match(rendered, /20%/);
  assert.match(rendered, /15%/);
  assert.match(rendered, /3\.5%/);
  assert.match(rendered, /25%/);
  assert.match(rendered, /15%/);
  assert.match(rendered, /2,000/);
  assert.match(rendered, /1\.5 万/);
  assert.match(rendered, /80/);
  assert.match(rendered, /60/);
  assert.match(rendered, /100%/);

  // 验证优良普劣使用了规范颜色类
  assert.ok(rendered.includes(BREAKOUT_GRADE_TEXT_CLASS["优"]));
  assert.ok(rendered.includes(BREAKOUT_GRADE_TEXT_CLASS["良"]));
  assert.ok(rendered.includes(BREAKOUT_GRADE_TEXT_CLASS["普"]));
  assert.ok(rendered.includes(BREAKOUT_GRADE_TEXT_CLASS["劣"]));
});

test("协作管理页面挂载了作品评级规则入口", () => {
  assert.match(collaborationPageSource, /RatingRulesDialog/);
  assert.match(collaborationPageSource, /作品评级规则/);
});

test("作品评级说明展示服务端传入的公司留存标准与权重", () => {
  const evaluationStandards = {
    ...DEFAULT_EVALUATION_STANDARDS,
    bounceRate2s: { good: 22, poor: 38 },
    completionRate5s: { good: 72, poor: 42 },
    avgPlayDuration: { good: 52, poor: 12 },
    avgPlayRatio: { good: 32, poor: 14 },
    completionRate: { good: 12, poor: 3 },
    retentionWeights: { bounceRate2s: 40, completionRate5s: 25, avgPlayBundle: 20, completionRate: 15 },
    targets: {
      reviewLikeRate: 4.5,
      dryFavoriteRate: 7.25,
      interactionRate: 6.5,
      followerRate: 1.75,
    },
  };
  const rendered = renderToStaticMarkup(
    <RatingRulesContent evaluationStandards={evaluationStandards} />,
  );

  assert.match(rendered, /好 22%，差 38%/);
  assert.match(rendered, /好 72%，差 42%/);
  assert.match(rendered, /好 52 秒，差 12 秒/);
  assert.match(rendered, /好 32%，差 14%/);
  assert.match(rendered, /40%/);
  assert.match(rendered, /25%/);
  assert.match(rendered, /互动数据好标准为 6\.5%/);
  assert.match(collaborationPageSource, /evaluationStandards/);
});

test("评级规则弹窗把服务端团队基准传给说明内容", () => {
  assert.match(
    dialogSource,
    /<RatingRulesContent evaluationStandards=\{evaluationStandards\} \/>/
  );
});

test("RatingRulesDialog 正常渲染触发器元素", () => {
  const triggerMarkup = renderToStaticMarkup(
    <RatingRulesDialog trigger={<button type="button">点击查看规则</button>} />
  );
  assert.match(triggerMarkup, /点击查看规则/);
});
