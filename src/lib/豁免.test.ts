import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExemptionFields,
  deriveExemptionFormValues,
  formatExemptionDetail,
  getExemptionDatesForMonth,
  getExemptionStateForDate,
  type ExemptionFormValues,
} from "./豁免";

test("单日免交在指定日期生效并返回绿色语义标签", () => {
  const profile = buildExemptionFields({
    userId: "u1",
    mode: "yesterday",
    category: "waive",
    date: "2026-03-20",
    reason: "休市",
  });

  const result = getExemptionStateForDate(profile, "2026-03-20");

  assert.equal(result.isExempt, true);
  assert.equal(result.label, "免交");
  assert.equal(result.category, "waive");
  assert.equal(result.reason, "休市");
});

test("多日请假仅在范围内生效", () => {
  const profile = buildExemptionFields({
    userId: "u2",
    mode: "range",
    category: "leave",
    startDate: "2026-03-20",
    endDate: "2026-03-22",
    reason: "病假",
  });

  assert.equal(getExemptionStateForDate(profile, "2026-03-19").isExempt, false);
  assert.equal(getExemptionStateForDate(profile, "2026-03-21").label, "请假");
  assert.equal(getExemptionStateForDate(profile, "2026-03-23").isExempt, false);
});

test("永久豁免会保留语义分类并投影到 profile", () => {
  const profile = buildExemptionFields({
    userId: "u3",
    mode: "permanent",
    category: "leave",
    reason: "长期病假",
  });

  assert.deepEqual(profile, {
    id: "u3",
    status: "exempt",
    exempt_type: "permanent",
    exempt_start_date: null,
    exempt_end_date: null,
    exempt_reason: "长期病假",
    exemption_category: "leave",
  });
});

test("多日豁免开始日期晚于结束日期时抛错", () => {
  assert.throws(
    () =>
      buildExemptionFields({
        userId: "u4",
        mode: "range",
        category: "waive",
        startDate: "2026-03-22",
        endDate: "2026-03-20",
      }),
    /开始日期不能晚于结束日期/,
  );
});

test("多日豁免少于两天时抛错", () => {
  assert.throws(
    () =>
      buildExemptionFields({
        userId: "u4",
        mode: "range",
        category: "waive",
        startDate: "2026-03-22",
        endDate: "2026-03-22",
      }),
    /多日豁免至少选择2天/,
  );
});

test("清除豁免会还原为正常状态", () => {
  const values: ExemptionFormValues = {
    userId: "u5",
    mode: "none",
    category: "waive",
  };

  assert.deepEqual(buildExemptionFields(values), {
    id: "u5",
    status: "active",
    exempt_type: null,
    exempt_start_date: null,
    exempt_end_date: null,
    exempt_reason: null,
    exemption_category: null,
  });
});

test("已有永久请假可回填到表单", () => {
  assert.deepEqual(
    deriveExemptionFormValues({
      id: "u6",
      status: "exempt",
      exempt_type: "permanent",
      exempt_start_date: null,
      exempt_end_date: null,
      exempt_reason: "长期病假",
      exemption_category: "leave",
    }),
    {
      userId: "u6",
      mode: "permanent",
      category: "leave",
      reason: "长期病假",
    },
  );
});

test("已有单天免交可回填到表单", () => {
  assert.deepEqual(
    deriveExemptionFormValues({
      id: "u7",
      status: "active",
      exempt_type: "temporary",
      exempt_start_date: "2026-03-20",
      exempt_end_date: "2026-03-20",
      exempt_reason: "周末免交",
      exemption_category: "waive",
    }),
    {
      userId: "u7",
      mode: "yesterday",
      category: "waive",
      date: "2026-03-20",
      reason: "周末免交",
    },
  );
});

test("审计详情会包含语义标签和日期模式", () => {
  assert.equal(
    formatExemptionDetail({
      userId: "u8",
      mode: "permanent",
      category: "leave",
      reason: "长期病假",
    }),
    "请假｜长期｜原因：长期病假",
  );

  assert.equal(
    formatExemptionDetail({
      userId: "u9",
      mode: "range",
      category: "waive",
      startDate: "2026-03-20",
      endDate: "2026-03-22",
      reason: "休市",
    }),
    "免交｜多日｜日期：2026-03-20 ~ 2026-03-22｜原因：休市",
  );
});

test("按月生成免交或请假日期集合", () => {
  const buckets = getExemptionDatesForMonth(
    {
      id: "u10",
      status: "active",
      exempt_type: "temporary",
      exempt_start_date: "2026-03-29",
      exempt_end_date: "2026-04-02",
      exempt_reason: "清明假期",
      exemption_category: "leave",
    },
    "2026-04-20",
  );

  assert.deepEqual(buckets.waiveDates, []);
  assert.deepEqual(buckets.leaveDates, ["2026-04-01", "2026-04-02"]);
});

test("宸叉壒鍑嗙殑鍘嗗彶 grant 涔熶細鍦ㄦ湀鍘嗕腑鎸夊厤浜ょ粯鍒?", () => {
  const profile = {
    id: "u11",
    status: "active" as const,
    exempt_type: null,
    exempt_start_date: null,
    exempt_end_date: null,
    exempt_reason: null,
    exemption_category: null,
  };

  const grants = [
    {
      user_id: "u11",
      start_date: "2026-04-02",
      end_date: "2026-04-03",
      grant_type: "range",
      exemption_category: "waive" as const,
      status: "active",
      created_at: "2026-04-04T08:00:00.000Z",
    },
  ];

  const state = getExemptionStateForDate(profile, "2026-04-02", grants);
  const buckets = getExemptionDatesForMonth(profile, "2026-04-20", grants);

  assert.equal(state.isExempt, true);
  assert.equal(state.label, "免交");
  assert.equal(state.category, "waive");
  assert.deepEqual(buckets.waiveDates, ["2026-04-02", "2026-04-03"]);
  assert.deepEqual(buckets.leaveDates, []);
});
