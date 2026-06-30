import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeParagraphEditContent } from './paragraph-edit';

test('手工编辑保存时折叠完全重复的整段内容', () => {
  const block = [
    '**（三）重构：终局与掠夺**',
    '钱，从来不是运气带来的。它是认知的战利品，是耐心的变现。',
    '今天刷到这条视频，就是命运给你的最后通牒。',
  ].join('\n');

  assert.equal(normalizeParagraphEditContent(`${block}\n\n${block}`), block);
});

test('手工编辑不会折叠相似但不完全相同的内容', () => {
  const content = [
    '第一段内容用于说明一个完整观点，长度足够触发重复检测。',
    '',
    '第一段内容用于说明另一个完整观点，长度足够触发重复检测。',
  ].join('\n');

  assert.equal(normalizeParagraphEditContent(content), content);
});
