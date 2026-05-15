import test from "node:test";
import assert from "node:assert/strict";

const loadModule = async () => {
  const mod = await import("./豁免流程").catch(() => null);
  if (!mod) return null;
  return mod as typeof import("./豁免流程");
};

test("老库兼容 helper 会去掉 exemption_category 并识别缺字段报错", async () => {
  const mod = await loadModule();
  assert.ok(mod, "应提供豁免流程模块");

  const request = mod.buildRequestDraft({
    applicantUserId: "user-1",
    teamId: "team-1",
    mode: "yesterday",
    category: "waive",
    reason: "账号封禁",
    today: "2026-04-24",
  });

  assert.deepEqual(mod.stripExemptionCategoryFromRequestDraft(request), {
    applicant_user_id: "user-1",
    team_id: "team-1",
    exemption_type: "yesterday",
    start_date: "2026-04-23",
    end_date: "2026-04-23",
    reason: "账号封禁",
    request_status: "pending",
  });

  assert.equal(
    mod.isMissingExemptionRequestCategoryError({
      message: "Could not find the 'exemption_category' column of 'exemption_request' in the schema cache",
    }),
    true,
  );
  assert.equal(
    mod.isMissingExemptionRequestCategoryError({
      message: "column exemption_request.exemption_category does not exist",
    }),
    true,
  );
  assert.equal(mod.isMissingExemptionRequestCategoryError({ message: "permission denied" }), false);
});
