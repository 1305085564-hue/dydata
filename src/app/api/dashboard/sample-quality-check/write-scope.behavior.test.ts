import assert from "node:assert/strict";
import test from "node:test";
import { buildSampleQualityCheckResponse } from "./route";

for (const scope of [null, { visibleUserIds: ["archived"], activeVisibleUserIds: ["manager"] }]) {
  test(`14：历史只读或范围解析失败不能触发质检写入 ${JSON.stringify(scope)}`, async () => {
    let calledAi = false; let wrote = false;
    const response = await buildSampleQualityCheckResponse({ reportId: "historical" }, {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "archived" } } }) } }) as never,
      createAdminClient: () => ({}) as never,
      buildDataAccessScope: async () => scope as never,
      loadContext: async () => ({ report: { id: "historical", user_id: "archived" } }) as never,
      callAiJson: async () => { calledAi = true; throw new Error("must not run"); },
      syncIssues: async () => { wrote = true; },
      now: () => new Date("2026-11-28T00:00:00Z"),
    });
    assert.equal(response.status, 403);
    assert.equal(calledAi, false);
    assert.equal(wrote, false);
  });
}
