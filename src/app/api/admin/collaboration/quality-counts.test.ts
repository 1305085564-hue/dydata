import assert from "node:assert/strict";
import test from "node:test";
import { countWorkQuality } from "./quality-counts";

test("有效>500，优秀>=30000；恰好500只进入计费基础，缺失不计", () => {
  assert.deepEqual(countWorkQuality([499, 500, 501, 29999, 30000, null].map(play_count => ({ play_count }))), {
    effectiveCount: 3, excellentCount: 1, billingCount: 0,
  });
  assert.equal(countWorkQuality(Array.from({length:26}, () => ({ play_count:500 }))).billingCount, 1);
  assert.equal(countWorkQuality(Array.from({length:26}, () => ({ play_count:null }))).billingCount, 0);
});
test("50条、10低播放、10优秀：每条优秀共算3条，每人只扣一次25", () => {
  const plays = [...Array(10).fill(100), ...Array(30).fill(1000), ...Array(10).fill(30000)];
  assert.deepEqual(countWorkQuality(plays.map(play_count => ({play_count}))), {
    effectiveCount:40, excellentCount:10, billingCount:35,
  });
});
test("空作品及不足基础门槛归零", () => {
  assert.equal(countWorkQuality([]).billingCount,0);
  assert.equal(countWorkQuality([{play_count:30000}]).billingCount,0);
});
