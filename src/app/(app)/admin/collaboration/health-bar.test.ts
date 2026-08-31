import assert from "node:assert/strict";
import test from "node:test";

import { calculateAttributionCompleteness } from "./health-bar";

test("岗位仍有待补归属时完整度不能四舍五入成 100%", () => {
  assert.equal(calculateAttributionCompleteness({ total: 201, unattributed: 1 }), 99);
  assert.equal(calculateAttributionCompleteness({ total: 201, unattributed: 0 }), 100);
});
