import test from "node:test";
import assert from "node:assert/strict";

import { scopeFeedbackCardMutation } from "./access";

test("反馈卡更新语句同时限定卡片 ID 和目标用户", () => {
  const filters: Array<[string, string]> = [];
  const query = {
    eq(column: string, value: string) {
      filters.push([column, value]);
      return this;
    },
  };

  assert.equal(scopeFeedbackCardMutation(query, "card-1", "user-1"), query);
  assert.deepEqual(filters, [["id", "card-1"], ["target_user_id", "user-1"]]);
});
