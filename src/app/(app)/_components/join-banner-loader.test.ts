import assert from "node:assert/strict";
import test from "node:test";

import { buildRejectedBanner } from "./join-banner-loader";

test("最近一次处理结果是驳回：带驳回原因（去掉首尾空白，空白视为没写）", () => {
  assert.deepEqual(buildRejectedBanner("u1", { target_team_id: "t1", status: "rejected", review_note: " 名额已满 " }), {
    shouldRender: true, mode: "rejected", userId: "u1", targetTeamId: "t1", reviewNote: "名额已满",
  });
  assert.equal((buildRejectedBanner("u1", { target_team_id: "t1", status: "rejected", review_note: "  " }) as { reviewNote: string | null }).reviewNote, null);
});

test("没有处理过的申请、或最近一次是通过：不显示驳回横幅", () => {
  assert.equal(buildRejectedBanner("u1", null), null);
  assert.equal(buildRejectedBanner("u1", { target_team_id: "t1", status: "approved", review_note: null }), null);
});
