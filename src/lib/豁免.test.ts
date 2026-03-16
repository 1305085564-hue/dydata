import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExemptionFields,
  deriveExemptionFormValues,
  formatExemptionDetail,
  getExemptionStateForDate,
  type ExemptionFormValues,
} from "./豁免";

test("临时单天豁免在当天生效", () => {
  const profile = buildExemptionFields({
    userId: "u1",
    mode: "temporary-single",
    date: "2026-03-20",
    reason: "外出",
  });

  const result = getExemptionStateForDate(profile, "2026-03-20");

  assert.equal(result.isExempt, true);
  assert.equal(result.label, "临时 2026-03-20");
  assert.equal(result.reason, "外出");
});

test("临时日期范围仅在范围内生效", () => {
  const profile = buildExemptionFields({
    userId: "u2",
    mode: "temporary-range",
    startDate: "2026-03-20",
    endDate: "2026-03-22",
    reason: "出差",
  });

  assert.equal(getExemptionStateForDate(profile, "2026-03-19").isExempt, false);
  assert.equal(getExemptionStateForDate(profile, "2026-03-21").isExempt, true);
  assert.equal(getExemptionStateForDate(profile, "2026-03-23").isExempt, false);
});

test("永久豁免会转换为兼容旧 status 的字段", () => {
  const profile = buildExemptionFields({
    userId: "u3",
    mode: "permanent",
    reason: "长期停岗",
  });

  assert.deepEqual(profile, {
    id: "u3",
    status: "exempt",
    exempt_type: "permanent",
    exempt_start_date: null,
    exempt_end_date: null,
    exempt_reason: "长期停岗",
  });
});

test("临时豁免开始日期晚于结束日期时抛错", () => {
  assert.throws(
    () =>
      buildExemptionFields({
        userId: "u4",
        mode: "temporary-range",
        startDate: "2026-03-22",
        endDate: "2026-03-20",
      }),
    /开始日期不能晚于结束日期/
  );
});

test("清除豁免会还原为正常状态", () => {
  const values: ExemptionFormValues = {
    userId: "u5",
    mode: "none",
  };

  assert.deepEqual(buildExemptionFields(values), {
    id: "u5",
    status: "active",
    exempt_type: null,
    exempt_start_date: null,
    exempt_end_date: null,
    exempt_reason: null,
  });
});

test("已有永久豁免可回填到表单", () => {
  assert.deepEqual(
    deriveExemptionFormValues({
      id: "u6",
      status: "exempt",
      exempt_type: "permanent",
      exempt_start_date: null,
      exempt_end_date: null,
      exempt_reason: "长期停岗",
    }),
    {
      userId: "u6",
      mode: "permanent",
      reason: "长期停岗",
    }
  );
});

test("已有单天临时豁免可回填到表单", () => {
  assert.deepEqual(
    deriveExemptionFormValues({
      id: "u7",
      status: "active",
      exempt_type: "temporary",
      exempt_start_date: "2026-03-20",
      exempt_end_date: "2026-03-20",
      exempt_reason: "外出",
    }),
    {
      userId: "u7",
      mode: "temporary-single",
      date: "2026-03-20",
      reason: "外出",
    }
  );
});

test("审计详情会格式化永久和临时豁免", () => {
  assert.equal(
    formatExemptionDetail({
      userId: "u8",
      mode: "permanent",
      reason: "长期停岗",
    }),
    "永久豁免｜原因：长期停岗"
  );

  assert.equal(
    formatExemptionDetail({
      userId: "u9",
      mode: "temporary-range",
      startDate: "2026-03-20",
      endDate: "2026-03-22",
      reason: "出差",
    }),
    "临时豁免｜日期：2026-03-20 ~ 2026-03-22｜原因：出差"
  );
});
