import assert from "node:assert/strict";
import test from "node:test";

import {
  userOwnsAccount,
  userOwnsContentItem,
  userOwnsVideo,
} from "./api-resource-access";

function createOwnershipClient(found: boolean) {
  const calls: Array<[string, unknown]> = [];
  const query = {
    select() {
      return this;
    },
    eq(column: string, value: unknown) {
      calls.push([column, value]);
      return this;
    },
    async maybeSingle() {
      return { data: found ? { id: "resource-1" } : null, error: null };
    },
  };

  return {
    client: { from: () => query } as never,
    calls,
  };
}

test("对象归属查询同时限定资源 ID 和当前用户", async () => {
  const contentItem = createOwnershipClient(true);
  assert.equal(await userOwnsContentItem(contentItem.client, "content-1", "user-1"), true);
  assert.deepEqual(contentItem.calls, [["id", "content-1"], ["owner_user_id", "user-1"]]);

  const account = createOwnershipClient(true);
  assert.equal(await userOwnsAccount(account.client, "account-1", "user-1"), true);
  assert.deepEqual(account.calls, [["id", "account-1"], ["profile_id", "user-1"]]);

  const video = createOwnershipClient(false);
  assert.equal(await userOwnsVideo(video.client, "video-1", "user-1"), false);
  assert.deepEqual(video.calls, [["id", "video-1"], ["user_id", "user-1"]]);
});
