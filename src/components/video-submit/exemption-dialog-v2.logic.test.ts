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

test("V2 豁免弹窗支持多日特殊豁免逐日原因过滤与对账", () => {
  assert.deepEqual(
    buildExemptionRequestInput({
      dates: ["2026-08-25", "2026-08-26"],
      type: "waive",
      reason: "特殊豁免申请",
      dateReasons: {
        "2026-08-25": "平台限流  ",
        "2026-08-26": "  排班调休",
        "2026-08-27": "未勾选日期的多余原因应被剔除",
      },
    }),
    {
      mode: "range",
      category: "waive",
      dates: ["2026-08-25", "2026-08-26"],
      reason: "特殊豁免申请",
      dateReasons: {
        "2026-08-25": "平台限流",
        "2026-08-26": "排班调休",
      },
    },
  );
});
