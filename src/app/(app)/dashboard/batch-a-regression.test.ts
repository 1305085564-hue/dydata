import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("成功态提供再交一条入口并切回新建模式", () => {
  const submittedView = read("src/app/(app)/dashboard/form-v2/submitted-view.tsx");
  const panelBody = read("src/components/video-submit/video-submit-panel-body.tsx");
  const panel = read("src/app/(app)/dashboard/video-submit-panel-v2.tsx");

  assert.match(submittedView, /再交一条/);
  assert.match(submittedView, /onCreateAnother/);
  assert.match(panelBody, /onCreateAnother/);
  assert.match(panel, /setRequestedMode\("createAnother"\)/);
});

test("发布时间可修改并把来源与 OCR 原值带入审批链路", () => {
  const resultsSection = read("src/app/(app)/dashboard/form-v2/results-section.tsx");
  const submitController = read("src/app/(app)/dashboard/video-submit-form-v2/submit-controller.ts");
  const appealCard = read("src/components/command-hub/fulfillment-appeal-card.tsx");

  assert.match(resultsSection, /aria-label=\{publishedConfirmed \? "修改发布时间" : "手填发布时间"\}/);
  assert.match(resultsSection, /updateMeta\("publishedAtSource", value === editablePublishedAtValue/);
  assert.match(submitController, /publishedAtSource: meta\.publishedAtSource/);
  assert.match(submitController, /ocrPublishedAtText: meta\.ocrPublishedAtText/);
  assert.match(appealCard, /触发原因：/);
});
