import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLocalTargetPlan, type TargetableParagraph } from './target-plan';

const paragraphs: TargetableParagraph[] = [
  { paragraphId: 'p-1', position: 0 },
  { paragraphId: 'p-2', position: 1 },
  { paragraphId: 'p-3', position: 2 },
  { paragraphId: 'p-4', position: 3 },
];

test('自然语言指定第二段时解析为第二段局部修改', () => {
  const plan = resolveLocalTargetPlan({
    prompt: '第二段加强情绪',
    paragraphs,
  });

  assert.equal(plan.scope, 'paragraphs');
  if (plan.scope === 'paragraphs') {
    assert.deepEqual(plan.paragraphIds, ['p-2']);
  }
});

test('手动选中段落优先于自然语言目标', () => {
  const plan = resolveLocalTargetPlan({
    prompt: '第二段加强情绪',
    paragraphs,
    selectedParagraphIds: ['p-3'],
  });

  assert.equal(plan.scope, 'paragraphs');
  if (plan.scope === 'paragraphs') {
    assert.deepEqual(plan.paragraphIds, ['p-3']);
  }
});

test('范围和前后段落指令会解析为多个 paragraphId', () => {
  const rangePlan = resolveLocalTargetPlan({
    prompt: '第2到3段更口语化',
    paragraphs,
  });
  assert.equal(rangePlan.scope, 'paragraphs');
  if (rangePlan.scope === 'paragraphs') {
    assert.deepEqual(rangePlan.paragraphIds, ['p-2', 'p-3']);
  }

  const tailPlan = resolveLocalTargetPlan({
    prompt: '最后两段压短',
    paragraphs,
  });
  assert.equal(tailPlan.scope, 'paragraphs');
  if (tailPlan.scope === 'paragraphs') {
    assert.deepEqual(tailPlan.paragraphIds, ['p-3', 'p-4']);
  }
});

test('明确全文指令保留全文重写能力', () => {
  const plan = resolveLocalTargetPlan({
    prompt: '整篇重新润色一遍',
    paragraphs,
  });

  assert.equal(plan.scope, 'full_document');
});

test('段落目标优先于否定语境里的全文关键词', () => {
  const plan = resolveLocalTargetPlan({
    prompt: '不要全文刷新，只把第二段加强情绪',
    paragraphs,
  });

  assert.equal(plan.scope, 'paragraphs');
  if (plan.scope === 'paragraphs') {
    assert.deepEqual(plan.paragraphIds, ['p-2']);
  }
});

test('模糊指令不默认全篇重写，要求确认目标', () => {
  const plan = resolveLocalTargetPlan({
    prompt: '加强情绪',
    paragraphs,
  });

  assert.equal(plan.scope, 'need_confirmation');
});

test('锁定目标段落不会进入局部生成', () => {
  const plan = resolveLocalTargetPlan({
    prompt: '第二段加强情绪',
    paragraphs: [
      { paragraphId: 'p-1', position: 0 },
      { paragraphId: 'p-2', position: 1, isLocked: true },
    ],
  });

  assert.equal(plan.scope, 'need_confirmation');
});

test('最近聚焦段落可作为弱兜底，但不会覆盖明确全文指令', () => {
  const localPlan = resolveLocalTargetPlan({
    prompt: '更口语一点',
    paragraphs,
    lastSelectedParagraphId: 'p-3',
  });

  assert.equal(localPlan.scope, 'paragraphs');
  if (localPlan.scope === 'paragraphs') {
    assert.deepEqual(localPlan.paragraphIds, ['p-3']);
  }

  const fullPlan = resolveLocalTargetPlan({
    prompt: '整篇重新润色一遍',
    paragraphs,
    lastSelectedParagraphId: 'p-3',
  });

  assert.equal(fullPlan.scope, 'full_document');
});
