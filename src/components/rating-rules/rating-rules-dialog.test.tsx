import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RatingRulesContent, RatingRulesDialog } from "./rating-rules-dialog";
import {
  BREAKOUT_GRADE_TEXT_CLASS,
  breakoutTargetsFor,
} from "@/lib/breakout-rating";
import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";

const dialogSource = readFileSync(
  resolve(process.cwd(), "src/components/rating-rules/rating-rules-dialog.tsx"),
  "utf8"
);

const collaborationPageSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/collaboration/page.tsx"),
  "utf8"
);

test("作品评级说明组件严禁出现四个内部叫法（达成率/第四格/档位/封顶）", () => {
  const forbiddenPatterns = ["达成率", "第四格", "档位", "封顶"];
  for (const forbidden of forbiddenPatterns) {
    assert.strictEqual(
      dialogSource.includes(forbidden),
      false,
      `源代码中包含禁止出现的内部词汇: ${forbidden}`
    );
  }
});

test("作品评级说明内容渲染结果严禁包含四个内部叫法", () => {
  const rendered = renderToStaticMarkup(<RatingRulesContent />);
  const forbiddenPatterns = ["达成率", "第四格", "档位", "封顶"];
  for (const forbidden of forbiddenPatterns) {
    assert.strictEqual(
      rendered.includes(forbidden),
      false,
      `渲染内容中包含禁止出现的内部词汇: ${forbidden}`
    );
  }
});

test("作品评级说明读取评级标准并动态渲染固定评级规则", () => {
  assert.match(dialogSource, /breakoutTargetsFor/);
  assert.equal(breakoutTargetsFor("review").fourth, 0.02);
  assert.equal(breakoutTargetsFor("dry_goods").fourth, 0.02);
  assert.match(dialogSource, /BREAKOUT_GRADE_THRESHOLDS/);
  assert.match(dialogSource, /KPI_PLAY_FLOOR/);
  assert.match(dialogSource, /KPI_PLAY_GOOD/);
  assert.match(dialogSource, /KPI_PLAY_EXCELLENT/);
  assert.match(dialogSource, /MAX_PULL_GRADES/);
  assert.match(dialogSource, /BREAKOUT_GRADE_TEXT_CLASS/);

  const rendered = renderToStaticMarkup(<RatingRulesContent />);

  // 验证关键动态计算数字在渲染结果中存在
  assert.match(rendered, /3\.5%/);
  assert.match(rendered, /2%/);
  assert.match(rendered, /1%/);
  assert.match(rendered, /5,000/);
  assert.match(rendered, /1\.5 万/);
  assert.match(rendered, /80%/);
  assert.match(rendered, /60%/);
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

test("作品评级说明展示服务端传入的团队达标基准", () => {
  const evaluationStandards = {
    ...DEFAULT_EVALUATION_STANDARDS,
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

  assert.match(rendered, /6\.5%/);
  assert.match(rendered, /7\.25%/);
  assert.match(rendered, /1\.75%/);
  assert.match(rendered, /复盘达标线/);
  assert.match(rendered, /干货达标线/);
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
