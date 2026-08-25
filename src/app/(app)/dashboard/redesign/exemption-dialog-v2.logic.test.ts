import assert from "node:assert/strict";
import test from "node:test";

import { buildExemptionRequestInput } from "./exemption-dialog-v2.logic";

test("V2 豁免弹窗构造 submitExemptionRequest 所需的 range 契约", () => {
  assert.deepEqual(
    buildExemptionRequestInput({
      dates: ["2026-08-25", "2026-08-26"],
      type: "leave",
      reason: "病假",
    }),
    {
      mode: "range",
      category: "leave",
      dates: ["2026-08-25", "2026-08-26"],
      reason: "病假",
    },
  );
});
