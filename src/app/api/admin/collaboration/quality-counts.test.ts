import assert from "node:assert/strict";
import test from "node:test";
import { countWorkQuality } from "./quality-counts";
import { getWorkQuality } from "@/lib/collaboration/work-quality";

test("有效>500，优秀>=30000；恰好500只进入计费基础，缺失不计", () => {
  assert.deepEqual(countWorkQuality([499, 500, 501, 29999, 30000, null].map(play_count => ({ play_count }))), {
    effectiveCount: 3, excellentCount: 1, billingCount: 6,
  });
  assert.equal(countWorkQuality(Array.from({length:26}, () => ({ play_count:500 }))).billingCount, 26);
  assert.equal(countWorkQuality(Array.from({length:26}, () => ({ play_count:null }))).billingCount, 0);
});
test("50条、10低播放、10优秀：优秀作品额外计2条（相当于算3条）", () => {
  const plays = [...Array(10).fill(100), ...Array(30).fill(1000), ...Array(10).fill(30000)];
  assert.deepEqual(countWorkQuality(plays.map(play_count => ({play_count}))), {
    effectiveCount:40, excellentCount:10, billingCount:60,
  });
});
test("空作品归零，单条优秀计3条", () => {
  assert.equal(countWorkQuality([]).billingCount, 0);
  assert.equal(countWorkQuality([{play_count:30000}]).billingCount, 3);
});

test("绩效收据与后端计数共享 >500、恰500、>=30000 和缺失边界", () => {
  assert.deepEqual(getWorkQuality(null), {
    hasPlayData: false,
    isEffective: false,
    isExcellent: false,
    billingCount: 0,
    billingGap: null,
  });
  assert.deepEqual(getWorkQuality(500), {
    hasPlayData: true,
    isEffective: false,
    isExcellent: false,
    billingCount: 1,
    billingGap: 0,
  });
  assert.equal(getWorkQuality(501).isEffective, true);
  assert.equal(getWorkQuality(29_999).billingCount, 1);
  assert.equal(getWorkQuality(30_000).billingCount, 3);
  assert.equal(getWorkQuality(30_000).isExcellent, true);
});
