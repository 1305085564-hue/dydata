import assert from "node:assert/strict";
import test from "node:test";

import type { AvailabilityModelFamily, BusinessAssuranceItem } from "@/lib/ai-config/availability";
import { buildModelUsage, familyNeedsAction, formatModelUsage, repairTargetModelId } from "./ai-config-view";

function assurance(partial: Partial<BusinessAssuranceItem> & Pick<BusinessAssuranceItem, "key" | "label">): BusinessAssuranceItem {
  return {
    resolvedModelId: null,
    modelDisplayName: "",
    schedulableChannelCount: 0,
    faultChannelCount: 0,
    totalChannelCount: 0,
    status: "healthy",
    routingStatus: "normal",
    selectedModelId: null,
    preferredModelId: null,
    defaultModelId: "m-default",
    messageKey: "business.normal",
    ...partial,
  };
}

test("去修：正常不给入口；顶班指向自己选的模型；停摆没选模型时指向默认", () => {
  assert.equal(repairTargetModelId(undefined), null);
  assert.equal(repairTargetModelId(assurance({ key: "a", label: "A", selectedModelId: "m1" })), null);
  assert.equal(
    repairTargetModelId(assurance({ key: "a", label: "A", routingStatus: "fallback", selectedModelId: "m1" })),
    "m1",
  );
  assert.equal(repairTargetModelId(assurance({ key: "a", label: "A", routingStatus: "outage" })), "m-default");
  assert.equal(
    repairTargetModelId(assurance({ key: "a", label: "A", routingStatus: "outage", defaultModelId: null })),
    null,
  );
});

test("在给谁用：指定模型的算指定，跟随默认的算默认，全局默认记为兜底", () => {
  const usage = buildModelUsage([
    assurance({ key: "ocr", label: "截图识别", selectedModelId: "m1" }),
    assurance({ key: "copy", label: "文案生成" }),
    assurance({ key: "default", label: "全局默认" }),
  ]);
  assert.deepEqual(usage, { m1: ["截图识别"], "m-default": ["文案生成", "兜底"] });
});

test("在给谁用的说法：两个以内全列，多了只列前两个加总数", () => {
  assert.equal(formatModelUsage(undefined), null);
  assert.equal(formatModelUsage([]), null);
  assert.equal(formatModelUsage(["截图识别"]), "在给 截图识别 用");
  assert.equal(formatModelUsage(["A", "B", "C"]), "在给 A、B 等 3 个功能用");
});

test("要处理：在用且有渠道要处理或没有能用渠道", () => {
  const base = {
    isShelved: true,
    identityCounts: { active: 1, retest: 0, sleeping: 0, invalid: 0, disabled: 0 },
    schedulableChannelCount: 1,
  } as AvailabilityModelFamily;
  assert.equal(familyNeedsAction(base), false);
  assert.equal(familyNeedsAction({ ...base, identityCounts: { ...base.identityCounts, invalid: 1 } }), true);
  assert.equal(familyNeedsAction({ ...base, schedulableChannelCount: 0 }), true);
  assert.equal(familyNeedsAction({ ...base, isShelved: false, schedulableChannelCount: 0 }), false);
});
