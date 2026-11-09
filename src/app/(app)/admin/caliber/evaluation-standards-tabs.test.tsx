import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";
import {
  EvaluationStandardsTabs,
  createEvaluationStandardsDraft,
  parseEvaluationStandardsDraft,
} from "./evaluation-standards-tabs";

test("输入草稿保留字符串，空值不能在保存校验时变成 0", () => {
  const draft = createEvaluationStandardsDraft(DEFAULT_EVALUATION_STANDARDS);
  draft.bounceRate2s.good = "";

  const parsed = parseEvaluationStandardsDraft(draft);

  assert.equal(draft.bounceRate2s.good, "");
  assert.equal(parsed.success, false);
});

test("平均播放占比好线和差线可编辑并进入保存数据", () => {
  const draft = createEvaluationStandardsDraft(DEFAULT_EVALUATION_STANDARDS);
  draft.avgPlayRatio.good = "30";
  draft.avgPlayRatio.poor = "12";

  const parsed = parseEvaluationStandardsDraft(draft);

  assert.equal(parsed.success, true);
  if (parsed.success) assert.deepEqual(parsed.data.avgPlayRatio, { good: 30, poor: 12 });
});

test("只读查看以文字显示标准，负责人表单显示可编辑输入框", () => {
  const settings = { standards: DEFAULT_EVALUATION_STANDARDS, updatedAt: null };
  const router = {
    back() {},
    forward() {},
    refresh() {},
    push() {},
    replace() {},
    prefetch() {},
    bfcacheId: "test",
  } satisfies AppRouterInstance;
  const readOnly = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <EvaluationStandardsTabs
        calculationContent={<p>现有计算口径</p>}
        initialSettings={settings}
        canEdit={false}
      />
    </AppRouterContext.Provider>,
  );
  const editable = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <EvaluationStandardsTabs
        calculationContent={<p>现有计算口径</p>}
        initialSettings={settings}
        canEdit
      />
    </AppRouterContext.Provider>,
  );

  assert.match(readOnly, /2 秒跳出率/);
  assert.match(readOnly, /平均播放占比/);
  assert.doesNotMatch(readOnly, /<input\b/);
  assert.doesNotMatch(readOnly, /恢复默认/);
  assert.match(editable, /<input\b/);
  assert.match(editable, /平均播放占比好标准/);
  assert.match(editable, /保存标准/);
  assert.match(editable, /恢复默认/);
});
