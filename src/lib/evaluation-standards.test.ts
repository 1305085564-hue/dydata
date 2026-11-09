import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EVALUATION_STANDARDS, parseEvaluationStandards, evaluationTone, evaluationSettingsKey, canEditEvaluationStandards, avgPlayRatioAsPercentagePoints } from "./evaluation-standards";

const draft = () => structuredClone(DEFAULT_EVALUATION_STANDARDS);

test("默认标准保持已确认口径，2秒跳出35正常、超过35才差", () => {
  const standards = draft();
  assert.equal(standards.minPlayCount, 3000);
  assert.deepEqual(standards.avgPlayRatio, { good: 25, poor: 15 });
  assert.equal(evaluationTone("bounceRate2s", 25, 3000, standards), "good");
  assert.equal(evaluationTone("bounceRate2s", 35, 3000, standards), "normal");
  assert.equal(evaluationTone("bounceRate2s", 35.1, 3000, standards), "poor");
  assert.equal(evaluationTone("completionRate5s", 60, 3000, standards), "good");
  assert.equal(evaluationTone("completionRate5s", 50, 3000, standards), "poor");
  assert.equal(evaluationTone("avgPlayRatio", 25, 3000, standards), "good");
  assert.equal(evaluationTone("avgPlayRatio", 15, 3000, standards), "poor");
  assert.equal(evaluationTone("avgPlayRatio", 15.01, 3000, standards), "normal");
  assert.equal(evaluationTone("avgPlayRatio", 25, 2999, standards), "normal");
});

test("平均播放占比快照值按已确认口径从 0–1 转为百分数", () => {
  assert.equal(avgPlayRatioAsPercentagePoints(0.25), 25);
  assert.equal(avgPlayRatioAsPercentagePoints(0.15), 15);
  assert.equal(avgPlayRatioAsPercentagePoints(null), null);
});

test("旧公司标准缺少平均播放占比时只补齐新增默认值", () => {
  const legacy = draft() as Partial<ReturnType<typeof draft>>;
  delete legacy.avgPlayRatio;
  delete legacy.retentionWeights;

  const parsed = parseEvaluationStandards(legacy);

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data.avgPlayRatio, { good: 25, poor: 15 });
    assert.deepEqual(parsed.data.retentionWeights, { bounceRate2s: 35, completionRate5s: 30, avgPlayBundle: 20, completionRate: 15 });
  }
});

test("修改后的标准决定判断，播放不足和缺值不评优劣", () => {
  const standards = draft();
  standards.minPlayCount = 1500;
  standards.completionRate5s = { good: 70, poor: 45 };
  standards.coreAchievement = { good: 110, poor: 50 };
  assert.equal(evaluationTone("completionRate5s", 65, 1500, standards), "normal");
  assert.equal(evaluationTone("completionRate5s", 75, 1499, standards), "normal");
  assert.equal(evaluationTone("coreAchievement", 100, 1500, standards), "normal");
  assert.equal(evaluationTone("coreAchievement", 110, 1500, standards), "good");
  assert.equal(evaluationTone("interactionAchievement", null, 1500, standards), "normal");
});

test("拒绝重叠区间、越界、非数字及缺项，不把非法保存伪装成功", () => {
  const valid = draft();
  assert.equal(parseEvaluationStandards(valid).success, true);
  for (const mutate of [
    (s: typeof valid) => { s.completionRate.good = s.completionRate.poor; },
    (s: typeof valid) => { s.bounceRate2s.good = 40; },
    (s: typeof valid) => { s.completionRate5s.good = 101; },
    (s: typeof valid) => { s.minPlayCount = -1; },
    (s: typeof valid) => { s.targets.reviewLikeRate = 0; },
    (s: typeof valid) => { s.avgPlayDuration.good = Number.NaN; },
    (s: typeof valid) => { s.retentionWeights.avgPlayBundle = 21; },
    (s: typeof valid) => { s.retentionWeights.bounceRate2s = -1; },
  ]) {
    const invalid = draft(); mutate(invalid);
    assert.equal(parseEvaluationStandards(invalid).success, false);
  }
  assert.equal(parseEvaluationStandards({}).success, false);
  assert.equal(parseEvaluationStandards({ ...valid, teamId: "other-company" }).success, false);
});

test("公司键隔离，无公司拒绝；负责人可写，普通管理员即使带权限标记也不可写", () => {
  assert.notEqual(evaluationSettingsKey("company-a"), evaluationSettingsKey("company-b"));
  assert.throws(() => evaluationSettingsKey(null));
  assert.equal(canEditEvaluationStandards({ companyRole: "company_owner", permissions: { manage_system: true } }), true);
  assert.equal(canEditEvaluationStandards({ companyRole: "admin", permissions: { manage_system: true } }), false);
  assert.equal(canEditEvaluationStandards({ companyRole: "member", permissions: {} }), false);
});
