import test from "node:test";
import assert from "node:assert/strict";

import { pickBatchCandidates } from "./route.ts";

test("pickBatchCandidates 只保留未诊断视频并按上限截断", () => {
  const result = pickBatchCandidates(
    [
      { id: "v1", diagnosed: false },
      { id: "v2", diagnosed: true },
      { id: "v3", diagnosed: false },
    ],
    1
  );

  assert.deepEqual(result, [{ id: "v1", diagnosed: false }]);
});
